import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Message } from './models/Message.js';
import { User } from './models/User.js';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_chat_key_98765';
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://hellojunaid2311_db_user:05LMIJ35uAMYDqEn@cluster0.q1bbhla.mongodb.net/chatapp?retryWrites=true&w=majority';

const connectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI);
    console.log('🍃 Connected to MongoDB Database Successfully!');
  }
};

app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) {
    try {
      await connectDB();
    } catch (err) {
      console.error('❌ MongoDB Connection Error:', err);
      return res.status(500).json({ error: 'Database connection failed. Ensure MongoDB Atlas Network Access is set to 0.0.0.0/0.' });
    }
  }
  next();
});

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.get('/api', (req, res) => {
  res.send('Chat Backend API Running on Vercel!');
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const colors = ['bg-blue-600', 'bg-purple-600', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newUser = new User({
      name: fullName,
      email,
      password: hashedPassword,
      avatarColor: randomColor,
    });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: { id: newUser._id, name: newUser.name, email: newUser.email, avatarColor: newUser.avatarColor },
    });
  } catch (err) {
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password!' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password!' });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatarColor: user.avatarColor },
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: err.message || 'Login failed. Please try again.' });
  }
});

app.get('/api/chats', async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

app.post('/api/chats', async (req, res) => {
  try {
    const { name, email, avatarColor } = req.body;
    const colors = ['bg-blue-600', 'bg-purple-600', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newUser = new User({
      name,
      email: email || `${name.toLowerCase().replace(/\s+/g, '')}@app.com`,
      password: await bcrypt.hash('123456', 10),
      avatarColor: avatarColor || randomColor,
    });
    await newUser.save();
    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

app.get('/api/messages/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const history = await Message.find({ chatId: String(chatId) }).sort({ createdAt: 1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { chatId, senderId, sender, text, time } = req.body;
    const savedMsg = new Message({
      chatId: String(chatId),
      senderId: String(senderId || ''),
      sender: sender || 'contact',
      text,
      time: time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    await savedMsg.save();
    res.status(201).json(savedMsg);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save message' });
  }
});

app.delete('/api/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Message.findByIdAndDelete(id);
    res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

app.delete('/api/messages/chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    await Message.deleteMany({ chatId: String(chatId) });
    res.json({ success: true, message: 'Chat history cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

app.post('/api/clean', async (req, res) => {
  try {
    await Message.deleteMany({});
    await User.deleteMany({});
    res.json({ message: 'Database wiped clean successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to wipe database' });
  }
});

io.on('connection', (socket) => {
  console.log(`⚡ User Connected: ${socket.id}`);

  socket.on('send_message', async (data) => {
    try {
      const savedMsg = new Message({
        chatId: String(data.chatId),
        senderId: String(data.senderId || ''),
        sender: data.sender || 'contact',
        text: data.text,
        time: data.time,
      });
      await savedMsg.save();

      io.emit('receive_message', {
        ...data,
        _id: savedMsg._id,
      });
    } catch (err) {
      console.error('Failed to save message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ User Disconnected: ${socket.id}`);
  });
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

export default app;
