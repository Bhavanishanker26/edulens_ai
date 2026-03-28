import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, FileText, HelpCircle, CheckCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import ReactMarkdown from 'react-markdown';

export const StreamingContent = () => {
  const { streamedContent, isProcessing, currentSession } = useAppStore();
  const explanationRef = useRef(null);

  // Auto-scroll explanation
  useEffect(() => {
    if (explanationRef.current) {
      explanationRef.current.scrollTop = explanationRef.current.scrollHeight;
    }
  }, [streamedContent.explanation]);

  // ✅ Only show anything if we have a session OR actual content
  const hasContent =
    streamedContent.classification ||
    streamedContent.ocr ||
    streamedContent.explanation ||
    streamedContent.quiz;

  // ✅ Only show loading if BOTH processing AND a session exists (file was actually submitted)
  const showLoading = isProcessing && currentSession;

  if (!hasContent && !showLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <BookOpen size={48} className="mb-3 opacity-30" />
        <p className="text-lg font-medium">Upload a file to get started</p>
        <p className="text-sm mt-1">Supports PDF, PNG, JPG, JPEG, WEBP</p>
      </div>
    );
  }

  const renderClassification = () => {
    if (!streamedContent.classification) return null;
    const { class: className, confidence } = streamedContent.classification;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 rounded-xl mb-4"
      >
        <div className="flex items-center gap-3">
          <BookOpen size={24} />
          <div>
            <p className="text-sm opacity-90">Detected Subject</p>
            <p className="text-lg font-bold capitalize">{className.replace('_', ' ')}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold">{(confidence * 100).toFixed(1)}%</p>
            <p className="text-xs opacity-90">confidence</p>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderOCR = () => {
    if (!streamedContent.ocr) return null;
    const { raw_text, word_count, has_math, has_code } = streamedContent.ocr;

    if (!raw_text) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-50 border border-gray-200 p-4 rounded-xl mb-4"
      >
        <div className="flex items-center gap-2 mb-2 text-gray-700">
          <FileText size={20} />
          <span className="font-semibold">Extracted Text</span>
          <span className="text-sm text-gray-500 ml-auto">{word_count} words</span>
        </div>
        <p className="text-gray-800 text-sm leading-relaxed line-clamp-3">{raw_text}</p>
        <div className="flex gap-2 mt-2">
          {has_math && (
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
              Math Detected
            </span>
          )}
          {has_code && (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
              Code Detected
            </span>
          )}
        </div>
      </motion.div>
    );
  };

  const renderExplanation = () => {
    // ✅ Only show skeleton if actively processing AND no explanation yet
    if (!streamedContent.explanation && showLoading) {
      return (
        <div className="bg-white border-2 border-blue-100 p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-blue-600 font-semibold">Generating explanation...</span>
          </div>
          <div className="space-y-2">
            {[80, 100, 70, 90].map((width, i) => (
              <div
                key={i}
                className="h-4 bg-gray-200 rounded animate-pulse"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </div>
      );
    }

    if (!streamedContent.explanation) return null;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white border-2 border-blue-100 p-6 rounded-xl shadow-sm"
      >
        <div className="flex items-center gap-2 mb-4 text-blue-600">
          <CheckCircle size={24} />
          <h3 className="text-xl font-bold">Explanation</h3>
        </div>
        <div
          ref={explanationRef}
          className="prose prose-blue max-w-none max-h-96 overflow-y-auto"
        >
          <ReactMarkdown>{streamedContent.explanation}</ReactMarkdown>
        </div>
      </motion.div>
    );
  };

  const renderQuiz = () => {
    if (!streamedContent.quiz) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-100 p-6 rounded-xl"
      >
        <div className="flex items-center gap-2 mb-4 text-purple-700">
          <HelpCircle size={24} />
          <h3 className="text-xl font-bold">Test Your Knowledge</h3>
        </div>
        <div className="prose prose-purple max-w-none">
          <ReactMarkdown>{streamedContent.quiz}</ReactMarkdown>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-4">
      {renderClassification()}
      {renderOCR()}
      {renderExplanation()}
      {renderQuiz()}
    </div>
  );
};