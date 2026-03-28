from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import uvicorn
import os
import io
import json
import numpy as np

# PDF support
import fitz  # PyMuPDF
from PIL import Image

from src.classification.model import ImageClassifier
from src.ocr.extractor import TextExtractor
from src.llm.generator import ContentGenerator

app = FastAPI(title="EduLens AI - ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

classifier = None
ocr_extractor = None
llm_generator = None


# ─── Custom JSON Encoder ─────────────────────────────────────────────────────
# Fixes: TypeError: Object of type int32/float32/ndarray is not JSON serializable

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)

def safe_json_dumps(obj):
    """json.dumps that handles numpy types safely."""
    return json.dumps(obj, cls=NumpyEncoder)


# ─── Startup ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def load_models():
    global classifier, ocr_extractor, llm_generator
    try:
        model_path = os.getenv('MODEL_PATH', 'models/best_model.pth')
        classifier = ImageClassifier(model_path=model_path)
        ocr_extractor = TextExtractor()
        llm_generator = ContentGenerator()
        print("✅ All models loaded successfully")
    except Exception as e:
        print(f"❌ Error loading models: {e}")
        raise


# ─── PDF Helpers ─────────────────────────────────────────────────────────────

def pdf_to_image_bytes(pdf_bytes: bytes) -> bytes:
    """Convert the first page of a PDF to JPEG bytes."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    mat = fitz.Matrix(2.0, 2.0)  # 2x resolution for better OCR
    pix = page.get_pixmap(matrix=mat)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="JPEG", quality=95)
    doc.close()
    return img_bytes.getvalue()


def extract_all_pdf_text(pdf_bytes: bytes) -> str:
    """Extract raw text from all pages of a PDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    full_text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return full_text.strip()


# ─── Main Process Endpoint ───────────────────────────────────────────────────

@app.post("/process")
async def process_file(
    file: UploadFile = File(...),
    difficulty: str = Form("intermediate"),
    generate_quiz: bool = Form(True)
):
    """
    Accepts image/* or application/pdf.
    Returns SSE stream: classification → ocr → explanation → quiz
    """
    try:
        contents = await file.read()

        if len(contents) > 50 * 1024 * 1024:  # ✅ Increased to 50MB for large PDFs
            raise HTTPException(400, "File too large (max 10MB)")

        is_pdf = file.content_type == 'application/pdf'
        pdf_text = None

        if is_pdf:
            try:
                image_bytes = pdf_to_image_bytes(contents)
                pdf_text = extract_all_pdf_text(contents)
            except Exception as e:
                raise HTTPException(400, f"Failed to process PDF: {str(e)}")
        elif file.content_type and file.content_type.startswith('image/'):
            image_bytes = contents
        else:
            raise HTTPException(400, "File must be an image or PDF")

        # Step 1: Classify
        classification = classifier.predict(image_bytes)

        # Step 2: OCR
        ocr_result = ocr_extractor.extract(image_bytes)

        # Merge PDF text with OCR for better coverage
        if is_pdf and pdf_text:
            existing = ocr_result.get('raw_text', '')
            merged = (existing + '\n' + pdf_text).strip()
            ocr_result['raw_text'] = merged
            ocr_result['word_count'] = len(merged.split())
            ocr_result['source'] = 'pdf'

        # Step 3: Stream response
        async def generate_response():
            # ✅ Use safe_json_dumps everywhere to handle numpy types
            yield f"data: {safe_json_dumps({'type': 'classification', 'data': classification})}\n\n"
            yield f"data: {safe_json_dumps({'type': 'ocr', 'data': ocr_result})}\n\n"

            explanation_chunks = []
            yield 'data: {"type": "explanation_start"}\n\n'

            for chunk in llm_generator.generate_explanation(
                classification['class'],
                ocr_result['raw_text'],
                difficulty
            ):
                explanation_chunks.append(chunk)
                yield f"data: {safe_json_dumps({'type': 'explanation_chunk', 'content': chunk})}\n\n"

            full_explanation = ''.join(explanation_chunks)
            yield 'data: {"type": "explanation_end"}\n\n'

            if generate_quiz:
                yield 'data: {"type": "quiz_start"}\n\n'
                quiz_chunks = []

                for chunk in llm_generator.generate_quiz(
                    classification['class'],
                    ocr_result['raw_text'],
                    full_explanation
                ):
                    quiz_chunks.append(chunk)
                    yield f"data: {safe_json_dumps({'type': 'quiz_chunk', 'content': chunk})}\n\n"

                full_quiz = ''.join(quiz_chunks)
                yield f"data: {safe_json_dumps({'type': 'quiz_end', 'full_quiz': full_quiz})}\n\n"

            yield 'data: {"type": "complete"}\n\n'

        return StreamingResponse(
            generate_response(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/study-plan")
async def generate_study_plan(request: dict):
    try:
        image_class = request.get('image_class', 'general')
        weak_areas = request.get('weak_areas', [])
        plan = llm_generator.generate_study_plan(image_class, weak_areas)
        return {"plan": plan}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "models_loaded": all([classifier, ocr_extractor, llm_generator])
    }


@app.get("/classes")
async def get_classes():
    if classifier:
        return {"classes": classifier.classes}
    return {"classes": []}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)