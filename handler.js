const { askHeshan } = require('./ai');

async function handleMessage(sock, msgUpdate) {
    try {
        const msg = msgUpdate.messages?.[0];
        if (!msg || !msg.message) return;

        const jid = msg.key.remoteJid;
        if (jid === 'status@broadcast') return;

        const m = msg.message;
        const text = m.conversation || 
                     m.extendedTextMessage?.text || 
                     m.imageMessage?.caption || 
                     m.videoMessage?.caption || 
                     (m.ephemeralMessage?.message?.conversation || m.ephemeralMessage?.message?.extendedTextMessage?.text) || '';

        if (!text || text.trim() === '') return;

        const isGroup = jid.endsWith('@g.us');
        const lowerText = text.toLowerCase().trim();
        const prefix = global.BOT_PREFIX || '.';

        // Calculate live latency
        const now = Date.now();
        const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : now;
        let latency = now - msgTime;
        if (isNaN(latency) || latency < 0) latency = 5;
        if (latency === 0) latency = 1;

        // 1. Classical .ping command fallback
        if (lowerText === `${prefix}ping` || lowerText === 'ping') {
            await sock.sendMessage(jid, { react: { text: '🔥', key: msg.key } }).catch(() => {});
            return await sock.sendMessage(jid, { text: `\`\`\`Pong ${latency}ms 🚀\`\`\`` });
        }

        // 2. Determine if AI should reply (Strict spam protection)
        let shouldReply = false;

        if (!isGroup) {
            // In private chat: Reply to everything
            shouldReply = true;
        } else {
            // In groups: Only reply if mentioned by name "Heshan" OR bot's message is quoted
            const myJid = sock.user?.id ? sock.user.id.split(':')[0] : '';
            const isQuotedMe = m.extendedTextMessage?.contextInfo?.participant?.includes(myJid);
            const mentionsHeshan = lowerText.includes('heshan');

            if (isQuotedMe || mentionsHeshan) {
                shouldReply = true;
            }
        }

        if (!shouldReply) return;

        // Visual Reaction to acknowledge receipt
        sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } }).catch(() => {});

        // Direct AI Inference via OpenRouter
        const aiResponse = await askHeshan(text, { latency });

        // Send AI Response
        await sock.sendMessage(jid, {
            text: aiResponse
        });

    } catch (err) {}
}

module.exports = { handleMessage };
