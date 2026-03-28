import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import FormData from 'form-data';
import axios from 'axios';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import authRoutes from './routes/auth.js';

import User from './models/User.js';
import Session from './models/Session.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/edulens')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// ✅ Auth routes
app.use('/api/auth', authRoutes);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image or PDF files are allowed'), false);
    }
  }
});

const uploadAny = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 1 }
]);

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

function parseUserId(rawId) {
  if (!rawId) return null;
  if (mongoose.Types.ObjectId.isValid(rawId)) {
    return new mongoose.Types.ObjectId(rawId);
  }
  return null;
}

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const mlHealth = await axios.get(`${ML_SERVICE_URL}/health`);
    res.json({
      backend: 'healthy',
      ml_service: mlHealth.data,
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(503).json({ backend: 'healthy', ml_service: 'unreachable', error: error.message });
  }
});

// Process image or PDF
app.post('/api/process', uploadAny, async (req, res) => {
  try {
    const fileObj = (req.files?.image?.[0]) || (req.files?.file?.[0]);
    if (!fileObj) return res.status(400).json({ error: 'No file uploaded' });

    const sessionId = uuidv4();
    const difficulty = req.body.difficulty || 'intermediate';
    const userId = parseUserId(req.body.userId);

    const session = new Session({
      userId,
      sessionId,
      imageUrl: `uploads/${sessionId}_${fileObj.originalname}`
    });
    await session.save();

    const formData = new FormData();
    formData.append('file', fileObj.buffer, {
      filename: fileObj.originalname,
      contentType: fileObj.mimetype
    });
    formData.append('difficulty', difficulty);
    formData.append('generate_quiz', 'true');

    const mlResponse = await axios.post(`${ML_SERVICE_URL}/process`, formData, {
      headers: formData.getHeaders(),
      responseType: 'stream'
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-ID', sessionId);

    let fullExplanation = '';
    let classification = null;
    let ocrResult = null;

    mlResponse.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            switch (data.type) {
              case 'classification': classification = data.data; break;
              case 'ocr': ocrResult = data.data; break;
              case 'explanation_chunk': fullExplanation += data.content; break;
            }
            res.write(line + '\n\n');
          } catch (e) { res.write(line + '\n\n'); }
        }
      }
    });

    mlResponse.data.on('end', async () => {
      try {
        await Session.findOneAndUpdate(
          { sessionId },
          {
            classification,
            extractedText: {
              rawText: ocrResult?.raw_text || '',
              wordCount: ocrResult?.word_count || 0,
              hasMath: ocrResult?.has_math || false,
              hasCode: ocrResult?.has_code || false
            },
            explanation: fullExplanation,
          }
        );
      } catch (dbErr) { console.error('DB update error:', dbErr); }
      res.end();
    });

    mlResponse.data.on('error', (err) => {
      console.error('Stream error:', err);
      res.status(500).end();
    });

  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ error: 'Processing failed', details: error.message });
  }
});

// Submit quiz answers
app.post('/api/quiz/submit', async (req, res) => {
  try {
    const { sessionId, answers } = req.body;
    const session = await Session.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    let correct = 0;
    const weakAreas = [];
    const processedQuiz = session.quiz.map((q, idx) => {
      const userAnswer = answers[idx];
      const isCorrect = userAnswer === q.correctAnswer;
      if (isCorrect) correct++;
      else weakAreas.push(q.topic || 'general');
      return { ...q.toObject(), userAnswer, isCorrect };
    });

    const score = processedQuiz.length > 0 ? (correct / processedQuiz.length) * 100 : 0;
    const studyPlanResponse = await axios.post(`${ML_SERVICE_URL}/study-plan`, {
      image_class: session.classification?.class,
      weak_areas: [...new Set(weakAreas)]
    });

    await Session.findOneAndUpdate(
      { sessionId },
      { quiz: processedQuiz, score, weakAreas: [...new Set(weakAreas)], studyPlan: studyPlanResponse.data.plan, completedAt: new Date() }
    );

    res.json({ score, totalQuestions: processedQuiz.length, correctAnswers: correct, weakAreas: [...new Set(weakAreas)], studyPlan: studyPlanResponse.data.plan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user history
app.get('/api/history/:userId', async (req, res) => {
  try {
    const userId = parseUserId(req.params.userId);
    if (!userId) return res.status(400).json({ error: 'Invalid userId format' });
    const history = await Session.find({ userId }).sort({ createdAt: -1 }).limit(50);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session details
app.get('/api/session/:sessionId', async (req, res) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend server running on port ${PORT}`));