import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
const socket = io(API_BASE || window.location.origin);

export default function ChatLayout({ user, onLogout }) {
  const messagesEndRef = useRef(null);

  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState({});

  useEffect(() => {
    fetch(`${API_BASE}/api/chats`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setChats(data);
          if (data.length > 0) {
            setActiveChat(data[0]);
          }
        }
      })
      .catch((err) => console.log('Contacts fetch notice:', err));
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const currentMessages = activeChat ? messages[activeChat._id || activeChat.id] || [] : [];

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages]);

  useEffect(() => {
    if (!activeChat) return;
    const chatId = activeChat._id || activeChat.id;

    fetch(`${API_BASE}/api/messages/${chatId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages((prev) => ({
            ...prev,
            [chatId]: data,
          }));
        }
      })
      .catch((err) => console.log('Database fetch notice:', err));
  }, [activeChat]);

  useEffect(() => {
    socket.on('receive_message', (incomingData) => {
      if (incomingData.socketId === socket.id) return;
      const targetId = incomingData.chatId;
      setMessages((prevMessages) => ({
        ...prevMessages,
        [targetId]: [...(prevMessages[targetId] || []), incomingData],
      }));
    });

    return () => {
      socket.off('receive_message');
    };
  }, []);

  const handleSelectChat = (chat) => {
    setActiveChat(chat);
    setShowMobileChat(true);
  };

  const handleSendMessage = () => {
    if (!messageText.trim() || !activeChat) return;

    const chatId = activeChat._id || activeChat.id;
    const newMessage = {
      id: Date.now(),
      text: messageText,
      sender: 'me',
      chatId: chatId,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    socket.emit('send_message', {
      ...newMessage,
      chatId: chatId,
      socketId: socket.id,
      sender: 'contact',
    });

    setMessages((prev) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), newMessage],
    }));

    setMessageText('');
  };

  return (
    <div className="w-full max-w-6xl h-screen md:h-[calc(100vh-3rem)] max-h-[850px] flex bg-white rounded-none md:rounded-2xl shadow-xl overflow-hidden border-0 md:border border-gray-200">
      {/* 1. Left Sidebar */}
      <div
        className={`${
          showMobileChat ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 border-r border-gray-200 bg-gray-50 flex-col`}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">{user?.name || 'User'}</h3>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
          >
            Logout
          </button>
        </div>

        <div className="p-3 flex-1 overflow-y-auto space-y-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Chats ({chats.length})
          </p>
          {chats.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">
              No contacts available yet.
            </div>
          ) : (
            chats.map((chat) => {
              const isSelected = activeChat && (activeChat._id === chat._id || activeChat.id === chat.id);
              return (
                <div
                  key={chat._id || chat.id}
                  onClick={() => handleSelectChat(chat)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center space-x-3 ${
                    isSelected
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full ${chat.avatarColor || 'bg-blue-600'} text-white flex items-center justify-center font-semibold text-xs`}>
                    {chat.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{chat.name}</p>
                    <p className="text-xs text-gray-400">{chat.email || 'Tap to open chat'}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Right Chat Area */}
      <div
        className={`${
          showMobileChat ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col bg-white`}
      >
        {activeChat ? (
          <>
            <div className="p-4 border-b border-gray-200 bg-white flex items-center space-x-3">
              <button
                onClick={() => setShowMobileChat(false)}
                className="md:hidden p-1.5 -ml-1 mr-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className={`w-8 h-8 rounded-full ${activeChat.avatarColor || 'bg-blue-600'} text-white flex items-center justify-center font-semibold text-xs`}>
                {activeChat.name[0]}
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">{activeChat.name}</h3>
                <p className="text-xs text-emerald-600 font-medium">● Online</p>
              </div>
            </div>

            <div className="flex-1 p-4 md:p-6 bg-gray-50/50 overflow-y-auto space-y-3">
              {currentMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                  No messages yet. Send a message to start chatting!
                </div>
              ) : (
                currentMessages.map((msg) => (
                  <div
                    key={msg.id || msg._id}
                    className={`flex flex-col ${msg.sender === 'me' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`p-3 rounded-2xl max-w-xs text-sm shadow-sm ${
                        msg.sender === 'me'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                      }`}
                    >
                      <p>{msg.text}</p>
                      <p className={`text-[8px] mt-1 text-right ${msg.sender === 'me' ? 'text-blue-100' : 'text-gray-400'}`}>
                        {msg.time}
                      </p>
                    </div>
                  </div>
                ))
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 md:p-4 border-t border-gray-200 bg-white flex space-x-2 md:space-x-3">
              <input
                type="text"
                placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1 px-3.5 md:px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-sm focus:outline-none focus:bg-white focus:border-blue-600"
              />
              <button
                onClick={handleSendMessage}
                className="px-4 md:px-5 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Select a contact to start chatting!
          </div>
        )}
      </div>
    </div>
  );
}