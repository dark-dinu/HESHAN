const express = require('express');
const path = require('path');
const https = require('https');
const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    proto,
    delay,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const mongoose = require('mongoose');
const config = require('./config');
const { connectDB } = require('./database');
const { useMongoDBAuthState } = require('./auth');
const { handleMessage } = require('./handler');

let sock = null;
let isInitialized = false;
const messageStore = new Map();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// 1. FRESH INSTANT PAIRING ENDPOINT
app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Phone number is required' });

    num = num.replace(/[^0-9]/g, '');

    try {
        // පරණ හිරවුණු session data Database එකෙන් ඉවත් කිරීම
        try {
            const AuthModel = mongoose.model('SessionData');
            await AuthModel.deleteMany({});
        } catch (e) {}

        if (sock) {
            try { sock.end(); } catch (e) {}
            sock = null;
        }

        const { state, saveCreds } = await useMongoDBAuthState();
        const { version } = await fetchLatestBaileysVersion();

        // Dedicated Keep-Alive Socket
        sock = makeWASocket({
            version,
            logger: pino({ level: 'fatal' }),
            auth: state,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            getMessage: async (key) => {
                if (key.id && messageStore.has(key.id)) {
                    return messageStore.get(key.id);
                }
                return proto.Message.fromObject({});
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Connection Handshake Listener
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log('✅ WhatsApp successfully paired & connected!');
                try {
                    const myNumber = (sock.user?.id ? sock.user.id.split(':')[0] : '') + '@s.whatsapp.net';
                    if (myNumber.length > 15) {
                        await sock.sendMessage(myNumber, { text: '*Dinu AI Assistant Ready... ⚡*' });
                    }
                } catch (e) {}
            } else if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(startBot, 3000);
                }
            }
        });

        setupMessageListener(sock);

        // Socket එක WhatsApp server එකට Handshake වන තෙක් තත්පර 3ක් රැඳී සිටීම
        await delay(3000);

        const code = await sock.requestPairingCode(num);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log(`✅ Fresh Pair Code Issued: ${formattedCode}`);
        return res.json({ code: formattedCode });

    } catch (err) {
        console.error('Pairing Error:', err);
        return res.status(500).json({ error: 'Pairing failed: ' + (err.message || 'Retry') });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/ping-server', (req, res) => {
    res.send('Server is alive! ⚡');
});

const PORT = process.env.PORT || config.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Web server listening on port ${PORT}`);
    
    // Auto Keep-Alive every 5 mins to prevent Render Sleep
    setInterval(() => {
        try {
            https.get(`https://heshan-zh7a.onrender.com/ping-server`, () => {});
        } catch (e) {}
    }, 5 * 60 * 1000);
});

function setupMessageListener(activeSock) {
    activeSock.ev.on('messages.upsert', async (msgUpdate) => {
        try {
            const messages = msgUpdate.messages || [];
            for (const m of messages) {
                if (m.key?.id && m.message) {
                    messageStore.set(m.key.id, m.message);
                    if (messageStore.size > 1000) {
                        const oldestKey = messageStore.keys().next().value;
                        messageStore.delete(oldestKey);
                    }
                }
                await handleMessage(activeSock, m);
            }
        } catch (e) {
            console.error('Upsert Listener Error:', e);
        }
    });
}

// Existing valid session එකකින් run වීම
async function startBot() {
    try {
        if (!isInitialized) {
            await connectDB();
            isInitialized = true;
        }

        const { state, saveCreds } = await useMongoDBAuthState();
        if (!state.creds?.registered && !state.creds?.me) {
            console.log('⚡ No session found. Waiting for pairing code from web...');
            return;
        }

        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger: pino({ level: 'fatal' }),
            auth: state,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            getMessage: async (key) => {
                if (key.id && messageStore.has(key.id)) {
                    return messageStore.get(key.id);
                }
                return proto.Message.fromObject({});
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(startBot, 3000);
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp connection resumed & active!');
            }
        });

        setupMessageListener(sock);

    } catch (err) {
        console.error('Bot Startup Error:', err);
    }
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

startBot();
