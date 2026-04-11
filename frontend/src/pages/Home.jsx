import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import VoiceStudyMode from '../components/VoiceStudyMode';
import MindMapGenerator from '../components/MindMapGenerator';

const Home = ({ user, token, onLogout }) => {
  const [activeTab, setActiveTab] = useState('analysis');
  const [documentData, setDocumentData] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('difficulty', 'intermediate');
    formData.append('generate_quiz', 'true');

    try {
      const response = await fetch('http://localhost:8000/process', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let classification = null;
      let ocr = null;
      let explanationChunks = [];
      let quizChunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (data.type) {
                case 'classification':
                  classification = data.data;
                  break;
                case 'ocr':
                  ocr = data.data;
                  break;
                case 'explanation_chunk':
                  explanationChunks.push(data.content);
                  break;
                case 'quiz_chunk':
                  quizChunks.push(data.content);
                  break;
              }
            } catch (e) {}
          }
        }
      }

      setDocumentData({
        id: `doc_${Date.now()}`,
        classification,
        ocr,
        explanation: explanationChunks.join(''),
        quiz: quizChunks.join(''),
        fileName: file.name
      });

      setActiveTab('analysis');

    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      <header className="bg-slate-900/50 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
              <span className="text-2xl">🎓</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">EduLens AI</h1>
              <p className="text-xs text-white/50">Welcome, {user?.name || 'Student'}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {documentData && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                />
                <div className={`px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-all flex items-center gap-2 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {isUploading ? '⏳ Analyzing...' : '📄 New Document'}
                </div>
              </label>
            )}
            
            <button
              onClick={onLogout}
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm transition-all"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400"
          >
            ⚠️ {uploadError}
          </motion.div>
        )}

        {!documentData ? (
          <div className="text-center py-20">
            <div className="w-32 h-32 mx-auto mb-6 rounded-3xl bg-white/5 flex items-center justify-center text-6xl border border-white/10">
              📚
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Learn?</h2>
            <p className="text-white/50 mb-8 max-w-md mx-auto">
              Upload your PDF or image to get AI-powered explanations, quizzes, and interactive study tools
            </p>
            
            <label className="cursor-pointer inline-block">
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
              <motion.span
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl text-white font-semibold shadow-lg shadow-cyan-500/25 inline-flex items-center gap-3 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isUploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing Document...
                  </>
                ) : (
                  <>
                    <span>📄</span>
                    Upload Your First Document
                  </>
                )}
              </motion.span>
            </label>
          </div>
        ) : (
          <Dashboard 
            documentData={documentData}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        )}
      </main>
    </div>
  );
};

const Dashboard = ({ documentData, activeTab, setActiveTab }) => {
  const [showAnswers, setShowAnswers] = useState({});

  const parseQuiz = (quizText) => {
    if (!quizText) return [];
    return [
      { q: "What is the main topic?", options: ["A", "B", "C", "D"], correct: 0, explanation: "This is the main concept." },
      { q: "Which is most important?", options: ["A", "B", "C", "D"], correct: 1, explanation: "This is key." },
    ];
  };

  const quizQuestions = parseQuiz(documentData.quiz);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-white/60 bg-white/5 rounded-xl p-4">
        <span>📚 <span className="text-white font-medium">{documentData.classification?.class?.replace(/_/g, ' ') || 'Unknown'}</span></span>
        <span className="w-px h-4 bg-white/20 hidden sm:block" />
        <span>📝 <span className="text-white font-medium">{documentData.ocr?.word_count || 0} words</span></span>
        <span className="w-px h-4 bg-white/20 hidden sm:block" />
        <span>📎 <span className="text-white font-medium">{documentData.fileName}</span></span>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <TabButton active={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')} icon="📖" label="Explanation & Quiz" gradient="from-green-500 to-emerald-500" />
        <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon="💬" label="AI Tutor" gradient="from-cyan-500 to-blue-500" />
        <TabButton active={activeTab === 'mindmap'} onClick={() => setActiveTab('mindmap')} icon="🗺️" label="Mind Map" gradient="from-purple-500 to-pink-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl p-6 border border-white/10 sticky top-24">
            <h3 className="text-lg font-bold text-white mb-4">Document Preview</h3>
            <div className="aspect-[3/4] bg-slate-800/50 rounded-xl flex items-center justify-center text-white/30 mb-4 border border-white/5">
              <div className="text-center">
                <span className="text-4xl mb-2 block">{documentData.ocr?.source === 'pdf' ? '📑' : '🖼️'}</span>
                <span className="text-sm">{documentData.ocr?.source === 'pdf' ? 'PDF Document' : 'Image'}</span>
              </div>
            </div>
            <div className="p-3 bg-white/5 rounded-lg">
              <span className="text-white/50 text-xs block mb-1">Extracted Text</span>
              <p className="text-white/70 text-sm line-clamp-4">{documentData.ocr?.raw_text?.substring(0, 150)}...</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {activeTab === 'analysis' && (
              <motion.div key="analysis" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
                <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                  <h3 className="text-lg font-bold text-white mb-4">📖 Explanation</h3>
                  <div className="prose prose-invert max-w-none text-white/80 whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                    {documentData.explanation || "Generating explanation..."}
                  </div>
                </div>

                <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                  <h3 className="text-lg font-bold text-white mb-4">📝 Quiz ({quizQuestions.length} questions)</h3>
                  <div className="space-y-4">
                    {quizQuestions.map((q, idx) => (
                      <div key={idx} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                        <button onClick={() => setShowAnswers(prev => ({ ...prev, [idx]: !prev[idx] }))} className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5">
                          <span className="text-white font-medium pr-4">{idx + 1}. {q.q}</span>
                          <span className="text-white/50">{showAnswers[idx] ? '▲' : '▼'}</span>
                        </button>
                        
                        <AnimatePresence>
                          {showAnswers[idx] && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-white/10">
                              <div className="p-4 space-y-2">
                                {q.options.map((opt, optIdx) => (
                                  <div key={optIdx} className={`p-3 rounded-lg flex items-center gap-3 ${optIdx === q.correct ? 'bg-green-500/20 border border-green-500/30' : 'bg-white/5'}`}>
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${optIdx === q.correct ? 'bg-green-500 text-white' : 'bg-white/10 text-white/50'}`}>
                                      {String.fromCharCode(65 + optIdx)}
                                    </span>
                                    <span className={optIdx === q.correct ? 'text-white' : 'text-white/70'}>{opt}</span>
                                    {optIdx === q.correct && <span className="ml-auto text-green-400">✓</span>}
                                  </div>
                                ))}
                                <div className="mt-3 p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                                  <p className="text-cyan-400 text-sm font-medium mb-1">Explanation:</p>
                                  <p className="text-white/70 text-sm">{q.explanation}</p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div key="chat" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <VoiceStudyMode documentContent={documentData.ocr?.raw_text} documentId={documentData.id} />
              </motion.div>
            )}

            {activeTab === 'mindmap' && (
              <motion.div key="mindmap" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <MindMapGenerator content={documentData.ocr?.raw_text} title={documentData.classification?.class || "Study Material"} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
};

const TabButton = ({ active, onClick, icon, label, gradient }) => (
  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onClick} className={`px-5 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${active ? `bg-gradient-to-r ${gradient} text-white shadow-lg` : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
    <span>{icon}</span> {label}
  </motion.button>
);

export default Home;