const express = require('express');
const path = require('path');
const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const { connectDB } = require('./database');
const { useMongoDBAuthState } = require('./auth');
const { handleMessage } = require('./handler');

let sock = null;
let isInitialized = false;

const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Phone number is required' });

    num = num.replace(/[^0-9]/g, '');

    try {
        if (!sock || !sock.requestPairingCode) {
            return res.status(503).json({ error: 'Socket initializing, retry in a moment' });
        }

        if (sock.authState?.creds?.registered) {
            return res.status(400).json({ error: 'Already authenticated' });
        }

        const code = await sock.requestPairingCode(num);
        return res.json({ code: code?.match(/.{1,4}/g)?.join('-') || code });
    } catch (err) {
        return res.status(500).json({ error: 'Pairing failed' });
    }
});

app.listen(config.PORT, () => {});

async function startBot() {
    if (!isInitialized) {
        await connectDB();
        isInitialized = true;
    }

    const { state, saveCreds } = await useMongoDBAuthState();
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        getMessage: async (key) => {
            if (store) {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg?.message || undefined;
            }
            return undefined;
        }
    });

    store?.bind(sock.ev);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(startBot, 2000);
            }
        } else if (connection === 'open') {
            try {
                const myNumber = (sock.user?.id ? sock.user.id.split(':')[0] : '') + '@s.whatsapp.net';
                if (myNumber.length > 15) {
                    await sock.sendMessage(myNumber, { text: '*Dinu AI Assistant Ready... ⚡*' });
                }
            } catch (e) {}
        }
    });

    sock.ev.on('messages.upsert', (msgUpdate) => {
        if (msgUpdate.type === 'notify') {
            handleMessage(sock, msgUpdate);
        }
    });
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

startBot();
