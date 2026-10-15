const express = require('express');
const path = require('path');
const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const { connectDB } = require('./database');
const { useMongoDBAuthState } = require('./auth');
const { loadCommands, handleMessage } = require('./handler');

let sock = null;
let isStarted = false;

// 1. Web Server Setup
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Pair code request endpoint
app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Phone number is required' });

    num = num.replace(/[^0-9]/g, '');

    try {
        if (!sock || !sock.requestPairingCode) {
            return res.status(503).json({ error: 'Socket is initializing, retry in a moment' });
        }

        if (sock.authState?.creds?.registered) {
            return res.status(400).json({ error: 'Bot is already registered and authenticated' });
        }

        const code = await sock.requestPairingCode(num);
        return res.json({ code: code?.match(/.{1,4}/g)?.join('-') || code });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to request pairing code' });
    }
});

app.listen(config.PORT, () => {
    // Port ready for web traffic and cloud health checks
});

// 2. Core Bot Engine
async function startBot() {
    if (!isStarted) {
        await connectDB();
        loadCommands();
        isStarted = true;
    }

    const { state, saveCreds } = await useMongoDBAuthState();
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        syncFullHistory: false,
        markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            try {
                const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                await sock.sendMessage(userJid, { text: '*Connected... ✔️*' });
            } catch (e) {}
        }
    });

    sock.ev.on('messages.upsert', (msgUpdate) => {
        if (msgUpdate.type === 'notify') {
            handleMessage(sock, msgUpdate);
        }
    });
}

// Global safe crash prevention
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

startBot();
