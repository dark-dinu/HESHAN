module.exports = {
  name: 'ping',
  alias: ['p', 'speed'],
  desc: 'Instant speed check',
  category: 'general',
  run: async ({ sock, msg, jid }) => {
    try {
      // 1. Real Latency එක ගණනය කිරීම
      const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
      const latency = Math.max(1, Date.now() - msgTime);

      // 2. React එක (⚡) සහ Message එක එකවර ක්‍රියාත්මක කිරීම
      await Promise.all([
        sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } }),
        sock.sendMessage(jid, { 
          text: `𝐇𝐄𝐒𝐇𝐀𝐍 𝐎𝐅𝐂 🔥\n      > \`\`\`Pong ${latency}ms 🚀\`\`\`` 
        }, { quoted: msg })
      ]);

    } catch (error) {
      console.error('Ping error:', error);
    }
  },
};
