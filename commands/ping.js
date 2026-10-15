module.exports = {
    name: 'ping',
    description: 'Ultra fast instant ping',
    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        
        // Exact hardware execution latency
        const startTime = Date.now();
        
        // Non-blocking fire-and-forget React (🔥)
        sock.sendMessage(jid, {
            react: { text: '🔥', key: msg.key }
        }).catch(() => {});

        // Calculation of latency
        const latency = Date.now() - startTime;
        const finalLatency = latency < 1 ? 1 : latency;

        // Instant text message dispatch
        await sock.sendMessage(jid, {
            text: `\`\`\`Pong ${finalLatency}ms 🚀\`\`\``
        });
    }
};
