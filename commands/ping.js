module.exports = {
    name: 'ping',
    description: 'Check latency',
    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const start = Date.now();

        await sock.sendMessage(jid, {
            react: { text: '🔥', key: msg.key }
        });

        const latency = Date.now() - start;

        await sock.sendMessage(jid, {
            text: `\`\`\`Pong ${latency}ms 🚀\`\`\``
        }, { quoted: msg });
    }
};
