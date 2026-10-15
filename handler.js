const { processDinuRequest } = require('./dinu_agent');

async function handleMessage(sock, msgUpdate) {
    try {
        const msg = msgUpdate.messages?.[0];
        if (!msg || !msg.message) return;

        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') return;

        // Message text extract කර ගැනීම
        let m = msg.message;
        if (m.ephemeralMessage) m = m.ephemeralMessage.message;
        if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;

        const body = m.conversation || 
                     m.extendedTextMessage?.text || 
                     m.imageMessage?.caption || 
                     m.videoMessage?.caption || '';

        const text = body.trim();
        if (!text) return;

        // 1. TRIGGER CHECK: "dinu", "Dinu", "දිනූ", "දිනු" වාක්‍යයේ ඕනෑම තැනක තිබේදැයි බැලීම
        const regexDinu = /\b(dinu)\b|dinu|දිනූ|දිනු/i;
        if (!regexDinu.test(text)) return;

        // 2. STRICT OWNER-ONLY CHECK:
        // ඔයාගෙන්ම එන මැසේජ් (fromMe) හෝ ඔයාගේම account එකේ Self Chat පමණක් භාර ගැනීම
        const myJidNum = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : '';
        const senderNum = (msg.key.participant || jid).split(':')[0].split('@')[0];
        const isFromMe = msg.key.fromMe || (myJidNum && senderNum === myJidNum);

        // වෙන කිසිම කෙනෙකුට Dinu කිසිම රිප්ලයි එකක් දෙන්නේ නැත
        if (!isFromMe) return;

        // Quoted message extract කිරීම
        const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
        let quotedMsg = null;
        if (quoted) {
            quotedMsg = quoted.ephemeralMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
        }

        // Live speed latency calculation
        const now = Date.now();
        const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : now;
        let latency = now - msgTime;
        if (isNaN(latency) || latency < 0) latency = 5;
        if (latency === 0) latency = 1;

        // React එක සම්පූර්ණයෙන්ම අයින් කර ඇත (Zero Reaction)

        // Process AI / Action Request
        const responseText = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

        // Direct Text Reply
        if (responseText) {
            await sock.sendMessage(jid, { text: responseText });
        }

    } catch (err) {
        console.error('Handler execution error:', err);
    }
}

module.exports = { handleMessage };
