module.exports = {
  name: 'ping',
  alias: ['p', 'speed'],
  desc: 'Instant real network speed check with reaction',
  category: 'general',
  run: async ({ sock, msg, jid }) => {
    try {
      // 1. WhatsApp Server එකෙන් user info query කර නියම network round-trip latency එක මැනීම
      const start = Date.now();
      await sock.onWhatsApp(sock.user?.id || jid);
      const latency = Date.now() - start;

      // 2. Latency එක සහිත Message එක යැවීම
      const sentMsg = await sock.sendMessage(jid, { 
        text: `*𝐏𝐨𝐧𝐠 ${latency} 𝐦𝐬 📍*` 
      }, { quoted: msg });

      // 3. එම Message එකටම ක්ෂණිකව ✔️ Reaction එක වැටීම
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
