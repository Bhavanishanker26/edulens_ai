import React, { useState } from 'react';
import { ImageUpload } from '../components/ImageUpload';
import { StreamingContent } from '../components/StreamingContent';
import { useAppStore } from '../store/useAppStore';
import { Sparkles, History, Settings, LogOut, User, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const Home = ({ user, token, onLogout }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const {
    isProcessing,
    setIsProcessing,
    resetStreamedContent,
    updateStreamedContent,
    setCurrentSession,
    preferences,
    setPreferences
  } = useAppStore();

  const handleImageSelected = async (file) => {
    if (!file) { setSelectedFile(null); return; }
    setSelectedFile(file);
    await processFile(file, preferences.difficulty);
  };

  // ✅ Reprocess when difficulty changes
  const handleDifficultyChange = async (level) => {
    setPreferences({ difficulty: level });
    if (selectedFile) {
      await processFile(selectedFile, level);
    }
  };

  const processFile = async (file, difficulty) => {
    setIsProcessing(true);
    resetStreamedContent();

    try {
      const formData = new FormData();
      if (file.type === 'application/pdf') {
        formData.append('file', file);
      } else {
        formData.append('image', file);
      }
      formData.append('difficulty', difficulty); // ✅ Use passed difficulty
      if (user?.id) formData.append('userId', user.id);

      const response = await fetch(`${API_URL}/process`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const sessionId = response.headers.get('X-Session-ID');
      setCurrentSession({ sessionId });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (data.type) {
                case 'classification': updateStreamedContent('classification', data.data); break;
                case 'ocr': updateStreamedContent('ocr', data.data); break;
                case 'explanation_chunk': updateStreamedContent('explanation', data.content); break;
                case 'quiz_chunk': updateStreamedContent('quiz', data.content); break;
              }
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      console.error('Processing error:', error);
      alert('Failed to process file. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Sparkles className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                EduLens AI
              </h1>
              <p className="text-sm text-gray-500">Visual Learning Assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full">
                <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <User size={14} className="text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700">{user.name}</span>
              </div>
            )}
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <History size={22} className="text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <Settings size={22} className="text-gray-600" />
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-sm font-medium"
              >
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-xl p-6"
            >
              <h2 className="text-xl font-bold text-gray-800 mb-6">
                Upload Your Study Material
              </h2>
              <ImageUpload
                onImageSelected={handleImageSelected}
                isProcessing={isProcessing}
              />

              {/* Difficulty Selector */}
              <div className="mt-6 flex items-center justify-center gap-4">
                <span className="text-sm text-gray-600">Difficulty:</span>
                <div className="flex bg-gray-100 rounded-lg p-1">
                  {['beginner', 'intermediate', 'advanced'].map((level) => (
                    <button
                      key={level}
                      onClick={() => handleDifficultyChange(level)}
                      disabled={isProcessing}
                      className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-all ${
                        preferences.difficulty === level
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* ✅ Re-analyze button shown when file is loaded */}
              {selectedFile && !isProcessing && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 flex justify-center"
                >
                  <button
                    onClick={() => processFile(selectedFile, preferences.difficulty)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
                  >
                    <RefreshCw size={16} />
                    Re-analyze with {preferences.difficulty} level
                  </button>
                </motion.div>
              )}

              {/* Processing indicator */}
              {isProcessing && (
                <div className="mt-4 flex items-center justify-center gap-2 text-blue-600 text-sm">
                  <div className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                  <span>Analyzing at {preferences.difficulty} level...</span>
                </div>
              )}
            </motion.div>
          </div>

          {/* Right Column - Results */}
          <div>
            <StreamingContent />
          </div>
        </div>
      </main>
    </div>
  );
};