module.exports = {
  name: 'ping',
  alias: ['p', 'speed'],
  desc: 'Instant real speed check with reaction',
  category: 'general',
  run: async ({ sock, msg, jid }) => {
    try {
      const startTime = Date.now();

      // 1. Message එක ක්ෂණිකව යවා round-trip latency එක ගණනය කිරීම
      const sentMsg = await sock.sendMessage(jid, { 
        text: `*𝐏𝐨𝐧𝐠 ${Date.now() - startTime} 𝐦𝐬 📍*` 
      }, { quoted: msg });

      // 2. ආපු සැනින් එම message එකටම ✔️ React එක වැටීම
      if (sentMsg?.key) {
        await sock.sendMessage(jid, { 
          react: { text: '✔️', key: sentMsg.key } 
        });
      }

    } catch (error) {
      console.error('Ping error:', error);
    }
  },
};
