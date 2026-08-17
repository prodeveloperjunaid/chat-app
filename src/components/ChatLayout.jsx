import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
const socket = io(API_BASE || window.location.origin, {
  transports: ['polling', 'websocket'],
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});

const getConversationId = (id1, id2) => {
  if (!id1 || !id2) return '';
  return [String(id1), String(id2)].sort().join('_');
};

export default function ChatLayout({ user, onLogout }) {
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const isAdmin = user?.isAdmin !== undefined 
    ? Boolean(user.isAdmin) 
    : Boolean(user?.email && user.email.toLowerCase() !== 'khanking.1220444@gmail.com');

  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isPeerTyping, setIsPeerTyping] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/chats`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Filter out logged in user so self chat is removed
          const otherUsers = data.filter(
            (c) => (c._id || c.id) !== (user?._id || user?.id) && c.email !== user?.email
          );
          setChats(otherUsers);
          if (otherUsers.length > 0) {
            setActiveChat(otherUsers[0]);
          }
        }
      })
      .catch((err) => console.log('Contacts fetch notice:', err));
  }, [user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const activeChatId = activeChat
    ? getConversationId(user?._id || user?.id, activeChat._id || activeChat.id)
    : '';

  const currentMessages = activeChatId ? messages[activeChatId] || [] : [];

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages]);

  useEffect(() => {
    if (!activeChat || !user) return;
    const currentUserId = user?._id || user?.id;
    const friendId = activeChat._id || activeChat.id;
    const chatId = getConversationId(currentUserId, friendId);

    const fetchMessages = () => {
      fetch(`${API_BASE}/api/messages/${chatId}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            const formatted = data.map((msg) => ({
              ...msg,
              sender: String(msg.senderId) === String(currentUserId) ? 'me' : 'contact',
            }));
            setMessages((prev) => ({
              ...prev,
              [chatId]: formatted,
            }));
          }
        })
        .catch((err) => console.log('Database fetch notice:', err));
    };

    fetchMessages();

    // Fast 1.2s live polling for active chat to get new messages instantly without reload
    const interval = setInterval(fetchMessages, 1200);
    return () => clearInterval(interval);
  }, [activeChat, user]);

  // Background polling for unread badges on inactive contacts
  useEffect(() => {
    if (!user || chats.length === 0) return;
    const currentUserId = user?._id || user?.id;

    const checkBackgroundMessages = () => {
      chats.forEach((chat) => {
        const friendId = String(chat._id || chat.id);
        const activeFriendId = activeChat ? String(activeChat._id || activeChat.id) : '';
        if (friendId === activeFriendId) return;

        const chatId = getConversationId(currentUserId, friendId);
        fetch(`${API_BASE}/api/messages/${chatId}`)
          .then((res) => res.json())
          .then((data) => {
            if (Array.isArray(data)) {
              const formatted = data.map((m) => ({
                ...m,
                sender: String(m.senderId) === String(currentUserId) ? 'me' : 'contact',
              }));

              setMessages((prevMessages) => {
                const existing = prevMessages[chatId] || [];
                if (data.length > existing.length) {
                  const newIncoming = data.slice(existing.length).filter(
                    (m) => String(m.senderId) === friendId
                  ).length;
                  if (newIncoming > 0) {
                    setTimeout(() => {
                      setUnreadCounts((u) => ({
                        ...u,
                        [friendId]: (u[friendId] || 0) + newIncoming,
                      }));
                    }, 0);
                  }
                }
                return {
                  ...prevMessages,
                  [chatId]: formatted,
                };
              });
            }
          })
          .catch(() => {});
      });
    };

    const interval = setInterval(checkBackgroundMessages, 2000);
    return () => clearInterval(interval);
  }, [chats, activeChat, user]);

  useEffect(() => {
    socket.on('receive_message', (incomingData) => {
      const targetId = incomingData.chatId;
      const isMe = String(incomingData.senderId) === String(user?._id || user?.id);

      const msgToPush = {
        ...incomingData,
        sender: isMe ? 'me' : 'contact',
      };

      setMessages((prevMessages) => {
        const existing = prevMessages[targetId] || [];
        if (existing.some((m) => m._id && incomingData._id && m._id === incomingData._id)) {
          return prevMessages;
        }
        return {
          ...prevMessages,
          [targetId]: [...existing, msgToPush],
        };
      });

      if (!isMe) {
        const senderId = String(incomingData.senderId);
        const activeFriendId = activeChat ? String(activeChat._id || activeChat.id) : '';
        if (senderId !== activeFriendId) {
          setUnreadCounts((prev) => ({
            ...prev,
            [senderId]: (prev[senderId] || 0) + 1,
          }));
        }
      }
    });

    socket.on('typing', (data) => {
      if (data.chatId === activeChatId && String(data.senderId) !== String(user?._id || user?.id)) {
        setIsPeerTyping(true);
      }
    });

    socket.on('stop_typing', (data) => {
      if (data.chatId === activeChatId && String(data.senderId) !== String(user?._id || user?.id)) {
        setIsPeerTyping(false);
      }
    });

    return () => {
      socket.off('receive_message');
      socket.off('typing');
      socket.off('stop_typing');
    };
  }, [user, activeChat, activeChatId]);

  const handleSelectChat = (chat) => {
    setActiveChat(chat);
    setShowMobileChat(true);
    setIsPeerTyping(false);
    const friendId = String(chat._id || chat.id);
    setUnreadCounts((prev) => ({
      ...prev,
      [friendId]: 0,
    }));
  };

  const handleInputChange = (e) => {
    setMessageText(e.target.value);

    if (activeChatId && socket) {
      socket.emit('typing', {
        chatId: activeChatId,
        senderId: user?._id || user?.id,
      });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('stop_typing', {
          chatId: activeChatId,
          senderId: user?._id || user?.id,
        });
      }, 1500);
    }
  };

  const handleDeleteMessage = async (msgId) => {
    if (!isAdmin || !msgId) return;

    setMessages((prev) => ({
      ...prev,
      [activeChatId]: (prev[activeChatId] || []).filter((m) => m._id !== msgId && m.id !== msgId),
    }));

    try {
      await fetch(`${API_BASE}/api/messages/${msgId}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.error('Delete message error:', e);
    }
  };

  const handleClearChatHistory = async () => {
    if (!isAdmin || !activeChatId) return;
    if (!window.confirm('Are you sure you want to clear this chat history?')) return;

    setMessages((prev) => ({
      ...prev,
      [activeChatId]: [],
    }));

    try {
      await fetch(`${API_BASE}/api/messages/chat/${activeChatId}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.error('Clear chat error:', e);
    }
  };

  const handleDeleteUser = async (e, chatToDelete) => {
    e.stopPropagation();
    if (!isAdmin) return;
    const targetId = String(chatToDelete._id || chatToDelete.id);
    if (!window.confirm(`Are you sure you want to delete user "${chatToDelete.name}"?`)) return;

    setChats((prev) => prev.filter((c) => String(c._id || c.id) !== targetId));

    if (activeChat && String(activeChat._id || activeChat.id) === targetId) {
      setActiveChat(null);
    }

    try {
      await fetch(`${API_BASE}/api/users/${targetId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Delete user error:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeChat || !user) return;

    const currentUserId = user?._id || user?.id || '';
    const friendId = activeChat._id || activeChat.id;
    const chatId = getConversationId(currentUserId, friendId);
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const payload = {
      text: messageText,
      chatId: chatId,
      senderId: currentUserId,
      socketId: socket.id,
      time: timeStr,
    };

    const optimisticMsg = {
      _id: Date.now().toString(),
      text: messageText,
      chatId: chatId,
      senderId: currentUserId,
      sender: 'me',
      time: timeStr,
    };

    setMessages((prev) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), optimisticMsg],
    }));

    setMessageText('');
    setIsPeerTyping(false);

    if (socket) {
      socket.emit('stop_typing', { chatId, senderId: currentUserId });
    }

    try {
      await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error('Save message error:', e);
    }

    socket.emit('send_message', payload);
  };

  const filteredChats = chats.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-full max-w-6xl h-[100dvh] md:h-[calc(100vh-3rem)] max-h-[850px] flex bg-white rounded-none md:rounded-2xl shadow-xl overflow-hidden border-0 md:border border-gray-200">
      {/* 1. Left Sidebar */}
      <div
        className={`${
          showMobileChat ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 border-r border-gray-200 bg-gray-50 flex-col`}
      >
        <div className="p-3.5 border-b border-gray-200 flex items-center justify-between bg-white space-x-2">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#1A3D64] to-[#7886C7] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5 min-w-0">
                <h3 className="text-sm font-bold text-[#111827] truncate whitespace-nowrap">{user?.name || 'User'}</h3>
                {isAdmin && (
                  <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-[#7886C7]/20 text-[#1A3D64] rounded uppercase tracking-wider shrink-0 border border-[#7886C7]/30">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate whitespace-nowrap">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            Logout
          </button>
        </div>

        {/* Search Bar for Contacts */}
        <div className="p-2.5 border-b border-gray-200 bg-white">
          <div className="relative flex items-center">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:bg-white focus:border-[#1A3D64] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-gray-400 hover:text-gray-600 text-xs cursor-pointer p-0.5"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="p-3 flex-1 overflow-y-auto space-y-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Chats ({filteredChats.length})
            </p>
          </div>
          {filteredChats.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400 flex flex-col items-center justify-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
                🔍
              </div>
              <p className="font-medium text-gray-600">
                {searchQuery ? 'No contacts found' : 'No active contacts'}
              </p>
              <p className="text-[11px] text-gray-400">
                {searchQuery ? 'Try a different search term' : 'Ask a friend to sign up on ChitChat!'}
              </p>
            </div>
          ) : (
            filteredChats.map((chat) => {
              const friendId = String(chat._id || chat.id);
              const isSelected = activeChat && (String(activeChat._id || activeChat.id) === friendId);
              const unread = unreadCounts[friendId] || 0;

              return (
                <div
                  key={friendId}
                  onClick={() => handleSelectChat(chat)}
                  className={`group/contact p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between space-x-2 ${
                    isSelected
                      ? 'bg-[#1A3D64]/10 border-[#1A3D64] shadow-sm'
                      : 'bg-white border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3 overflow-hidden flex-1">
                    <div className={`w-8 h-8 rounded-full ${chat.avatarColor || 'bg-[#1A3D64]'} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs`}>
                      {chat.name[0]}
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-bold text-[#111827] truncate">{chat.name}</p>
                      <p className="text-xs text-gray-400 truncate">{chat.email || 'Tap to open chat'}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {unread > 0 && !isSelected && (
                      <span className="px-2 py-0.5 text-[10px] font-black text-white bg-rose-500 rounded-full shadow-sm shadow-rose-500/40 animate-pulse tracking-wider">
                        NEW {unread > 1 ? `(${unread})` : ''}
                      </span>
                    )}

                    {isAdmin && (
                      <button
                        onClick={(e) => handleDeleteUser(e, chat)}
                        title={`Delete user ${chat.name} (Admin Only)`}
                        className="opacity-0 group-hover/contact:opacity-100 transition-opacity p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
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
            <div className="p-3.5 md:p-4 border-b border-gray-200 bg-white flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowMobileChat(false)}
                  className="md:hidden p-1.5 -ml-1 mr-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className={`w-9 h-9 rounded-full ${activeChat.avatarColor || 'bg-[#1A3D64]'} text-white flex items-center justify-center font-bold text-sm shadow-xs`}>
                  {activeChat.name[0]}
                </div>
                <div>
                  <h3 className="text-sm md:text-base font-bold text-[#111827]">{activeChat.name}</h3>
                  {isPeerTyping ? (
                    <p className="text-xs text-[#7886C7] font-bold animate-pulse flex items-center space-x-1">
                      <span>typing</span>
                      <span className="inline-flex space-x-0.5">
                        <span className="w-1 h-1 bg-[#7886C7] rounded-full animate-bounce"></span>
                        <span className="w-1 h-1 bg-[#7886C7] rounded-full animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-1 h-1 bg-[#7886C7] rounded-full animate-bounce [animation-delay:0.4s]"></span>
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-600 font-medium flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Online</span>
                    </p>
                  )}
                </div>
              </div>

              {isAdmin && (
                <button
                  onClick={handleClearChatHistory}
                  className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 py-1.5 px-3 rounded-lg flex items-center space-x-1.5 font-semibold transition-colors cursor-pointer border border-red-100"
                  title="Clear Chat History (Admin Only)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Clear Chat</span>
                </button>
              )}
            </div>

            <div className="flex-1 p-3 md:p-6 bg-slate-50/70 overflow-y-auto space-y-3">
              {currentMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#1A3D64]/10 text-[#1A3D64] flex items-center justify-center text-2xl shadow-sm border border-[#1A3D64]/20">
                    💬
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-[#111827]">Say hello to {activeChat.name}!</h4>
                    <p className="text-xs text-gray-400 max-w-xs mt-1">
                      Type your message below to start a real-time conversation.
                    </p>
                  </div>
                </div>
              ) : (
                currentMessages.map((msg) => (
                  <div
                    key={msg.id || msg._id}
                    className={`group relative flex flex-col ${msg.sender === 'me' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`relative p-3 rounded-2xl max-w-[85%] sm:max-w-xs md:max-w-md text-sm shadow-xs ${
                        msg.sender === 'me'
                          ? 'bg-gradient-to-r from-[#1A3D64] to-[#244c79] text-white rounded-br-none'
                          : 'bg-white border border-gray-200 text-[#111827] rounded-bl-none'
                      }`}
                    >
                      <p className="break-words whitespace-pre-wrap">{msg.text}</p>
                      <div className="flex items-center justify-end space-x-1.5 mt-1">
                        <span className={`text-[8px] ${msg.sender === 'me' ? 'text-blue-100' : 'text-gray-400'}`}>
                          {msg.time}
                        </span>

                        {isAdmin && msg._id && (
                          <button
                            onClick={() => handleDeleteMessage(msg._id)}
                            title="Delete message (Admin Only)"
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-400 text-gray-400 cursor-pointer ml-1"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 md:p-4 border-t border-gray-200 bg-white flex space-x-2 md:space-x-3 items-center">
              <input
                type="text"
                placeholder="Type a message..."
                value={messageText}
                onChange={handleInputChange}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1 px-3.5 md:px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-sm focus:outline-none focus:bg-white focus:border-[#1A3D64] transition-all"
              />
              <button
                onClick={handleSendMessage}
                disabled={!messageText.trim()}
                className="px-4 md:px-5 py-2.5 bg-gradient-to-r from-[#1A3D64] to-[#7886C7] hover:opacity-95 text-white font-bold text-sm rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-[#1A3D64]/20 active:scale-95 shrink-0"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#1A3D64] to-[#7886C7] text-white flex items-center justify-center text-3xl shadow-xl shadow-[#1A3D64]/20">
              💬
            </div>
            <div>
              <h3 className="text-xl font-black text-[#111827] tracking-tight">Welcome to ChitChat</h3>
              <p className="text-xs text-gray-400 max-w-sm mt-1">
                Select a contact from the sidebar to view chat history or start messaging in real-time!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}