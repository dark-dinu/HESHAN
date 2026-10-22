module.exports = {
  name: 'ping',
  alias: ['p', 'speed'],
  desc: 'Instant real network speed check with reaction',
  category: 'general',
  run: async ({ sock, msg, jid }) => {
    try {
      // 1. WhatsApp Server එකත් එක්ක WebSocket Round-Trip Time (RTT) එක මැනීම
      const start = Date.now();
      
      // WhatsApp Socket එකෙන් server echo / presence query එකක් run කර latency එක ගැනීම
      if (typeof sock.ws?.ping === 'function') {
        await new Promise((resolve) => sock.ws.ping(resolve));
      } else {
        await sock.sendPresenceUpdate('composing', jid);
      }
      
      const realLatency = Math.max(12, Date.now() - start);

      // 2. Latency එක සහිත Message එක යැවීම
      const sentMsg = await sock.sendMessage(jid, { 
        text: `*𝐏𝐨𝐧𝐠 ${realLatency} 𝐦𝐬 📍*` 
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
