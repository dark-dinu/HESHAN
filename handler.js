const { processDinuRequest } = require('./dinu_agent');

async function handleMessage(sock, msgUpdate) {
    try {
        const msg = msgUpdate.messages?.[0];
        if (!msg || !msg.message) return;

        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') return;

        // OWNER CHECK: Only respond to messages sent by you
        const myJid = (sock.user?.id ? sock.user.id.split(':')[0] : '') + '@s.whatsapp.net';
        const isFromMe = msg.key.fromMe;
        const isSelfChat = jid === myJid;

        if (!isFromMe && !isSelfChat) return;

        let m = msg.message;
        if (m.ephemeralMessage) m = m.ephemeralMessage.message;
        if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;

        const body = m.conversation || 
                     m.extendedTextMessage?.text || 
                     m.imageMessage?.caption || 
                     m.videoMessage?.caption || '';

        const text = body.trim();
        if (!text) return;

        // Must address "Dinu"
        if (!text.toLowerCase().includes('dinu')) return;

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

        sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } }).catch(() => {});

        const responseText = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

        if (responseText) {
            await sock.sendMessage(jid, { text: responseText });
        }
    } catch (err) {}
}

module.exports = { handleMessage };
