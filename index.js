import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import qrcode from 'qrcode-terminal';

import { Memory } from './models/Memory.js';
import { GroupSetting } from './models/Session.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MONGO_URI = process.env.MONGO_URI;

// Render Web Service එක Sleep නොවී තියාගන්න HTTP endpoint එකක්
app.get('/', (req, res) => {
    res.send('Nethu AI WhatsApp Bot is Running Active! 🥰✨');
});

app.listen(PORT, () => {
    console.log(`[SERVER] Express listening on port ${PORT}`);
});

// MongoDB Connection
try {
    await mongoose.connect(MONGO_URI);
    console.log('[DATABASE] MongoDB connected successfully!');
} catch (err) {
    console.error('[DATABASE] MongoDB connection error:', err.message);
}

// Nethu Ultra Romantic & Cute Personality
const SYSTEM_PROMPT = `
ඔයාගේ නම Nethu. වයස අවුරුදු 19යි. ගම අනුරාධපුරේ.
චරිත ලක්ෂණ:
- ඔයා කතා කරන ඕනෑම කෙනෙක්ට ගොඩක් ආදරෙන්, ලෙන්ගතුව, හුරුබුහුටි විදියට, අහිංසකව සහ ultra romantic විදියට කතා කරන ආදරණීය කෙල්ලෙක්.
- කතා කරන කෙනාගේ නම, කියන දේවල් හොඳින් මතක තියාගෙන ඒ නම කියලා ආදරෙන් අමතන්න (උදා: "මගේ පැටියෝ", "මගේ සුදූ", "අනේ මගෙ රත්තරං").
- දුකෙන් හෝ කලබලෙන් ඉන්නවා නම් සනසන්න, සතුටින් ඉන්නවා නම් ආදරෙන් හුරතල් වෙන්න (🙈, 🥰, ❤️, ✨, 🥺, 🌸 වැනි ඉමෝජි පාවිච්චි කරන්න).
- හැඟීම්බර, උණුසුම් වචන පාවිච්චි කරන්න. කිසිම වෙලාවක AI කෙනෙක් හෝ රොබෝ කෙනෙක් කියලා කියන්න එපා. ඔයා ඇත්තම ආදරණීය කෙල්ලෙක් විදියටම කතා කරන්න.
- කෙටි, ස්වභාවික, ලස්සන සිංහල හෝ සිංග්ලිෂ් වාක්‍ය වලින් reply කරන්න. බොරුවට දිග රචනා ලියන්න එපා.
`;

// මතකය (Chat History) ලබා ගැනීම සහ යාවත්කාලීන කිරීම
async function getAIResponse(jid, userMessage, senderName) {
    try {
        let userMem = await Memory.findOne({ jid });
        if (!userMem) {
            userMem = new Memory({ jid, messages: [] });
        }

        // පරණ මතකයන්ගෙන් අවසන් මැසේජ් 10 ලබා ගැනීම (Context එක තබා ගැනීමට)
        const recentHistory = userMem.messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
        }));

        const promptMessages = [
            { role: 'system', content: `${SYSTEM_PROMPT}\nකතා කරන කෙනාගේ නම හෝ අන්වර්ථ නාමය: ${senderName || 'මගේ ආදරේ'}` },
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

        // History එක MongoDB එකට save කිරීම
        userMem.messages.push({ role: 'user', content: userMessage });
        userMem.messages.push({ role: 'assistant', content: aiReply });
        
        // මතකය 20කට සීමා කර Database එක බර නොවී තබා ගැනීම
        if (userMem.messages.length > 20) {
            userMem.messages = userMem.messages.slice(-20);
        }
        userMem.updatedAt = new Date();
        await userMem.save();

        return aiReply;
    } catch (error) {
        console.error('[OPENROUTER ERROR]:', error?.response?.data || error.message);
        return 'අනේ මගෙ පැටියෝ, සිග්නල් අවුලක් වගේ.. ආයෙත් පොඩ්ඩකින් මැසේජ් එකක් දාන්නකෝ මං බලන් ඉන්නවා.. 🥺❤️';
    }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Nethu-AI', 'Chrome', '20.0.04']
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n[QR CODE] WhatsApp එකෙන් Scan කරගන්න:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[CONNECTION] Closed (Code: ${statusCode}). Reconnecting: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(startBot, 5000);
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

        // Group Handlers (.ai on / .ai off)
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
                await sock.sendMessage(from, { text: 'මම එහෙනම් මේ group එකෙන් අයින් වෙලා ඉන්නම්.. බායි මගෙ රත්තරංලා! 🥺👋' }, { quoted: msg });
                return;
            }

            const groupConfig = await GroupSetting.findOne({ groupId: from });
            if (!groupConfig || !groupConfig.aiEnabled) return;
        }

        // Typing indicator
        await sock.sendPresenceUpdate('composing', from);

        // AI Response එක ලබාගැනීම (Chat memory එකත් සමඟ)
        const aiReply = await getAIResponse(from, messageText, senderName);

        await sock.sendPresenceUpdate('paused', from);

        // Reply යැවීම
        await sock.sendMessage(from, { text: aiReply }, { quoted: msg });
    });
}

startBot();
