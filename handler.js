const { processDinuRequest } = require('./dinu_agent');

async function handleMessage(sock, msg) {
    try {
        if (!msg || !msg.message) return;

        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') return;

        // Unpack messages from any wrapper
        let m = msg.message;
        if (m.ephemeralMessage) m = m.ephemeralMessage.message;
        if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
        if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

        // Extract message text
        const text = (m.conversation || 
                      m.extendedTextMessage?.text || 
                      m.imageMessage?.caption || 
                      m.videoMessage?.caption || '').trim();

        if (!text) return;

        // 1. TRIGGER CHECK: "dinu", "දිනූ", "දිනු" කොතැනක හෝ තිබේදැයි බැලීම
        const hasDinu = /dinu|දිනූ|දිනු/i.test(text);
        if (!hasDinu) return;

        // 2. OWNER DETECTION:
        // ඔයාට විතරක් කීකරු වීමට: ඔයා යැවූ මැසේජ් පමණක් filter කිරීම
        const myJidNum = sock.user?.id ? sock.user.id.split(':')[0].replace(/[^0-9]/g, '') : '';
        const senderNum = (msg.key.participant || jid).split(':')[0].replace(/[^0-9]/g, '');
        const isOwner = Boolean(msg.key.fromMe) || (myJidNum && senderNum === myJidNum) || jid.includes(myJidNum);

        // ඔයා කතා කරද්දී විතරයි Dinu activate වෙන්නේ
        if (!isOwner) return;

        console.log(`📩 [DINU DETECTED]: "${text}" in ${jid}`);

        // Typing Presence indicator
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});

        // Extract Quoted context
        const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
        let quotedMsg = null;
        if (quoted) {
            quotedMsg = quoted.ephemeralMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
        }

        // Live speed latency
        const now = Date.now();
        const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : now;
        let latency = now - msgTime;
        if (isNaN(latency) || latency < 0) latency = 8;

        // Get AI Response
        const reply = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

        await sock.sendPresenceUpdate('paused', jid).catch(() => {});

        // 3. PUBLIC VISIBILITY FIX:
        // Quoted message එක නිසා hide නොවී හැමෝටම පේන විදිහට direct text එක send කිරීම
        if (reply) {
            await sock.sendMessage(jid, { text: reply });
            console.log(`📤 [PUBLIC REPLY SENT]: "${reply}"`);
        }

    } catch (err) {
        console.error('Handler error:', err);
    }
}

module.exports = { handleMessage };
