import pkg from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import axios from 'axios';
import express from 'express';
import mongoose from 'mongoose';
import { useMongoDBAuthState } from './auth.js';

const makeWASocket = pkg.default?.default || pkg.default || pkg;
const {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
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

// --- Built-in Pairing Site UI ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nethu AI - Pairing Web</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            body { background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #1e293b; padding: 30px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 420px; width: 100%; text-align: center; border: 1px solid #334155; }
            h1 { font-size: 26px; margin-bottom: 8px; color: #f43f5e; }
            p { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
            input { width: 100%; padding: 14px; border-radius: 12px; border: 1px solid #475569; background: #0f172a; color: #fff; font-size: 16px; margin-bottom: 16px; outline: none; }
            input:focus { border-color: #f43f5e; }
            button { width: 100%; padding: 14px; border-radius: 12px; border: none; background: #f43f5e; color: #fff; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.2s; }
            button:hover { background: #e11d48; }
            #codeDisplay { display: none; margin-top: 25px; padding: 16px; background: #0f172a; border-radius: 12px; border: 2px dashed #f43f5e; }
            #codeDisplay span { font-size: 26px; font-weight: bold; letter-spacing: 5px; color: #38bdf8; display: block; margin-top: 8px; }
            .copy-btn { margin-top: 12px; background: #334155; padding: 8px; font-size: 13px; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>Nethu AI Bot 💖</h1>
            <p>WhatsApp අංකය ඇතුළත් කර Pairing Code එක ලබාගන්න</p>
            <input type="text" id="phone" placeholder="947xxxxxxxx (0 නැතුව)" />
            <button id="btn" onclick="getCode()">Pairing Code එක ගන්න</button>
            
            <div id="codeDisplay">
                <p style="margin:0; font-size:12px;">ඔබගේ Pairing Code එක (තත්පර 20ක් ඇතුළත Link කරන්න):</p>
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

                btn.innerText = 'Code එක හදනවා...';
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

// Pairing Code Endpoint
app.get('/code', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Number is required' });

    num = num.replace(/[^0-9]/g, '');
    if (num.startsWith('0')) {
        num = '94' + num.slice(1);
    }

    try {
        if (!sock) {
            return res.status(500).json({ error: 'Bot initialization වෙමින් පවතී. තත්පර 5කින් නැවත උත්සාහ කරන්න.' });
        }

        if (sock.authState?.creds?.registered) {
            return res.json({ error: 'WhatsApp bot එක දැනටමත් Link වී ඇත!' });
        }

        await delay(2000);
        let code = await sock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log(`[PAIRING] New code requested for ${num}: ${code}`);
        return res.json({ code });
    } catch (err) {
        console.error('[PAIR CODE API ERROR]:', err);
        return res.status(500).json({ error: 'Pairing code ලබා ගැනීමට නොහැකි විය: ' + err.message });
    }
});

// --- MongoDB Schemas ---
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

// Nethu Character Prompt
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

// Bot Startup
async function startBot() {
    try {
        const { state, saveCreds } = await useMongoDBAuthState();
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
            // Official macOS Chrome Desktop signature එකෙන් Pairing error විසඳේ
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        sock.ev.on('connection.update', (update) => {
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

// Start Server & DB
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[SERVER] Express server bound to 0.0.0.0:${PORT}`);
    try {
        await mongoose.connect(MONGO_URI);
        console.log('[DATABASE] MongoDB connected successfully!');
        startBot();
    } catch (err) {
        console.error('[DATABASE] Connection error:', err.message);
    }
});
