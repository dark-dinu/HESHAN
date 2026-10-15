const express = require('express');
const path = require('path');
const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    proto,
    initAuthCreds
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

// 1. ISOLATED FRESH PAIRING ENDPOINT
app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Phone number is required' });

    num = num.replace(/[^0-9]/g, '');

    try {
        // පරණ session එක DB එකෙන් ඉවත් කිරීම
        try {
            const AuthModel = mongoose.model('SessionData');
            await AuthModel.deleteMany({});
        } catch (e) {}

        const { state, saveCreds } = await useMongoDBAuthState();
        const { version } = await fetchLatestBaileysVersion();

        // Fresh standalone socket for pairing only
        const pairSock = makeWASocket({
            version,
            logger: pino({ level: 'fatal' }),
            auth: state,
            syncFullHistory: false,
            markOnlineOnConnect: false
        });

        pairSock.ev.on('creds.update', saveCreds);

        // Wait 2.5 seconds for WhatsApp handshake
        await new Promise(resolve => setTimeout(resolve, 2500));

        const code = await pairSock.requestPairingCode(num);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

        // Code එක ලැබුණු පසු Background එකෙන් main bot එක start වීම
        pairSock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log('✅ Paired & WhatsApp connected successfully!');
                sock = pairSock;
                setupMessageListener(sock);
            }
        });

        return res.json({ code: formattedCode });

    } catch (err) {
        console.error('Pairing Error:', err);
        return res.status(500).json({ error: 'Failed: ' + (err.message || 'Please try again') });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || config.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Web server listening on port ${PORT}`);
});

function setupMessageListener(activeSock) {
    activeSock.ev.on('messages.upsert', (msgUpdate) => {
        for (const m of msgUpdate.messages || []) {
            if (m.key?.id && m.message) {
                messageStore.set(m.key.id, m.message);
                if (messageStore.size > 500) {
                    const oldestKey = messageStore.keys().next().value;
                    messageStore.delete(oldestKey);
                }
            }
        }

        if (msgUpdate.type === 'notify') {
            handleMessage(activeSock, msgUpdate);
        }
    });
}

// 2. MAIN ENGINE AUTO-BOOT (For existing valid session)
async function startBot() {
    try {
        if (!isInitialized) {
            await connectDB();
            isInitialized = true;
        }

        const { state, saveCreds } = await useMongoDBAuthState();
        
        // Session එකක් දැනටමත් නැත්නම් Pair site එකෙන් code එක ගන්නා තෙක් wait කිරීම
        if (!state.creds?.registered && !state.creds?.me) {
            console.log('⚡ No active session found. Waiting for pairing via web...');
            return;
        }

        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger: pino({ level: 'fatal' }),
            auth: state,
            syncFullHistory: false,
            markOnlineOnConnect: false,
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
                console.log('✅ WhatsApp connected!');
                try {
                    const myNumber = (sock.user?.id ? sock.user.id.split(':')[0] : '') + '@s.whatsapp.net';
                    if (myNumber.length > 15) {
                        await sock.sendMessage(myNumber, { text: '*Dinu AI Assistant Ready... ⚡*' });
                    }
                } catch (e) {}
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
