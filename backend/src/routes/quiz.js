// backend/routes/quiz.js — new endpoint
router.post('/evaluate-voice-answer', async (req, res) => {
  const { userAnswer, modelAnswer, question } = req.body;
  
  const prompt = `
    Question: "${question}"
    Model answer: "${modelAnswer}"
    Student's spoken answer: "${userAnswer}"
    
    Score this answer as "correct", "partial", or "wrong" and give one sentence of feedback.
    Respond in JSON: { "result": "correct|partial|wrong", "feedback": "..." }
  `;
  
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  });
  
  res.json(JSON.parse(response.choices[0].message.content));
});