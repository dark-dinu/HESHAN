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

        // 1. TRIGGER CHECK: "dinu", "Dinu", "දිනූ", "දිනු" වචනය තිබේදැයි බැලීම
        const regexDinu = /dinu|දිනූ|දිනු/i;
        if (!regexDinu.test(text)) return;

        // 2. OWNER CHECK:
        // Bot ගේම නම්බර් එකෙන් යැවූ මැසේජ් (fromMe) හෝ self chat පමණක් භාරගනී
        const isFromMe = Boolean(msg.key.fromMe);
        const myJid = sock.user?.id ? sock.user.id.split(':')[0] : '';
        const sender = (msg.key.participant || jid).split(':')[0];
        const isSelf = myJid && sender.includes(myJid);

        if (!isFromMe && !isSelf) {
            // අනුන් දාන මැසේජ් සම්පූර්ණයෙන්ම ignore වේ
            return;
        }

        console.log(`📩 Dinu Triggered by Owner: "${text}"`);

        // Quoted message extract කිරීම
        const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
        let quotedMsg = null;
        if (quoted) {
            quotedMsg = quoted.ephemeralMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
        }

        const now = Date.now();
        const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : now;
        let latency = now - msgTime;
        if (isNaN(latency) || latency < 0) latency = 5;
        if (latency === 0) latency = 1;

        // AI Request Processing
        const responseText = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

        // Direct Text Reply
        if (responseText) {
            await sock.sendMessage(jid, { text: responseText });
            console.log(`📤 Dinu Replied: "${responseText.slice(0, 40)}..."`);
        }

    } catch (err) {
        console.error('Handler Error:', err);
    }
}

module.exports = { handleMessage };
