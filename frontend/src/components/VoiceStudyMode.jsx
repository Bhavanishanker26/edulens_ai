import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const VoiceStudyMode = ({ documentContent, documentId }) => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const ws = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const clientId = documentId || `user_${Math.random().toString(36).substr(2, 9)}`;
    const wsUrl = `ws://localhost:8000/ws/chat/${clientId}`;
    
    ws.current = new WebSocket(wsUrl);
    
    ws.current.onopen = () => {
      setIsConnected(true);
      if (documentContent && documentContent.length > 50) {
        let contentToSend = documentContent;
        if (contentToSend.length > 8000) {
          contentToSend = contentToSend.substring(0, 8000) + "\n\n[...Context Truncated for Voice Mode]";
        }
        ws.current.send(JSON.stringify({
          type: 'set_context',
          content: contentToSend
        }));
      }
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.content === '__END__') {
          setIsSpeaking(false);
          return;
        }
        
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.isComplete) {
            return [...prev.slice(0, -1), { ...lastMsg, content: lastMsg.content + data.content }];
          }
          return [...prev, { role: 'assistant', content: data.content, isComplete: false, timestamp: new Date().toLocaleTimeString() }];
        });
      } catch (err) {
        console.error('WebSocket error:', err);
      }
    };

    ws.current.onclose = () => setIsConnected(false);

    return () => {
      ws.current?.close();
    };
  }, [documentContent, documentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (text) => {
    if (!text?.trim() || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    
    setMessages(prev => [...prev, { role: 'user', content: text.trim(), isComplete: true, timestamp: new Date().toLocaleTimeString() }]);
    setIsSpeaking(true);
    setInputText('');
    ws.current.send(JSON.stringify({ type: 'text_message', content: text.trim() }));
  };

  const clearChat = () => {
    setMessages([]);
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'clear_history' }));
    }
  };

  return (
    <div className="h-[600px] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-white/5 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center justify-center ${isSpeaking ? 'animate-pulse' : ''}`}>
            <span className="text-xl">🤖</span>
          </div>
          <div>
            <h3 className="text-white font-bold">AI Study Buddy</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-white/50">{isConnected ? 'Online' : 'Offline'}</span>
              {documentContent && <span className="text-cyan-400 ml-2">• Document loaded</span>}
            </div>
          </div>
        </div>
        
        <button onClick={clearChat} className="p-2 rounded-full bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 transition-colors">
          🗑️
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-white/40 mt-20">
            <div className="text-6xl mb-4">💬</div>
            <p className="text-lg mb-2">Your AI Study Companion</p>
            <p className="text-sm max-w-xs mx-auto">Ask questions about your uploaded document to learn more</p>
            <div className="flex gap-2 justify-center mt-4">
              {['Explain this', 'Quiz me', 'Summarize'].map(suggestion => (
                <button key={suggestion} onClick={() => sendMessage(suggestion)} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 text-xs transition-colors">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-br-md' : 'bg-white/10 backdrop-blur-md text-white rounded-bl-md border border-white/10'}`}>
              <div className="flex items-center gap-2 mb-1 text-xs opacity-70">
                <span>{msg.role === 'user' ? '👤 You' : '🤖 AI'}</span>
                <span>{msg.timestamp}</span>
              </div>
              <p className="leading-relaxed text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.role === 'assistant' && !msg.isComplete && <span className="inline-block w-1.5 h-4 bg-cyan-400 ml-1 animate-pulse">|</span>}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white/5 backdrop-blur-md border-t border-white/10">
        <div className="flex items-center gap-3">
          <input 
            type="text" 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)} 
            onKeyPress={(e) => e.key === 'Enter' && sendMessage(inputText)} 
            placeholder="Ask anything..." 
            className="flex-1 px-4 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-cyan-400/50" 
          />
          <button 
            onClick={() => sendMessage(inputText)} 
            disabled={!inputText.trim() || !isConnected} 
            className="p-3.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 disabled:opacity-40 text-white shadow-lg"
          >
            <span className="text-xl">📤</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceStudyMode;