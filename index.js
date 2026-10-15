const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { connectDB } = require('./database');
const { useMongoDBAuthState } = require('./auth');
const { loadCommands, handleMessage } = require('./handler');

async function startBot() {
    await connectDB();
    loadCommands();

    const { state, saveCreds } = await useMongoDBAuthState();
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        syncFullHistory: false,
        markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            await sock.sendMessage(userJid, { text: '*Connected... ✔️*' });
        }
    });

    sock.ev.on('messages.upsert', (msgUpdate) => {
        if (msgUpdate.type === 'notify') {
            handleMessage(sock, msgUpdate);
        }
    });
}

startBot();
