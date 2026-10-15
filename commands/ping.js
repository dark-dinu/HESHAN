module.exports = {
    name: 'ping',
    description: 'Instant ultra-fast ping',
    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        
        // WhatsApp message timestamp එකෙන් live latency එක ගණනය කිරීම
        const now = Date.now();
        const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : now;
        const latency = Math.max(0, now - msgTime);

        // React එක සහ Message එක එකම මොහොතේ parallel යැවීම (Zero delay)
        await Promise.all([
            sock.sendMessage(jid, {
                react: { text: '🔥', key: msg.key }
            }),
            sock.sendMessage(jid, {
                text: `\`\`\`Pong ${latency}ms 🚀\`\`\``
            }, { quoted: msg })
        ]);
    }
};
