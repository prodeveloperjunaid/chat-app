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

  const isAdmin = user?.isAdmin !== undefined 
    ? Boolean(user.isAdmin) 
    : Boolean(user?.email && user.email.toLowerCase() !== 'khanking.1220444@gmail.com');

  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});

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

    return () => {
      socket.off('receive_message');
    };
  }, [user, activeChat]);

  const handleSelectChat = (chat) => {
    setActiveChat(chat);
    setShowMobileChat(true);
    const friendId = String(chat._id || chat.id);
    setUnreadCounts((prev) => ({
      ...prev,
      [friendId]: 0,
    }));
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
              <div className="flex items-center space-x-1.5">
                <h3 className="text-sm font-bold text-gray-900">{user?.name || 'User'}</h3>
                {isAdmin && (
                  <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-amber-100 text-amber-800 rounded uppercase tracking-wider">
                    Admin
                  </span>
                )}
              </div>
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
            <div className="p-6 text-center text-xs text-gray-400 flex flex-col items-center justify-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
                👥
              </div>
              <p className="font-medium text-gray-600">No active contacts</p>
              <p className="text-[11px] text-gray-400">Ask a friend to sign up on ChitChat!</p>
            </div>
          ) : (
            chats.map((chat) => {
              const friendId = String(chat._id || chat.id);
              const isSelected = activeChat && (String(activeChat._id || activeChat.id) === friendId);
              const unread = unreadCounts[friendId] || 0;

              return (
                <div
                  key={friendId}
                  onClick={() => handleSelectChat(chat)}
                  className={`group/contact p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between space-x-2 ${
                    isSelected
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3 overflow-hidden flex-1">
                    <div className={`w-8 h-8 rounded-full ${chat.avatarColor || 'bg-blue-600'} text-white flex items-center justify-center font-semibold text-xs shrink-0`}>
                      {chat.name[0]}
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-gray-800 truncate">{chat.name}</p>
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
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
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

            <div className="flex-1 p-4 md:p-6 bg-gray-50/50 overflow-y-auto space-y-3">
              {currentMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl shadow-sm border border-blue-100">
                    💬
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-gray-800">Say hello to {activeChat.name}!</h4>
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
                      className={`relative p-3 rounded-2xl max-w-xs text-sm shadow-sm ${
                        msg.sender === 'me'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                      }`}
                    >
                      <p>{msg.text}</p>
                      <div className="flex items-center justify-end space-x-1.5 mt-1">
                        <span className={`text-[8px] ${msg.sender === 'me' ? 'text-blue-100' : 'text-gray-400'}`}>
                          {msg.time}
                        </span>

                        {isAdmin && msg._id && (
                          <button
                            onClick={() => handleDeleteMessage(msg._id)}
                            title="Delete message (Admin Only)"
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-400 text-gray-400 cursor-pointer"
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
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-blue-600 text-white flex items-center justify-center text-3xl shadow-xl shadow-blue-500/20">
              💬
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight">Welcome to ChitChat</h3>
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