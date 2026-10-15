module.exports = {
    name: 'ping',
    description: 'Instant ultra-fast ping',
    execute: async (sock, msg, args) => {
        try {
            const jid = msg.key.remoteJid;
            const start = Date.now();

            // 1. Send React 🔥
            sock.sendMessage(jid, {
                react: { 
                    text: '🔥', 
                    key: msg.key 
                }
            }).catch(() => {});

            // 2. Real Latency Calculation
            const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : start;
            let latency = Date.now() - msgTime;

            if (isNaN(latency) || latency < 0) {
                latency = Date.now() - start;
            }
            if (latency === 0) latency = 1;

            // 3. Send Text Message (Always quoted with fallback)
            await sock.sendMessage(jid, {
                text: `\`\`\`Pong ${latency}ms 🚀\`\`\``
            }, { 
                quoted: msg 
            });

        } catch (err) {
            console.error('Ping command error:', err);
        }
    }
};
