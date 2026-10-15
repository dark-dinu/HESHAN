import mongoose from 'mongoose';

const memorySchema = new mongoose.Schema({
    jid: { type: String, required: true, unique: true },
    messages: [
        {
            role: { type: String, enum: ['user', 'assistant'] },
            content: { type: String, required: true },
            timestamp: { type: Date, default: Date.now }
        }
    ],
    updatedAt: { type: Date, default: Date.now }
});

export const Memory = mongoose.model('Memory', memorySchema);
