from groq import Groq
import os
from dotenv import load_dotenv

load_dotenv()

class ContentGenerator:
    def __init__(self):
        self.client = Groq(api_key=os.getenv('GROQ_API_KEY'))
        self.model = "llama-3.3-70b-versatile"  # ✅ Updated from decommissioned llama3-70b-8192

    def generate_explanation(self, image_class, extracted_text, difficulty='intermediate'):
        """
        Generate personalized explanation based on image type and content
        """
        prompts = {
            'math_equation': "Explain this mathematical concept step-by-step. Include the formula, what each variable represents, and a worked example.",
            'physics_diagram': "Explain the physics concept shown in this diagram. Describe what each component represents and the underlying principles.",
            'chemistry_structure': "Explain this chemical structure or reaction. Identify the compounds, bonds, and explain the chemical process.",
            'biology_cell': "Describe this biological structure/cell. Explain the labeled parts and their functions in detail.",
            'history_timeline': "Provide historical context for the events shown. Explain the significance and connections between events.",
            'geography_map': "Analyze this geographical data. Explain the features, patterns, and their real-world implications.",
            'english_grammar': "Explain the grammar rule or literary device shown. Provide examples of correct and incorrect usage.",
            'coding_snippet': "Explain what this code does line-by-line. Identify the programming concepts and best practices used.",
            'handwritten_notes': "Organize and explain these study notes. Create a structured summary with key points highlighted.",
            'textbook_page': "Break down this textbook content into digestible sections. Create a study guide with main concepts and sub-points."
        }

        base_prompt = prompts.get(image_class, "Explain the educational content shown in this image.")

        system_prompt = f"""You are EduLens AI, an expert educational tutor. 
        The user has uploaded a {image_class.replace('_', ' ')}.
        Difficulty level: {difficulty}.
        
        {base_prompt}
        
        If text was extracted from the image, incorporate it into your explanation.
        Structure your response with:
        1. Brief Overview (2-3 sentences)
        2. Detailed Explanation
        3. Key Takeaways (3-5 bullet points)
        4. Real-world Application
        
        Keep it engaging and appropriate for the difficulty level."""

        user_content = f"Extracted text from image: '{extracted_text}'" if extracted_text else "No text extracted from image."

        return self._stream_response(system_prompt, user_content)

    def generate_quiz(self, image_class, extracted_text, explanation, num_questions=5):
        """
        Generate quiz questions based on the content
        """
        system_prompt = f"""Based STRICTLY on the provided document content and the explanation below, 
        generate {num_questions} quiz questions to test understanding. Do NOT use outside knowledge that is not mentioned in the source text.
        
        Format each question as:
        Q[number]: [Question text]
        A) [Option]
        B) [Option]
        C) [Option]
        D) [Option]
        Correct: [Letter]
        Explanation: [Why this is correct based on the text]
        
        Mix question types: conceptual, application, and analysis. Focus solely on the information provided."""


        user_content = f"Content: {explanation}\n\nExtracted text: {extracted_text}"

        return self._stream_response(system_prompt, user_content)

    def generate_study_plan(self, image_class, weak_areas):
        """
        Generate personalized study suggestions
        """
        system_prompt = f"""Based on quiz performance in {image_class.replace('_', ' ')}, 
        create a targeted study plan. Include:
        1. Specific topics to review
        2. Recommended resources (videos, practice problems, readings)
        3. Time allocation suggestions
        4. Practice exercises"""

        user_content = f"Weak areas identified: {', '.join(weak_areas)}" if weak_areas else "No specific weak areas identified."

        return self._stream_response(system_prompt, user_content)

    def _stream_response(self, system_prompt, user_content):
        """
        Generator function for streaming responses
        """
        stream = self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            model=self.model,
            temperature=0.7,
            max_tokens=2048,
            stream=True
        )

        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content