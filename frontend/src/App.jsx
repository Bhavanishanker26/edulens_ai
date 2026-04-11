import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('edulens_token');
    const savedUser = localStorage.getItem('edulens_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Failed to parse saved user:', e);
        localStorage.removeItem('edulens_token');
        localStorage.removeItem('edulens_user');
      }
    }
    setLoading(false);
  }, []);

  const handleAuthSuccess = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('edulens_token', userToken);
    localStorage.setItem('edulens_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    localStorage.removeItem('edulens_token');
    localStorage.removeItem('edulens_user');
    setUser(null);
    setToken(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-950 flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            user ? <Navigate to="/" replace /> : <Login onAuthSuccess={handleAuthSuccess} />
          }
        />
        <Route
          path="/"
          element={
            user ? (
              <Home user={user} token={token} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;