import React, { useState } from 'react';
import { motion } from 'framer-motion';

const Login = ({ onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (email && password) {
        const mockUser = { id: '1', email, name: email.split('@')[0] };
        const mockToken = 'demo_token_' + Date.now();
        onAuthSuccess(mockUser, mockToken);
      } else {
        setError('Please enter email and password');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-950 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <span className="text-4xl">🎓</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">EduLens AI</h1>
          <p className="text-white/50">AI-Powered Learning Assistant</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl p-8 border border-white/10">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-cyan-500 focus:outline-none transition-colors"
                placeholder="student@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-cyan-500 focus:outline-none transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl text-white font-semibold shadow-lg shadow-cyan-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </motion.button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-white/40 text-sm">
              Demo: Use any email/password
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="p-4 bg-white/5 rounded-xl">
            <span className="text-2xl mb-2 block">🤖</span>
            <span className="text-white/60 text-xs">AI Tutor</span>
          </div>
          <div className="p-4 bg-white/5 rounded-xl">
            <span className="text-2xl mb-2 block">🗺️</span>
            <span className="text-white/60 text-xs">Mind Maps</span>
          </div>
          <div className="p-4 bg-white/5 rounded-xl">
            <span className="text-2xl mb-2 block">📝</span>
            <span className="text-white/60 text-xs">Auto Quiz</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;