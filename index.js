import baileys from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import axios from 'axios';
import express from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const baileysModule = baileys.default || baileys;
const makeWASocket = baileysModule.default || baileysModule;
const {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    Browsers
} = baileysModule;

const PORT = process.env.PORT || 10000;
const OPENROUTER_API_KEY = "Sk-or-v1-49e4e4ecd1ad03c590399fa189e608e277356eb1d76686bdf986a40201c3596b";
const MONGO_URI = "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0";
const SESSION_DIR = './auth_info_baileys';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock = null;

// --- Database Schemas ---
const multiSessionSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true }
});
const MultiSession = mongoose.models.MultiSession || mongoose.model('MultiSession', multiSessionSchema);

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

async function syncSessionToDB() {
    try {
        if (!fs.existsSync(SESSION_DIR)) return;
        const files = fs.readdirSync(SESSION_DIR);
        for (const file of files) {
            const filePath = path.join(SESSION_DIR, file);
            if (fs.lstatSync(filePath).isFile()) {
                const data = fs.readFileSync(filePath, 'utf-8');
                await MultiSession.updateOne(
                    { key: file },
                    { value: data },
                    { upsert: true }
                );
            }
        }
    } catch (e) {
        console.error('[DB SYNC ERROR]:', e.message);
    }
}

async function restoreSessionFromDB() {
    try {
        const records = await MultiSession.find({});
        if (records.length > 0) {
            if (!fs.existsSync(SESSION_DIR)) {
                fs.mkdirSync(SESSION_DIR, { recursive: true });
            }
            for (const item of records) {
                fs.writeFileSync(path.join(SESSION_DIR, item.key), item.value);
            }
            console.log('[SESSION] Previous session restored from MongoDB.');
            return true;
        }
    } catch (e) {
        console.error('[RESTORE ERROR]:', e.message);
    }
    return false;
}

// Web UI
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nethu AI - Pairing</title>
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
            #codeDisplay span { font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #25d366; display: block; margin-top: 6px; }
            .copy-btn { margin-top: 12px; background: #374248; color: #e9edef; padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 6px; width: auto; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>Nethu AI Bot 💖</h1>
            <p>WhatsApp අංකය ඇතුළත් කර Pairing Code එක ගන්න</p>
            <input type="text" id="phone" placeholder="947xxxxxxxx" />
            <button id="btn" onclick="getCode()">Pairing Code එක ගන්න</button>
            
            <div id="codeDisplay">
                <p style="margin:0; font-size:12px; color:#8696a0;">තත්පර 30ක් ඇතුළත WhatsApp එකට Enter කරන්න:</p>
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

                btn.innerText = 'Code එක සකස් කරමින් පවතී (තත්පර 5ක් ඉන්න)...';
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

// Pairing Code Generator Endpoint (Null Proof)
app.get('/code', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Number is required' });

    num = num.replace(/[^0-9]/g, '');
    if (num.startsWith('0')) {
        num = '94' + num.slice(1);
    }

    try {
        // පරණ session folder එක සහ DB records ක්ලියර් කර fresh start එකක් ගැනීම
        if (fs.existsSync(SESSION_DIR)) {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        }
        await MultiSession.deleteMany({});

        // අලුත් socket instance එකක් හදලා ready වෙනකල් බලා සිටීම
        sock = await createNewSocket();
        await delay(3500);

        if (!sock) {
            return res.status(500).json({ error: 'Socket එක සෑදීමට නොහැකි විය. නැවත උත්සාහ කරන්න.' });
        }

        let code = await sock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log(`[PAIRING] New Pairing Code generated for ${num}: ${code}`);
        return res.json({ code });
    } catch (err) {
        console.error('[PAIR CODE ERROR]:', err);
        return res.status(500).json({ error: 'කෝඩ් එක ලබාගැනීමට නොහැකි විය: ' + err.message });
    }
});

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

// Socket Creator Function
async function createNewSocket() {
    if (sock) {
        try { sock.end(); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: 'silent' });

    const newSock = makeWASocket({
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

    newSock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[CONNECTION] Closed (${statusCode}). Reconnecting: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(createNewSocket, 4000);
            }
        } else if (connection === 'open') {
            console.log('\n💖 Nethu AI Bot Connected & Ready to Love!\n');
            await syncSessionToDB();
        }
    });

    newSock.ev.on('creds.update', async () => {
        await saveCreds();
        await syncSessionToDB();
    });

    newSock.ev.on('messages.upsert', async ({ messages, type }) => {
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
                await newSock.sendMessage(from, { text: 'Nethu ඔයාලා හැමෝටම ආදරේ දෙන්න ආවා පැටියෝ! 🥰✨' }, { quoted: msg });
                return;
            }

            if (cmd === '.ai off') {
                await GroupSetting.findOneAndUpdate(
                    { groupId: from },
                    { aiEnabled: false },
                    { upsert: true }
                );
                await newSock.sendMessage(from, { text: 'මම මේ group එකෙන් අයින් වෙලා ඉන්නම් එහෙනම්.. බායි මගෙ රත්තරංලා! 🥺👋' }, { quoted: msg });
                return;
            }

            const groupConfig = await GroupSetting.findOne({ groupId: from });
            if (!groupConfig || !groupConfig.aiEnabled) return;
        }

        await newSock.sendPresenceUpdate('composing', from);
        const aiReply = await getAIResponse(from, messageText, senderName);
        await newSock.sendPresenceUpdate('paused', from);

        await newSock.sendMessage(from, { text: aiReply }, { quoted: msg });
    });

    return newSock;
}

// Start Server & Connect MongoDB
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[SERVER] Express server running on port ${PORT}`);
    try {
        await mongoose.connect(MONGO_URI);
        console.log('[DATABASE] MongoDB connected successfully!');
        
        const hasSession = await restoreSessionFromDB();
        if (hasSession) {
            sock = await createNewSocket();
        }
    } catch (err) {
        console.error('[DATABASE] Connection error:', err.message);
    }
});
