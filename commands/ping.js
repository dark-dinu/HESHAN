module.exports = {
    name: 'ping',
    description: 'Instant ultra-fast ping',
    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const start = Date.now();

        // 1. Send React 🔥
        sock.sendMessage(jid, {
            react: { text: '🔥', key: msg.key }
        }).catch(() => {});

        // 2. Latency calculation
        const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : start;
        let latency = Date.now() - msgTime;
        if (isNaN(latency) || latency < 0) latency = Date.now() - start;
        if (latency === 0) latency = 1;

        // 3. Direct send (No quoted wrapper to prevent encryption loop)
        await sock.sendMessage(jid, {
            text: `\`\`\`Pong ${latency}ms 🚀\`\`\``
        });
    }
};
