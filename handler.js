const { processDinuRequest } = require('./dinu_agent');

async function handleMessage(sock, msgUpdate) {
    try {
        const msg = msgUpdate.messages?.[0];
        if (!msg || !msg.message) return;

        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') return;

        let m = msg.message;
        if (m.ephemeralMessage) m = m.ephemeralMessage.message;
        if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;

        const body = m.conversation || 
                     m.extendedTextMessage?.text || 
                     m.imageMessage?.caption || 
                     m.videoMessage?.caption || '';

        const text = body.trim();
        if (!text) return;

        // "dinu", "දිනූ", "දිනු" trigger check
        const regexDinu = /dinu|දිනූ|දිනු/i;
        if (!regexDinu.test(text)) return;

        // Strict Owner Check:
        const myJidNum = sock.user?.id ? sock.user.id.split(':')[0].replace(/[^0-9]/g, '') : '';
        const senderNum = (msg.key.participant || jid).split(':')[0].replace(/[^0-9]/g, '');
        const isFromMe = Boolean(msg.key.fromMe) || (myJidNum && senderNum === myJidNum);

        if (!isFromMe) return;

        console.log(`[DINU DETECTED]: "${text}" from ${senderNum}`);

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

        // Process with Dinu Brain
        const responseText = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

        if (responseText) {
            await sock.sendMessage(jid, { text: responseText });
            console.log(`[DINU REPLIED]: "${responseText.slice(0, 30)}..."`);
        }

    } catch (err) {
        console.error('Handler execution error:', err);
    }
}

module.exports = { handleMessage };
