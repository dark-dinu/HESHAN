const { processDinuRequest } = require('./dinu_agent');

async function handleMessage(sock, msgUpdate) {
    try {
        if (!msgUpdate.messages || msgUpdate.messages.length === 0) return;

        for (const msg of msgUpdate.messages) {
            if (!msg.message) continue;

            const jid = msg.key.remoteJid;
            if (!jid || jid === 'status@broadcast') continue;

            // Raw message text extract කිරීම
            let m = msg.message;
            if (m.ephemeralMessage) m = m.ephemeralMessage.message;
            if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;

            const text = (m.conversation || 
                          m.extendedTextMessage?.text || 
                          m.imageMessage?.caption || 
                          m.videoMessage?.caption || '').trim();

            if (!text) continue;

            // WhatsApp එකට එන හැම මැසේජ් එකක්ම Render Console එකේ Print කරමු!
            console.log(`\n==============================`);
            console.log(`📩 INCOMING MSG: "${text}"`);
            console.log(`📍 From JID: ${jid}`);
            console.log(`👤 fromMe: ${msg.key.fromMe}`);
            console.log(`==============================\n`);

            // "dinu" හෝ "දිනූ" තිබේදැයි සරලව බැලීම
            const hasDinu = /dinu|දිනූ|දිනු/i.test(text);
            if (!hasDinu) continue;

            // Typing status
            await sock.sendPresenceUpdate('composing', jid).catch(() => {});

            const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
            let quotedMsg = null;
            if (quoted) {
                quotedMsg = quoted.ephemeralMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
            }

            const latency = 10;

            // AI / Fallback call
            const reply = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

            await sock.sendPresenceUpdate('paused', jid).catch(() => {});

            if (reply) {
                await sock.sendMessage(jid, { text: reply });
                console.log(`📤 SENT REPLY: "${reply}"\n`);
            }
        }
    } catch (err) {
        console.error('Handler Diagnostic Error:', err);
    }
}

module.exports = { handleMessage };
