from fastapi import FastAPI, File, UploadFile, HTTPException, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict
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


# ─── WebSocket Endpoint for Voice Study Mode ─────────────────────────────────

# Store client states
client_states: Dict[str, dict] = {}

@app.websocket("/ws/chat/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    if client_id not in client_states:
        client_states[client_id] = {"context": "", "history": []}
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            
            if msg_type == "set_context":
                client_states[client_id]["context"] = message.get("content", "")
            elif msg_type == "clear_history":
                client_states[client_id]["history"] = []
            elif msg_type == "text_message":
                user_text = message.get("content", "")
                client_states[client_id]["history"].append({"role": "user", "content": user_text})
                
                # Build prompt
                system_prompt = "You are EduLens AI, an expert educational tutor. "
                if client_states[client_id]["context"]:
                    system_prompt += f"\n\nContext Document Content: {client_states[client_id]['context']}\n"
                    system_prompt += "\nAnswer the user's questions based primarily on the context document provided above. If the document does not contain the answer, use your general knowledge but mention that it's not from the document."
                else:
                    system_prompt += "Help the user study, explain concepts, and answer questions."
                
                # Build messages payload for Groq
                messages = [{"role": "system", "content": system_prompt}]
                messages.extend(client_states[client_id]["history"][-10:]) # Keep last 10 messages for context
                
                # Generate streaming response
                assistant_response = ""
                try:
                    stream = llm_generator.client.chat.completions.create(
                        messages=messages,
                        model=llm_generator.model,
                        temperature=0.7,
                        max_tokens=1024,
                        stream=True
                    )
                    for chunk in stream:
                        content = chunk.choices[0].delta.content
                        if content:
                            assistant_response += content
                            await websocket.send_text(json.dumps({"content": content}))
                except Exception as e:
                    await websocket.send_text(json.dumps({"content": f"\n[Error: {str(e)}]\n"}))
                
                # Send END token
                await websocket.send_text(json.dumps({"content": "__END__"}))
                
                # Save assistant response to history
                if assistant_response:
                    client_states[client_id]["history"].append({"role": "assistant", "content": assistant_response})
                    
    except WebSocketDisconnect:
        print(f"Client {client_id} disconnected")
        # Optional: cleanup state after disconnect if desired
        pass
    except Exception as e:
        print(f"WebSocket Error: {e}")
        try:
            await websocket.close()
        except:
            pass


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)