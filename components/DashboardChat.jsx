'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export function DashboardChat({ dashboardData, systemData }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am the APxOps Assistant. Ask me anything about your current dashboard (e.g., expiring STRUST certificates or system health).' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const newMessages = [...messages, { role: 'user', content: inputValue.trim() }];
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/batch/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.filter(m => m.role === 'user' || m.role === 'assistant'),
          context: { dashboard: dashboardData, system: systemData }
        })
      });

      const responseText = await response.text();
      let data = null;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        // Not valid JSON
      }

      if (!response.ok) {
        const errorMsg = (data && (data.error || data.detail)) || responseText || `Chat API returned status ${response.status}`;
        throw new Error(errorMsg);
      }

      if (!data || !data.reply) {
        throw new Error('Received an invalid response format from the AI server.');
      }

      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: `**Error:** ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`chat-widget-container ${isOpen ? 'open' : 'closed'}`}>
      {!isOpen && (
        <button className="chat-toggle-btn" onClick={() => setIsOpen(true)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12 2C6.48 2 2 5.58 2 10c0 2.45 1.34 4.63 3.42 6.05L4 22l5.44-2.72c.82.19 1.68.29 2.56.29 5.52 0 10-3.58 10-8s-4.48-8-10-8zm0 14c-.75 0-1.48-.09-2.19-.24l-3.32 1.66.7-3.48C5.64 12.8 4.5 11.47 4.5 10c0-3.31 3.36-6 7.5-6s7.5 2.69 7.5 6-3.36 6-7.5 6z" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="chat-window card">
          <div className="chat-header">
            <h3>APxOps Assistant</h3>
            <button className="chat-close-btn" onClick={() => setIsOpen(false)}>×</button>
          </div>
          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-bubble ${msg.role}`}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            ))}
            {isLoading && (
              <div className="chat-bubble assistant loading">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form className="chat-input-area" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Ask about the dashboard..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !inputValue.trim()}>Send</button>
          </form>
        </div>
      )}
    </div>
  );
}
