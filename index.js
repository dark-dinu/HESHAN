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

// Auto reset broken session & generate pairing code directly
app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Phone number is required' });

    num = num.replace(/[^0-9]/g, '');

    try {
        // පරණ session data තිබුණොත් clean කරලා fresh socket එකකින් code එක ගැනීම
        if (sock?.authState?.creds?.registered) {
            try {
                const AuthModel = mongoose.model('SessionData');
                await AuthModel.deleteMany({});
                console.log('Old session purged. Initializing fresh pairing socket...');
                sock.authState.creds = initAuthCreds();
            } catch (e) {}
        }

        if (!sock) {
            return res.status(503).json({ error: 'Bot engine is starting up. Wait 3 seconds and click again.' });
        }

        // Wait brief moment for socket readiness
        await new Promise(resolve => setTimeout(resolve, 1500));

        const code = await sock.requestPairingCode(num);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        
        console.log(`✅ Pairing Code successfully generated: ${formattedCode}`);
        return res.json({ code: formattedCode });

    } catch (err) {
        console.error('Pairing Code Generation Error:', err);
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

async function startBot() {
    try {
        if (!isInitialized) {
            await connectDB();
            isInitialized = true;
        }

        const { state, saveCreds } = await useMongoDBAuthState();
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
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    setTimeout(startBot, 3000);
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp connection opened successfully!');
                try {
                    const myNumber = (sock.user?.id ? sock.user.id.split(':')[0] : '') + '@s.whatsapp.net';
                    if (myNumber.length > 15) {
                        await sock.sendMessage(myNumber, { text: '*Dinu AI Assistant Ready... ⚡*' });
                    }
                } catch (e) {}
            }
        });

        sock.ev.on('messages.upsert', (msgUpdate) => {
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
                handleMessage(sock, msgUpdate);
            }
        });

    } catch (err) {
        console.error('Bot Startup Error:', err);
        setTimeout(startBot, 5000);
    }
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

startBot();
