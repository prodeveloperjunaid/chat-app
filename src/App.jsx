import React, { useState } from 'react';
import Auth from './components/Auth';
import ChatLayout from './components/ChatLayout';

export default function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('chat_app_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const handleLogin = (userData) => {
    localStorage.setItem('chat_app_user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_app_user');
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A3D64] via-[#111827] to-[#0f172a] flex items-center justify-center p-0 md:p-6 overflow-hidden text-[#111827]">
      {user ? (
        <ChatLayout user={user} onLogout={handleLogout} />
      ) : (
        <Auth onLogin={handleLogin} />
      )}
    </div>
  );
}