const { processDinuRequest } = require('./dinu_agent');

async function handleMessage(sock, msgUpdate) {
    try {
        const msg = msgUpdate.messages?.[0];
        if (!msg || !msg.message) return;

        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') return;

        // Message text extract කිරීම
        let m = msg.message;
        if (m.ephemeralMessage) m = m.ephemeralMessage.message;
        if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;

        const body = m.conversation || 
                     m.extendedTextMessage?.text || 
                     m.imageMessage?.caption || 
                     m.videoMessage?.caption || '';

        const text = body.trim();
        if (!text) return;

        // 1. "dinu" හෝ "දිනූ" / "දිනු" වචනය කොතැනක හෝ තිබේදැයි බැලීම
        const regexDinu = /dinu|දිනූ|දිනු/i;
        if (!regexDinu.test(text)) return;

        // 2. OWNER DETECTION:
        // Bot run වෙන Phone Number එක extract කර ගැනීම
        const myFullId = sock.user?.id || '';
        const botNumber = myFullId.split(':')[0].replace(/[^0-9]/g, '');

        // Message එක එවපු කෙනාගේ Number එක extract කර ගැනීම
        const senderJid = msg.key.participant || jid;
        const senderNumber = senderJid.split(':')[0].replace(/[^0-9]/g, '');

        // ඔයා යැවූ මැසේජ් එකක්ද (fromMe) හෝ ඔයාගේම නම්බර් එකෙන් ආපු එකක්ද කියා පරීක්ෂා කිරීම
        const isOwner = msg.key.fromMe || (botNumber && senderNumber === botNumber);

        // ඔයාට හැර වෙන කිසිම කෙනෙකුට රිප්ලයි නොකිරීම
        if (!isOwner) return;

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

        // AI Request Processing
        const responseText = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

        // Direct Text Reply (No reactions)
        if (responseText) {
            await sock.sendMessage(jid, { text: responseText });
        }

    } catch (err) {
        console.error('Handler error:', err);
    }
}

module.exports = { handleMessage };
