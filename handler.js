const { processDinuRequest } = require('./dinu_agent');

async function handleMessage(sock, msg) {
    try {
        if (!msg || !msg.message) return;

        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') return;

        // Message text extraction
        let m = msg.message;
        if (m.ephemeralMessage) m = m.ephemeralMessage.message;
        if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
        if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

        const text = (m.conversation || 
                      m.extendedTextMessage?.text || 
                      m.imageMessage?.caption || 
                      m.videoMessage?.caption || '').trim();

        if (!text) return;

        // Dinu trigger check
        const hasDinu = /dinu|දිනූ|දිනු/i.test(text);
        if (!hasDinu) return;

        // Strict Owner Check (ඔයා යවන මැසේජ් පමණි)
        const myJidNum = sock.user?.id ? sock.user.id.split(':')[0].replace(/[^0-9]/g, '') : '';
        const senderNum = (msg.key.participant || jid).split(':')[0].replace(/[^0-9]/g, '');
        const isOwner = Boolean(msg.key.fromMe) || (myJidNum && senderNum === myJidNum) || jid.includes(myJidNum);

        if (!isOwner) return;

        console.log(`📩 [TRIGGERED IN CHAT]: ${jid} -> "${text}"`);

        // Typing presence
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});

        const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
        let quotedMsg = null;
        if (quoted) {
            quotedMsg = quoted.ephemeralMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
        }

        const now = Date.now();
        const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : now;
        let latency = now - msgTime;
        if (isNaN(latency) || latency < 0) latency = 5;

        const reply = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

        await sock.sendPresenceUpdate('paused', jid).catch(() => {});

        // Direct Clean Message to Chat (No Quoted Wrapper so everyone sees it instantly)
        if (reply) {
            await sock.sendMessage(jid, { 
                text: reply 
            });
            console.log(`📤 [SENT TO EVERYONE]: "${reply}"`);
        }

    } catch (err) {
        console.error('Handler Error:', err);
    }
}

module.exports = { handleMessage };
