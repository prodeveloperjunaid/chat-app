import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  chatId: { type: Number, required: true },
  sender: { type: String, required: true },
  text: { type: String, required: true },
  time: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Message = mongoose.model('Message', messageSchema);
