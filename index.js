const express = require('express');
const path = require('path');
const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    proto
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const { connectDB } = require('./database');
const { useMongoDBAuthState } = require('./auth');
const { loadCommands, handleMessage } = require('./handler');

let sock = null;
let isInitialized = false;

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
        loadCommands();
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
        fireInitQueries: false,
        shouldSyncHistoryMessage: () => false,
        getMessage: async () => proto.Message.fromObject({})
    });

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
                    await sock.sendMessage(myNumber, { text: '*Connected... ✔️*' });
                }
            } catch (e) {}
        }
    });

    // Zero-lag event trigger
    sock.ev.on('messages.upsert', (msgUpdate) => {
        if (msgUpdate.type === 'notify') {
            handleMessage(sock, msgUpdate);
        }
    });
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

startBot();
