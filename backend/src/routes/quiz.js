import express from 'express';
import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

// Evaluate a spoken answer against a model answer
router.post('/evaluate-voice-answer', async (req, res) => {
  try {
    const { userAnswer, modelAnswer, question } = req.body;
    
    if (!userAnswer || !modelAnswer || !question) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const prompt = `
      Question: "${question}"
      Model answer: "${modelAnswer}"
      Student's spoken answer: "${userAnswer}"
      
      Score this answer as "correct", "partial", or "wrong" and give one sentence of feedback.
      Respond in JSON format precisely like this: { "result": "correct|partial|wrong", "feedback": "..." }
    `;
    
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });
    
    res.json(JSON.parse(response.choices[0].message.content));
  } catch (err) {
    console.error("Error evaluating voice answer:", err);
    res.status(500).json({ error: "Failed to evaluate answer" });
  }
});

export default router;