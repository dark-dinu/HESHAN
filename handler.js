const { processDinuRequest } = require('./dinu_agent');

async function handleMessage(sock, msgUpdate) {
    try {
        const msg = msgUpdate.messages?.[0];
        if (!msg || !msg.message) return;

        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') return;

        // Unpack Ephemeral / ViewOnce wrappers
        let m = msg.message;
        if (m.ephemeralMessage) m = m.ephemeralMessage.message;
        if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
        if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

        // Extract raw text
        const body = m.conversation || 
                     m.extendedTextMessage?.text || 
                     m.imageMessage?.caption || 
                     m.videoMessage?.caption || '';

        const text = body.trim();
        if (!text) return;

        // 1. TRIGGER DETECTION: "dinu", "දිනූ", "දිනු" (Case-insensitive anywhere in text)
        const dinuRegex = /\b(dinu)\b|dinu|දිනූ|දිනු/i;
        if (!dinuRegex.test(text)) return;

        // 2. ABSOLUTE OWNER DETECTION:
        // Bot's own phone digits
        const myRawId = sock.user?.id || '';
        const botNumber = myRawId.split(':')[0].replace(/[^0-9]/g, '');

        // Sender's phone digits
        const senderRaw = msg.key.participant || jid;
        const senderNumber = senderRaw.split(':')[0].replace(/[^0-9]/g, '');

        // Check if message is from you (fromMe OR same number in private/self chat)
        const isFromMe = Boolean(msg.key.fromMe);
        const isOwnerNumber = Boolean(botNumber && senderNumber && botNumber === senderNumber);
        const isSelfChat = jid.includes(botNumber);

        if (!isFromMe && !isOwnerNumber && !isSelfChat) {
            // Stranger messages are strictly ignored
            return;
        }

        console.log(`⚡ [DINU TRIGGERED]: "${text}" from ${senderNumber}`);

        // Typing indicator so you know Dinu is processing
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});

        // Quoted message context extraction
        const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
        let quotedMsg = null;
        if (quoted) {
            quotedMsg = quoted.ephemeralMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
        }

        // Latency calculation
        const now = Date.now();
        const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : now;
        let latency = now - msgTime;
        if (isNaN(latency) || latency < 0) latency = 12;

        // Execute AI / Action Engine
        const reply = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

        // Turn off typing indicator
        await sock.sendPresenceUpdate('paused', jid).catch(() => {});

        // Send reply back to owner
        if (reply) {
            await sock.sendMessage(jid, { text: reply }, { quoted: msg });
            console.log(`✔️ [DINU REPLIED]: ${reply.slice(0, 40)}...`);
        }

    } catch (err) {
        console.error('Fatal Handler Error:', err);
    }
}

module.exports = { handleMessage };
