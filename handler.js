const { processDinuRequest } = require('./dinu_agent');

async function handleMessage(sock, msgUpdate) {
    try {
        if (!msgUpdate.messages || msgUpdate.messages.length === 0) return;

        for (const msg of msgUpdate.messages) {
            if (!msg.message) continue;

            const jid = msg.key.remoteJid;
            if (!jid || jid === 'status@broadcast') continue;

            let m = msg.message;
            if (m.ephemeralMessage) m = m.ephemeralMessage.message;
            if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;

            const text = (m.conversation || 
                          m.extendedTextMessage?.text || 
                          m.imageMessage?.caption || 
                          m.videoMessage?.caption || '').trim();

            if (!text) continue;

            // Trigger Check
            const hasDinu = /dinu|දිනූ|දිනු/i.test(text);
            if (!hasDinu) continue;

            // Owner Check
            const myJidNum = sock.user?.id ? sock.user.id.split(':')[0].replace(/[^0-9]/g, '') : '';
            const senderNum = (msg.key.participant || jid).split(':')[0].replace(/[^0-9]/g, '');
            const isOwner = Boolean(msg.key.fromMe) || (myJidNum && senderNum === myJidNum) || jid.includes(myJidNum);

            if (!isOwner) continue;

            console.log(`📩 Triggered: "${text}"`);

            await sock.sendPresenceUpdate('composing', jid).catch(() => {});

            const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
            let quotedMsg = null;
            if (quoted) {
                quotedMsg = quoted.ephemeralMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
            }

            const latency = 15;
            const reply = await processDinuRequest(sock, jid, msg, quotedMsg, text, latency);

            await sock.sendPresenceUpdate('paused', jid).catch(() => {});

            if (reply) {
                await sock.sendMessage(jid, { text: reply }, { quoted: msg });
                console.log(`📤 Replied: "${reply.slice(0, 30)}..."`);
            }
        }
    } catch (err) {
        console.error('Handler Error:', err);
    }
}

module.exports = { handleMessage };
