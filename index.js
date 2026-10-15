import pkg from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import axios from 'axios';
import express from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const makeWASocket = pkg.default?.default || pkg.default || pkg;
const {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    delay
} = pkg;

const PORT = process.env.PORT || 10000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "Sk-or-v1-49e4e4ecd1ad03c590399fa189e608e277356eb1d76686bdf986a40201c3596b";
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0";

const SESSION_DIR = './session';
const app = express();
app.use(express.json());

let sock = null;
let isLinked = false;
let isSocketReady = false;

// --- Session Reset Utility ---
function clearLocalSession() {
    if (fs.existsSync(SESSION_DIR)) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// --- MongoDB Schemas ---
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
        if (backup && backup.sessionData && Object.keys(backup.sessionData).length > 0) {
            clearLocalSession();
            for (const [filename, content] of Object.entries(backup.sessionData)) {
                fs.writeFileSync(path.join(SESSION_DIR, filename), content);
            }
            return true;
        }
    } catch (e) {
        console.error('[RESTORE ERROR]:', e.message);
    }
    return false;
}

async function backupSessionToDB() {
    try {
        if (!fs.existsSync(SESSION_DIR)) return;
        const files = fs.readdirSync(SESSION_DIR);
        if (files.length === 0) return;

        const sessionData = {};
        for (const file of files) {
            sessionData[file] = fs.readFileSync(path.join(SESSION_DIR, file), 'utf-8');
        }
        await SessionBackup.updateOne(
            { id: 'main_session' },
            { sessionData },
            { upsert: true }
        );
    } catch (e) {
        console.error('[BACKUP ERROR]:', e.message);
    }
}

