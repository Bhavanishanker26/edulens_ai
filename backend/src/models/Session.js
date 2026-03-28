import mongoose from 'mongoose';

const quizQuestionSchema = new mongoose.Schema({
  question: String,
  options: [String],
  correctAnswer: String,
  userAnswer: String,
  isCorrect: Boolean,
  explanation: String,
  topic: String
});

const sessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: false,  // ✅ Now optional — no crash when userId is null
    default: null
  },
  sessionId: { type: String, required: true, unique: true },
  imageUrl: String,
  classification: {
    class: String,
    confidence: Number
  },
  extractedText: {
    rawText: String,
    wordCount: Number,
    hasMath: Boolean,
    hasCode: Boolean
  },
  explanation: String,
  quiz: [quizQuestionSchema],
  score: { type: Number, default: 0 },
  weakAreas: [String],
  studyPlan: String,
  createdAt: { type: Date, default: Date.now },
  completedAt: Date
});

export default mongoose.model('Session', sessionSchema);