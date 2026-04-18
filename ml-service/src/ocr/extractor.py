import easyocr
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import io
import re
import os
import base64
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

class TextExtractor:
    def __init__(self):
        # Initialize EasyOCR — falls back to CPU if no GPU
        gpu_available = self._check_gpu()
        self.reader = easyocr.Reader(['en'], gpu=gpu_available)
        self.groq_client = Groq(api_key=os.getenv('GROQ_API_KEY'))
        print(f"✅ OCR initialized (GPU: {gpu_available})")

    def _check_gpu(self):
        try:
            import torch
            return torch.cuda.is_available()
        except:
            return False

    # ─── Image Preprocessing ─────────────────────────────────────────────────
    def _preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Enhance image quality before OCR:
        - Convert to RGB
        - Increase contrast and sharpness
        - Remove noise
        - Resize if too small
        """
        # Convert to RGB
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Resize if image is too small (helps OCR accuracy)
        w, h = image.size
        if w < 800 or h < 800:
            scale = max(800 / w, 800 / h)
            new_w, new_h = int(w * scale), int(h * scale)
            image = image.resize((new_w, new_h), Image.LANCZOS)

        # Increase contrast
        image = ImageEnhance.Contrast(image).enhance(1.8)

        # Increase sharpness
        image = ImageEnhance.Sharpness(image).enhance(2.0)

        # Increase brightness slightly
        image = ImageEnhance.Brightness(image).enhance(1.1)

        # Remove noise with slight blur then sharpen
        image = image.filter(ImageFilter.MedianFilter(size=3))
        image = image.filter(ImageFilter.SHARPEN)

        return image

    # ─── Handwriting Detection ───────────────────────────────────────────────
    def _is_handwritten(self, easyocr_results) -> bool:
        """
        Detect if content is handwritten based on OCR confidence scores.
        Handwritten text typically has lower confidence scores.
        """
        if not easyocr_results:
            return False
        avg_confidence = sum(prob for (_, _, prob) in easyocr_results) / len(easyocr_results)
        return avg_confidence < 0.75  # Below 75% confidence = likely handwritten

    # ─── Groq Vision OCR ─────────────────────────────────────────────────────
    def _groq_vision_ocr(self, image_bytes: bytes) -> str:
        """
        Use Groq LLaMA Vision to extract text from handwritten content.
        Much more accurate for handwriting than EasyOCR.
        """
        try:
            # Convert image to base64
            base64_image = base64.b64encode(image_bytes).decode('utf-8')

            # Detect image format
            image = Image.open(io.BytesIO(image_bytes))
            fmt = image.format or 'JPEG'
            media_type = f"image/{fmt.lower()}"
            if media_type == "image/jpg":
                media_type = "image/jpeg"

            response = self.groq_client.chat.completions.create(
                model="llama-3.2-11b-vision-preview",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{media_type};base64,{base64_image}"
                                }
                            },
                            {
                                "type": "text",
                                "text": """Please extract ALL text from this image exactly as written.
                                Include:
                                - All handwritten text
                                - Printed text
                                - Math equations and formulas
                                - Diagrams labels
                                - Any numbers or symbols
                                
                                Return ONLY the extracted text, nothing else.
                                Preserve the original structure and line breaks."""
                            }
                        ]
                    }
                ],
                max_tokens=2048
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"⚠️  Groq Vision OCR failed: {e}")
            return ""

    # ─── Main Extract Method ─────────────────────────────────────────────────
    def extract(self, image_bytes: bytes) -> dict:
        """
        Extract text from image using:
        1. Preprocessed EasyOCR (always runs)
        2. Groq Vision (runs if handwriting detected or low confidence)
        Returns merged best result.
        """
        # Open and preprocess image
        original_image = Image.open(io.BytesIO(image_bytes))
        processed_image = self._preprocess_image(original_image)

        # Convert processed image back to bytes for EasyOCR
        processed_bytes = io.BytesIO()
        processed_image.save(processed_bytes, format='JPEG', quality=95)
        processed_bytes = processed_bytes.getvalue()

        # Step 1: EasyOCR on preprocessed image
        image_array = np.array(processed_image)
        easyocr_results = self.reader.readtext(image_array, detail=1)

        extracted_data = []
        easy_texts = []

        for (bbox, text, prob) in easyocr_results:
            extracted_data.append({
                'text': text,
                'confidence': float(prob),
                'bbox': [[float(c) for c in point] for point in bbox]
            })
            easy_texts.append(text)

        easy_text = ' '.join(easy_texts)
        easy_text = re.sub(r'\s+', ' ', easy_text).strip()

        # Step 2: Check if handwritten → use Groq Vision
        is_handwritten = self._is_handwritten(easyocr_results)
        groq_text = ""
        used_groq = False

        if is_handwritten or len(easy_text.split()) < 10:
            print("✍️  Handwriting detected — using Groq Vision for better accuracy...")
            groq_text = self._groq_vision_ocr(image_bytes)
            used_groq = True

        # Step 3: Pick best result
        # Use Groq if it extracted more meaningful text
        if used_groq and len(groq_text.split()) > len(easy_text.split()):
            final_text = groq_text
            ocr_method = 'groq_vision'
        else:
            final_text = easy_text
            ocr_method = 'easyocr'

        # If both have text, merge them
        if easy_text and groq_text and ocr_method == 'groq_vision':
            # Use groq as primary but append any unique words from easyocr
            final_text = groq_text

        final_text = re.sub(r'\s+', ' ', final_text).strip()

        return {
            'raw_text': final_text,
            'segments': extracted_data,
            'word_count': len(final_text.split()),
            'has_math': self._detect_math_symbols(final_text),
            'has_code': self._detect_code_patterns(final_text),
            'is_handwritten': is_handwritten,
            'ocr_method': ocr_method,
            'easyocr_text': easy_text,    # Keep both for debugging
            'groq_text': groq_text
        }

    # ─── Pattern Detection ───────────────────────────────────────────────────
    def _detect_math_symbols(self, text: str) -> bool:
        math_patterns = [
            '=', '+', '-', '*', '/', '^', '√', '∫', '∑', '∆', 'π',
            'sin', 'cos', 'tan', 'log', 'lim', 'dx', 'dy', '²', '³',
            '≤', '≥', '≠', '∞', 'α', 'β', 'θ', 'λ', 'μ', 'σ'
        ]
        text_lower = text.lower()
        return any(symbol in text_lower for symbol in math_patterns)

    def _detect_code_patterns(self, text: str) -> bool:
        code_indicators = [
            'def ', 'import ', 'function', 'class ', 'return ',
            'if (', 'for (', 'while (', '{', '}', '//', '/*',
            'print(', 'console.log', '#include', 'public static',
            'var ', 'let ', 'const ', '=>', '::', '->'
        ]
        return any(indicator in text for indicator in code_indicators)