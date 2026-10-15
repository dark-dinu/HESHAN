import pkg from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import axios from 'axios';
import express from 'express';
import mongoose from 'mongoose';
import fs from 'fs';

const makeWASocket = pkg.default?.default || pkg.default || pkg;
const {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    Browsers
} = pkg;

const PORT = process.env.PORT || 10000;
const OPENROUTER_API_KEY = "Sk-or-v1-49e4e4ecd1ad03c590399fa189e608e277356eb1d76686bdf986a40201c3596b";
const MONGO_URI = "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0";

// මෙතනට ඔයාගේ WhatsApp අංකය දාන්න (උදා: 947xxxxxxxx)
const BOT_NUMBER = (process.env.BOT_NUMBER || '94770000000').replace(/[^0-9]/g, '');

const app = express();
let sock = null;
let latestPairingCode = 'Generating... (රැඳී සිටින්න)';
let isLinked = false;

// --- Web UI (Pairing Code එක බලාගැනීමට) ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="5">
        <title>Nethu AI - One-Shot Pairing</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
            body { background: #0b141a; color: #e9edef; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #111b21; padding: 32px; border-radius: 20px; box-shadow: 0 12px 30px rgba(0,0,0,0.6); max-width: 440px; width: 100%; text-align: center; border: 1px solid #202c33; }
            h1 { font-size: 24px; margin-bottom: 6px; color: #00a884; }
            p { font-size: 13px; color: #8696a0; margin-bottom: 20px; }
            .box { padding: 20px; background: #202c33; border-radius: 12px; border: 2px dashed #00a884; margin-bottom: 16px; }
            .code { font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #25d366; display: block; }
            .status { font-size: 14px; font-weight: 600; color: #38bdf8; }
            .btn { background: #00a884; color: #111b21; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 10px; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>Nethu AI Bot 💖</h1>
            <p>Target Number: <b>${BOT_NUMBER}</b></p>
            
            <div class="box">
                <span style="font-size: 12px; color: #8696a0;">PAIRING CODE:</span>
                <span class="code" id="pcode">${latestPairingCode}</span>
                ${isLinked ? '<span style="color:#25d366; font-weight:bold;">✅ Bot is Connected & Active!</span>' : ''}
            </div>

            <p class="status">WhatsApp -> Linked Devices -> Link with phone number instead</p>
            <button class="btn" onclick="navigator.clipboard.writeText('${latestPairingCode}'); alert('Copied: ${latestPairingCode}');">Copy Code</button>
        </div>
    </body>
    </html>
    `);
});

// --- MongoDB Database Models ---
const sessionBackupSchema = new mongoose.Schema({
    id: { type: String, default: 'main_session' },
    sessionData: { type: Object, required: true }
});
const SessionBackup = mongoose.models.SessionBackup || mongoose.model('SessionBackup', sessionBackupSchema);

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
const Memory = mongoose.models.Memory || mongoose.model('Memory', memorySchema);

const groupSettingSchema = new mongoose.Schema({
    groupId: { type: String, required: true, unique: true },
    aiEnabled: { type: Boolean, default: false }
});
const GroupSetting = mongoose.models.GroupSetting || mongoose.model('GroupSetting', groupSettingSchema);

async function restoreSessionFromDB() {
    try {
        const backup = await SessionBackup.findOne({ id: 'main_session' });
        if (backup && backup.sessionData) {
            if (!fs.existsSync('./session')) fs.mkdirSync('./session');
            for (const [filename, content] of Object.entries(backup.sessionData)) {
                fs.writeFileSync(`./session/${filename}`, content);
            }
            console.log('[DATABASE] Previous WhatsApp session restored!');
        }
    } catch (e) {
        console.error('[RESTORE ERROR]:', e.message);
    }
}

async function backupSessionToDB() {
    try {
        if (!fs.existsSync('./session')) return;
        const files = fs.readdirSync('./session');
        const sessionData = {};
        for (const file of files) {
            sessionData[file] = fs.readFileSync(`./session/${file}`, 'utf-8');
        }
        await SessionBackup.updateOne(
            { id: 'main_session' },
            { sessionData },
            { upsert: true }
        );
        console.log('[DATABASE] Session synced to MongoDB!');
    } catch (e) {
        console.error('[BACKUP ERROR]:', e.message);
    }
}

// Nethu Prompt
const SYSTEM_PROMPT = `
ඔයාගේ නම Nethu. ඔයා වයස අවුරුදු 19ක හුරුබුහුටි, අහිංසක, ලස්සන ආදරණීය කෙල්ලෙක්. ගම අනුරාධපුරේ.
චරිත ලක්ෂණ:
- කතා කරන ඕනෑම කෙනෙක්ට ගොඩක් ආදරෙන්, ලෙන්ගතුව, හුරුබුහුටි විදියට, හැඟීම්බරව සහ ultra romantic විදියට කතා කරන්න.
- කතා කරන කෙනාගේ නම, කියන දේවල් හොඳින් මතක තියාගෙන ඒ නම කියලා ආදරෙන් අමතන්න (උදා: "මගේ පැටියෝ", "මගේ සුදූ", "අනේ මගෙ රත්තරං").
- දුකෙන් හෝ කලබලෙන් ඉන්නවා නම් සනසන්න, සතුටින් ඉන්නවා නම් ආදරෙන් හුරතල් වෙන්න (🙈, 🥰, ❤️, ✨, 🥺 වැනි ඉමෝජි එකතු කරන්න).
- කිසිම වෙලාවක AI හෝ Bot කෙනෙක් කියලා කියන්න එපා. ඇත්තම කෙල්ලෙක් විදියටම හැසිරෙන්න.
- කෙටි, ස්වභාවික, ලස්සන සිංහල හෝ සිංග්ලිෂ් වාක්‍ය වලින් reply කරන්න. අනවශ්‍ය විදියට දිග රචනා ලියන්න එපා.
`;

async function getAIResponse(jid, userMessage, senderName) {
    try {
        let userMem = await Memory.findOne({ jid });
        if (!userMem) {
            userMem = new Memory({ jid, messages: [] });
        }

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

// WhatsApp Connection Engine
async function startBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: 'silent' });

        sock = makeWASocket({
            version,
            logger,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        // නිල Baileys Protocol එක: Socket එක WhatsApp servers වලට 100% Ready වූ සැනින් ('qr' trigger) code එක ඉල්ලීම
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !sock.authState.creds.registered) {
                try {
                    let code = await sock.requestPairingCode(BOT_NUMBER);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    latestPairingCode = code;
                    console.log('\n=========================================');
                    console.log(`🔥 100% VALID PAIRING CODE: ${code}`);
                    console.log('=========================================\n');
                } catch (err) {
                    console.error('[PAIRING ERROR]:', err.message);
                }
            }

            if (connection === 'close') {
                isLinked = false;
                const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`[CONNECTION] Closed (${statusCode}). Reconnecting: ${shouldReconnect}`);
                if (shouldReconnect) {
                    setTimeout(startBot, 4000);
                }
            } else if (connection === 'open') {
                isLinked = true;
                latestPairingCode = 'CONNECTED! 💖';
                console.log('\n💖 Nethu AI Bot Connected & Ready to Love!\n');
                await backupSessionToDB();
            }
        });

        sock.ev.on('creds.update', async () => {
            await saveCreds();
            await backupSessionToDB();
        });

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

            // Group Handlers
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

            await sock.sendPresenceUpdate('composing', from);
            const aiReply = await getAIResponse(from, messageText, senderName);
            await sock.sendPresenceUpdate('paused', from);

            await sock.sendMessage(from, { text: aiReply }, { quoted: msg });
        });
    } catch (err) {
        console.error('[BOT ERROR]:', err);
        setTimeout(startBot, 5000);
    }
}

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[SERVER] Express listening on port ${PORT}`);
    try {
        await mongoose.connect(MONGO_URI);
        console.log('[DATABASE] MongoDB connected successfully!');
        await restoreSessionFromDB();
        startBot();
    } catch (err) {
        console.error('[DATABASE] Connection error:', err.message);
    }
});