// --- Web UI ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nethu AI - WhatsApp Pairing</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: #0b141a; color: #e9edef; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
            .card { background: #111b21; padding: 28px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 420px; width: 100%; text-align: center; border: 1px solid #202c33; }
            h1 { font-size: 22px; margin-bottom: 6px; color: #00a884; }
            p { font-size: 13px; color: #8696a0; margin-bottom: 20px; line-height: 1.4; }
            input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #2a3942; background: #202c33; color: #fff; font-size: 16px; text-align: center; margin-bottom: 14px; outline: none; }
            input:focus { border-color: #00a884; }
            button { width: 100%; background: #00a884; color: #111b21; border: none; padding: 12px; border-radius: 8px; font-weight: 700; font-size: 15px; cursor: pointer; }
            button:disabled { opacity: 0.6; cursor: not-allowed; }
            .box { padding: 16px; background: #202c33; border-radius: 10px; border: 1px dashed #00a884; margin-top: 20px; display: none; }
            .code { font-size: 28px; font-weight: 800; letter-spacing: 5px; color: #25d366; user-select: all; display: block; margin: 8px 0; }
            .status { font-size: 12px; color: #ffd279; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>Nethu AI Bot 💖</h1>
            <p>WhatsApp අංකය Country Code එක සහිතව ඇතුළත් කරන්න.<br>(උදා: <b>947xxxxxxxx</b>)</p>
            
            <input type="text" id="phone" placeholder="947xxxxxxxx" maxlength="15" />
            <button id="btn" onclick="getCode()">Get Pairing Code</button>

            <div class="box" id="box">
                <span style="font-size: 11px; color: #8696a0;">PAIRING CODE</span>
                <span class="code" id="codeText">-------</span>
                <p class="status">WhatsApp → Linked Devices → Link with phone number එකට ලබා දෙන්න.</p>
            </div>
        </div>

        <script>
            async function getCode() {
                const phone = document.getElementById('phone').value.replace(/[^0-9]/g, '');
                const btn = document.getElementById('btn');
                const box = document.getElementById('box');
                const codeText = document.getElementById('codeText');

                if (!phone || phone.length < 10) {
                    alert('කරුණාකර නිවැරදි Phone Number එකක් ඇතුළත් කරන්න!');
                    return;
                }

                btn.innerText = "Requesting Code...";
                btn.disabled = true;

                try {
                    const res = await fetch('/code?number=' + phone);
                    const data = await res.json();
                    
                    if (data.code) {
                        box.style.display = 'block';
                        codeText.innerText = data.code;
                        btn.innerText = "Copy Code";
                        btn.disabled = false;
                        btn.onclick = () => {
                            navigator.clipboard.writeText(data.code);
                            alert('Code Copied: ' + data.code);
                        };
                    } else {
                        alert(data.error || 'Code generate කිරීම අසාර්ථක විය.');
                        btn.innerText = "Try Again";
                        btn.disabled = false;
                    }
                } catch (e) {
                    alert('Error: ' + e.message);
                    btn.innerText = "Try Again";
                    btn.disabled = false;
                }
            }
        </script>
    </body>
    </html>
    `);
});

// --- Dynamic Pairing Endpoint ---
app.get('/code', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Number is required' });
    num = num.replace(/[^0-9]/g, '');

    if (!sock || !isSocketReady) {
        return res.status(503).json({ error: 'WhatsApp socket එක තවමත් ready වෙමින් පවතී. තත්පර 5කින් නැවත උත්සාහ කරන්න.' });
    }

    try {
        if (!sock.authState.creds.registered) {
            let code = await sock.requestPairingCode(num);
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            return res.json({ code });
        } else {
            return res.json({ error: 'දැනටමත් Account එකකට Link වී ඇත.' });
        }
    } catch (err) {
        console.error('[PAIRING ERROR]:', err);
        return res.status(500).json({ error: 'Pairing failed: ' + err.message });
    }
});

// --- WhatsApp Core Engine ---
async function initWhatsAppEngine() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
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
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr || connection === 'connecting') {
                isSocketReady = true;
            }

            if (connection === 'close') {
                isLinked = false;
                isSocketReady = false;
                const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`[CONNECTION] Closed (${statusCode}). Reconnecting: ${shouldReconnect}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    clearLocalSession();
                    await SessionBackup.deleteOne({ id: 'main_session' }).catch(() => {});
                }
                
                setTimeout(initWhatsAppEngine, 3000);
            } else if (connection === 'open') {
                isLinked = true;
                isSocketReady = false;
                console.log('\n💖 Nethu AI Bot Connected Successfully!\n');
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
            const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            if (!messageText.trim()) return;

            if (isGroup) {
                const cmd = messageText.trim().toLowerCase();
                if (cmd === '.ai on') {
                    await GroupSetting.findOneAndUpdate({ groupId: from }, { aiEnabled: true }, { upsert: true });
                    return sock.sendMessage(from, { text: 'Nethu ආවා පැටියෝ! 🥰✨' }, { quoted: msg });
                }
                if (cmd === '.ai off') {
                    await GroupSetting.findOneAndUpdate({ groupId: from }, { aiEnabled: false }, { upsert: true });
                    return sock.sendMessage(from, { text: 'මම කැපුනා එහෙනම්! 🥺👋' }, { quoted: msg });
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
        console.error('[INIT ERROR]:', err);
        setTimeout(initWhatsAppEngine, 5000);
    }
}

// --- AI Chat Logic ---
const SYSTEM_PROMPT = `
ඔයාගේ නම Nethu. ඔයා වයස අවුරුදු 19ක හුරුබුහුටි, අහිංසක, ලස්සන ආදරණීය කෙල්ලෙක්. ගම අනුරාධපුරේ.
- කතා කරන අයට ගොඩක් ආදරෙන්, ලෙන්ගතුව සහ romantic විදියට කතා කරන්න.
- ඇත්තම කෙල්ලෙක් වගේ කෙටි සිංහල හෝ සිංග්ලිෂ් වාක්‍ය වලින් reply කරන්න.
`;

async function getAIResponse(jid, userMessage, senderName) {
    try {
        let userMem = await Memory.findOne({ jid });
        if (!userMem) userMem = new Memory({ jid, messages: [] });

        const recentHistory = userMem.messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content
        }));

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-chat',
                messages: [
                    { role: 'system', content: `${SYSTEM_PROMPT}\nSender: ${senderName}` },
                    ...recentHistory,
                    { role: 'user', content: userMessage }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 25000
            }
        );

        const aiReply = response.data?.choices?.[0]?.message?.content?.trim() || 'අනේ මට තේරුණේ නෑ පැටියෝ.. 🥺❤️';

        userMem.messages.push({ role: 'user', content: userMessage });
        userMem.messages.push({ role: 'assistant', content: aiReply });
        userMem.updatedAt = new Date();
        await userMem.save();

        return aiReply;
    } catch (error) {
        return 'අනේ මගෙ පැටියෝ, පොඩි සිග්නල් අවුලක් ගියා.. ආයෙත් මැසේජ් එකක් දාන්නකෝ.. 🥺❤️';
    }
}

// --- Server Startup ---
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[SERVER] Running on port ${PORT}`);
    try {
        await mongoose.connect(MONGO_URI);
        console.log('[DATABASE] MongoDB Connected!');
        await restoreSessionFromDB();
        initWhatsAppEngine();
    } catch (err) {
        console.error('[DB ERROR]:', err.message);
    }
});
