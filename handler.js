const { processDinuRequest } = require('./dinu_agent');

async function handleMessage(sock, msg) {
    try {
        if (!msg || !msg.message) return;

        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') return;

        // Unpack wrappers (Ephemeral / ViewOnce / Document)
        let m = msg.message;
        if (m.ephemeralMessage) m = m.ephemeralMessage.message;
        if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
        if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

        // Extract Text
        const text = (m.conversation || 
                      m.extendedTextMessage?.text || 
                      m.imageMessage?.caption || 
                      m.videoMessage?.caption || '').trim();

        if (!text) return;

        // 1. Terminal එකේ අනිවාර්යයෙන්ම print වෙන්න Log එකක්
        console.log(`\n===================================`);
        console.log(`📩 INCOMING MSG DETECTED: "${text}"`);
        console.log(`📍 From: ${jid} | fromMe: ${msg.key.fromMe}`);
        console.log(`===================================\n`);

        // 2. Trigger check ("dinu" හෝ "දිනූ" තිබේදැයි බැලීම)
        const hasDinu = /dinu|දිනූ|දිනු/i.test(text);
        if (!hasDinu) return;

        // 3. Typing indicator එක යැවීම
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});

        // Quoted message අහු කරගැනීම
        const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
        let quotedMsg = null;
        if (quoted) {
            quotedMsg = quoted.ephemeralMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
        }

        // Process Reply
        const latency = 10;
        const reply = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

        await sock.sendPresenceUpdate('paused', jid).catch(() => {});

        if (reply) {
            await sock.sendMessage(jid, { text: reply }, { quoted: msg });
            console.log(`📤 [REPLY SENT TO WHATSAPP]: "${reply}"\n`);
        }

    } catch (err) {
        console.error('Handler execution error:', err);
    }
}

module.exports = { handleMessage };
