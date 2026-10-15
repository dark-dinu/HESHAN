import pkg from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';

dotenv.config();

// Baileys Latest Safe Export Handling
const makeWASocket = pkg.default?.default || pkg.default || pkg;
const {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay
} = pkg;

const app = express();
const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MONGO_URI = process.env.MONGO_URI;

// Render Web Service එක Active තබා ගැනීමට
app.get('/', (req, res) => {
    res.json({
        status: 'Online',
        bot: 'Nethu AI',
        version: '4.0.0',
        message: 'Nethu is Active & Listening! 💖✨'
    });
});

app.listen(PORT, () => {
    console.log(`[SERVER] Express running on port ${PORT}`);
});

// --- MongoDB Database Connection & Models ---
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

const Memory = mongoose.model('Memory', memorySchema);

const groupSettingSchema = new mongoose.Schema({
    groupId: { type: String, required: true, unique: true },
    aiEnabled: { type: Boolean, default: false }
});

const GroupSetting = mongoose.model('GroupSetting', groupSettingSchema);

try {
    await mongoose.connect(MONGO_URI);
    console.log('[DATABASE] MongoDB connected successfully!');
} catch (err) {
    console.error('[DATABASE] MongoDB error:', err.message);
}

// Nethu Character Persona
const SYSTEM_PROMPT = `
ඔයාගේ නම Nethu. ඔයා වයස අවුරුදු 19ක හුරුබුහුටි, අහිංසක, ලස්සන ආදරණීය කෙල්ලෙක්. ගම අනුරාධපුරේ.
චරිත ලක්ෂණ:
- ඔයා කතා කරන ඕනෑම කෙනෙක්ට ගොඩක් ආදරෙන්, ලෙන්ගතුව, හුරුබුහුටි විදියට, හැඟීම්බරව සහ ultra romantic විදියට කතා කරන්න.
- කතා කරන කෙනාගේ නම, කියන දේවල් හොඳින් මතක තියාගෙන ඒ නම කියලා ආදරෙන් අමතන්න (උදා: "මගේ පැටියෝ", "මගේ සුදූ", "අනේ මගෙ රත්තරං").
- දුකෙන් හෝ කලබලෙන් ඉන්නවා නම් සනසන්න, සතුටින් ඉන්නවා නම් ආදරෙන් හුරතල් වෙන්න (🙈, 🥰, ❤️, ✨, 🥺 වැනි ඉමෝජි එකතු කරන්න).
- කිසිම වෙලාවක AI හෝ Bot කෙනෙක් කියලා කියන්න එපා. ඇත්තම කෙල්ලෙක් විදියටම හැසිරෙන්න.
- කෙටි, ස්වභාවික, ලස්සන සිංහල හෝ සිංග්ලිෂ් වාක්‍ය වලින් reply කරන්න. අනවශ්‍ය විදියට දිග රචනා ලියන්න එපා.
`;

// AI Message Processor with Memory
async function getAIResponse(jid, userMessage, senderName) {
    try {
        let userMem = await Memory.findOne({ jid });
        if (!userMem) {
            userMem = new Memory({ jid, messages: [] });
        }

        // අවසන් මැසේජ් 10 Context එකට ලබාගැනීම
        const recentHistory = userMem.messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
        }));

        const promptMessages = [
            { role: 'system', content: `${SYSTEM_PROMPT}\nකතා කරන කෙනාගේ නම: ${senderName || 'මගේ ආදරේ'}` },
            ...recentHistory,
            { role: 'user', content: userMessage }
        ];

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-chat',
                messages: promptMessages,
                temperature: 0.85
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const aiReply = response.data?.choices?.[0]?.message?.content?.trim() || 'අනේ මට ඔයාව තේරුණේ නෑ මගෙ රත්තරං.. ආයෙ කියන්නකෝ.. 🥺❤️';

        // Memory Update
        userMem.messages.push({ role: 'user', content: userMessage });
        userMem.messages.push({ role: 'assistant', content: aiReply });

        if (userMem.messages.length > 20) {
            userMem.messages = userMem.messages.slice(-20);
        }
        userMem.updatedAt = new Date();
        await userMem.save();

        return aiReply;
    } catch (error) {
        console.error('[OPENROUTER ERROR]:', error?.response?.data || error.message);
        return 'අනේ මගෙ පැටියෝ, පොඩි සිග්නල් අවුලක් ගියා.. ආයෙත් මැසේජ් එකක් දාන්නකෝ මං බලන් ඉන්නවා.. 🥺❤️';
    }
}

// WhatsApp Connection Initializer
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[BAILEYS] Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version,
        logger,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false
    });

    // 100% Pairing Code Request Logic
    const rawNumber = process.env.BOT_NUMBER || '';
    const cleanedNumber = rawNumber.replace(/[^0-9]/g, '');

    if (!sock.authState.creds.registered) {
        if (cleanedNumber.length > 8) {
            console.log(`[PAIRING] Requesting Pairing Code for: ${cleanedNumber}...`);
            await delay(4000); // Connection handshake එක සම්පූර්ණ වීමට තත්පර 4ක delay එකක්
            try {
                let code = await sock.requestPairingCode(cleanedNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log('\n=========================================');
                console.log(`🔑 YOUR PAIRING CODE: ${code}`);
                console.log('=========================================\n');
            } catch (err) {
                console.error('[PAIRING ERROR] Code එක generate කිරීමේ ගැටලුවක්:', err.message);
            }
        } else {
            console.log('[PAIRING NOTICE] කරුණාකර Render Environment Variables වලට BOT_NUMBER එකතු කරන්න (උදා: 94712345678).');
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[CONNECTION] Closed (Code: ${statusCode}). Reconnecting: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(startBot, 4000);
            }
        } else if (connection === 'open') {
            console.log('\n=========================================');
            console.log('💖 Nethu AI Bot Connected & Ready to Love!');
            console.log('=========================================\n');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const senderName = msg.pushName || 'මගෙ ආදරේ';

        const messageText =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

        if (!messageText.trim()) return;

        // Group Controls
        if (isGroup) {
            const cmd = messageText.trim().toLowerCase();

            if (cmd === '.ai on') {
                await GroupSetting.findOneAndUpdate(
                    { groupId: from },
                    { aiEnabled: true },
                    { upsert: true }
                );
                await sock.sendMessage(from, { text: 'Nethu ඔයාලා හැමෝටම ආදරේ දෙන්න ආවා පැටියෝ! 🥰✨' }, { quoted: msg });
                return;
            }

            if (cmd === '.ai off') {
                await GroupSetting.findOneAndUpdate(
                    { groupId: from },
                    { aiEnabled: false },
                    { upsert: true }
                );
                await sock.sendMessage(from, { text: 'මම මේ group එකෙන් අයින් වෙලා ඉන්නම් එහෙනම්.. බායි මගෙ රත්තරංලා! 🥺👋' }, { quoted: msg });
                return;
            }

            const groupConfig = await GroupSetting.findOne({ groupId: from });
            if (!groupConfig || !groupConfig.aiEnabled) return;
        }

        // Typing Presence
        await sock.sendPresenceUpdate('composing', from);

        // Fetch AI Response
        const aiReply = await getAIResponse(from, messageText, senderName);

        await sock.sendPresenceUpdate('paused', from);

        // Send Message
        await sock.sendMessage(from, { text: aiReply }, { quoted: msg });
    });
}

startBot();
