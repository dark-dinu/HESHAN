module.exports = {
  name: 'ping',
  alias: ['p', 'speed'],
  desc: 'Bot speed check',
  category: 'general',
  run: async ({ sock, msg, jid }) => {
    try {
      const start = Date.now();
      
      // WhatsApp message එක ලැබුණු වෙලාව සහ දැන් වෙලාව අතර වෙනස (Latency)
      const latency = Date.now() - start;

      const responseText = 
`⚡ *H E S H A N   O F C* ⚡
━━━━━━━━━━━━━━━━━━━━
🏓 *Pong:* \`${latency}ms\`
📊 *Status:* ${latency < 500 ? '🟢 Super Fast' : latency < 1500 ? '🟡 Normal' : '🔴 Lag'}
🕒 *Time:* \`${new Date().toLocaleTimeString()}\`
━━━━━━━━━━━━━━━━━━━━
> © HESHAN OFC • SPEED TEST`;

      // එකවර කෙළින්ම message එක යැවීම
      await sock.sendMessage(jid, { text: responseText }, { quoted: msg });

    } catch (error) {
      console.error('Ping command error:', error);
      await sock.sendMessage(jid, { text: '❌ Speed check කිරීමට නොහැකි විය.' }, { quoted: msg });
    }
  },
};
