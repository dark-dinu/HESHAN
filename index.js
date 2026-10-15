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
const { handleMessage } = require('./handler');

let sock = null;
let isInitialized = false;
const messageStore = new Map();

const app = express();

// Serve static HTML UI
app.use(express.static(path.join(__dirname, 'public')));

// Pair code endpoint with full error diagnosis
app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Phone number is required' });

    num = num.replace(/[^0-9]/g, '');

    try {
        if (!sock) {
            return res.status(503).json({ error: 'Socket is starting up. Wait 5 seconds and try again.' });
        }

        // Check if bot is already linked/authenticated
        if (sock.authState?.creds?.registered) {
            return res.status(200).json({ 
                error: 'Bot is already connected to WhatsApp! No need to pair again. Check your WhatsApp inbox.' 
            });
        }

        if (!sock.requestPairingCode) {
            return res.status(500).json({ error: 'Pairing code function not available on this socket.' });
        }

        // Delay 1 second to make sure socket is ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        const code = await sock.requestPairingCode(num);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.json({ code: formattedCode });

    } catch (err) {
        console.error('Pairing Code Request Error:', err);
        return res.status(500).json({ error: 'Failed to request pairing code: ' + (err.message || 'Unknown error') });
    }
});

// Root fallback to ensure HTML loads
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Bind Port for Render
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
                console.log('Connection closed, reconnecting:', shouldReconnect);
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

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

startBot();
