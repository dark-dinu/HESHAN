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
    delay,
    Browsers
} = pkg;

const PORT = process.env.PORT || 10000;
const OPENROUTER_API_KEY = "Sk-or-v1-49e4e4ecd1ad03c590399fa189e608e277356eb1d76686bdf986a40201c3596b";
const MONGO_URI = "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock = null;

// --- MongoDB Database Connection & Schemas ---
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

// MongoDB Backup Helper: Render restart වූ විට session එක restore කිරීමට
async function restoreSessionFromDB() {
    try {
        const backup = await SessionBackup.findOne({ id: 'main_session' });
        if (backup && backup.sessionData) {
            if (!fs.existsSync('./session')) fs.mkdirSync('./session');
            for (const [filename, content] of Object.entries(backup.sessionData)) {
                fs.writeFileSync(`./session/${filename}`, content);
            }
            console.log('[DATABASE] Previous WhatsApp session restored successfully!');
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
        console.log('[DATABASE] Session state safely backed up to MongoDB!');
    } catch (e) {
        console.error('[BACKUP ERROR]:', e.message);
    }
}

// --- Built-in Pairing Web Page ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nethu AI - One-Shot Fast Pairing</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
            body { background: #0b141a; color: #e9edef; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #111b21; padding: 32px; border-radius: 20px; box-shadow: 0 12px 30px rgba(0,0,0,0.6); max-width: 420px; width: 100%; text-align: center; border: 1px solid #202c33; }
            h1 { font-size: 24px; margin-bottom: 6px; color: #00a884; }
            p { font-size: 13px; color: #8696a0; margin-bottom: 22px; }
            input { width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #2a3942; background: #202c33; color: #fff; font-size: 16px; margin-bottom: 16px; outline: none; text-align: center; letter-spacing: 1px; }
            input:focus { border-color: #00a884; }
            button { width: 100%; padding: 14px; border-radius: 10px; border: none; background: #00a884; color: #111b21; font-size: 15px; font-weight: 700; cursor: pointer; transition: 0.2s; }
            button:hover { background: #02906f; }
            #codeDisplay { display: none; margin-top: 22px; padding: 18px; background: #202c33; border-radius: 12px; border: 2px dashed #00a884; }
            #codeDisplay span { font-size: 30px; font-weight: 800; letter-spacing: 6px; color: #25d366; display: block; margin-top: 6px; }
            .copy-btn { margin-top: 12px; background: #374248; color: #e9edef; padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 6px; width: auto; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>Nethu AI Bot 💖</h1>
            <p>WhatsApp අංකය ඇතුළත් කර Pairing Code එක ලබාගන්න</p>
            <input type="text" id="phone" placeholder="947xxxxxxxx" />
            <button id="btn" onclick="getCode()">Pairing Code එක ගන්න</button>
            
            <div id="codeDisplay">
                <p style="margin:0; font-size:12px; color:#8696a0;">WhatsApp එකට ඇතුළත් කරන්න:</p>
                <span id="pairingCode">----</span>
                <button class="copy-btn" onclick="copyCode()">Copy Code</button>
            </div>
        </div>

        <script>
            async function getCode() {
                const phone = document.getElementById('phone').value.trim();
                const btn = document.getElementById('btn');
                const display = document.getElementById('codeDisplay');
                const codeSpan = document.getElementById('pairingCode');

                if (!phone || phone.length < 9) {
                    alert('කරුණාකර නිවැරදි WhatsApp අංකයක් ඇතුළත් කරන්න!');
                    return;
                }

                btn.innerText = 'කෝඩ් එක සකස් කරමින්...';
                btn.disabled = true;

                try {
                    const res = await fetch('/code?number=' + encodeURI(phone));
                    const data = await res.json();
                    if (data.code) {
                        display.style.display = 'block';
                        codeSpan.innerText = data.code;
                    } else {
                        alert(data.error || 'ගැටලුවක් මතු විය. නැවත උත්සාහ කරන්න.');
                    }
                } catch(e) {
                    alert('Error: ' + e.message);
                } finally {
                    btn.innerText = 'Pairing Code එක ගන්න';
                    btn.disabled = false;
                }
            }

            function copyCode() {
                const code = document.getElementById('pairingCode').innerText;
                navigator.clipboard.writeText(code);
                alert('Code එක Copy කරගත්තා: ' + code);
            }
        </script>
    </body>
    </html>
    `);
});

// Fast Pairing Code Endpoint
app.get('/code', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Number is required' });

    num = num.replace(/[^0-9]/g, '');
    if (num.startsWith('0')) {
        num = '94' + num.slice(1);
    }

    try {
        if (sock?.authState?.creds?.registered) {
            return res.json({ error: 'WhatsApp bot එක දැනටමත් Link වී ඇත!' });
        }

        // Clean local session for a fresh start
        if (fs.existsSync('./session')) {
            fs.rmSync('./session', { recursive: true, force: true });
        }
        await SessionBackup.deleteMany({});
        await startBot();
        await delay(2500);

        let code = await sock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log(`[PAIRING] Zero-Latency Code Generated for ${num}: ${code}`);
        return res.json({ code });
    } catch (err) {
        console.error('[PAIR CODE ERROR]:', err);
        return res.status(500).json({ error: 'කෝඩ් එක ලබාගැනීමට නොහැකි විය: ' + err.message });
    }
});

// Nethu Character Persona
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

// Bot Initializer
async function startBot() {
    try {
        if (sock) {
            try { sock.end(); } catch (e) {}
        }

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

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`[CONNECTION] Closed (${statusCode}). Reconnecting: ${shouldReconnect}`);
                if (shouldReconnect) {
                    setTimeout(startBot, 4000);
                }
            } else if (connection === 'open') {
                console.log('\n💖 Nethu AI Bot Connected & Ready to Love!\n');
                // Link වූ විගස MongoDB එකට session backup කිරීම
                await backupSessionToDB();
            }
        });

        sock.ev.on('creds.update', async () => {
            await saveCreds();
            // Auth update වන විට background sync
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
        console.error('[BOT INIT ERROR]:', err);
        setTimeout(startBot, 5000);
    }
}

// Server Startup
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[SERVER] Express bound to 0.0.0.0:${PORT}`);
    try {
        await mongoose.connect(MONGO_URI);
        console.log('[DATABASE] MongoDB connected successfully!');
        await restoreSessionFromDB();
        startBot();
    } catch (err) {
        console.error('[DATABASE] Connection error:', err.message);
    }
});
