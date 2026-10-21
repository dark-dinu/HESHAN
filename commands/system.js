const os = require('os');

// Runtime එක Days, Hours, Mins බවට හැරවීම
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const dDisplay = d > 0 ? `${d}d ` : '';
  const hDisplay = h > 0 ? `${h}h ` : '';
  const mDisplay = m > 0 ? `${m}m ` : '';
  const sDisplay = `${s}s`;
  return `${dDisplay}${hDisplay}${mDisplay}${sDisplay}`;
}

// Memory (RAM) format කිරීම
function formatBytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

module.exports = {
  name: 'system',
  alias: ['status', 'runtime', 'botstatus'],
  desc: 'View bot system status, runtime, and ping',
  category: 'main',
  run: async ({ sock, msg, jid }) => {
    try {
      const start = Date.now();

      // Bot Runtime & Server Memory calculation
      const botUptime = formatUptime(process.uptime());
      const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2); // GB
      const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2); // GB
      const ramUsed = formatBytes(process.memoryUsage().rss);

      const lat = Date.now() - start;

      const systemCard = 
`> *⚙️⃝✨ H E S H A N   O F C   S Y S T E M*

*❖ ꜱᴘᴇᴇᴅ :* ${lat}ms
*❖ ᴜᴘᴛɪᴍᴇ :* ${botUptime}
*❖ ʀᴀᴍ ᴜꜱᴀɢᴇ :* ${ramUsed} / ${totalMem}GB
*❖ ᴘʟᴀᴛꜰᴏʀᴍ :* ${os.platform()} (${os.arch()})
*❖ ɴᴏᴅᴇ :* ${process.version}

\`\`\`⚡ Heshan OFC Bot is running smoothly! 🚀\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴄᴏʀᴇ*`;

      await sock.sendMessage(jid, { 
        text: systemCard 
      }, { quoted: msg });

    } catch (error) {
      console.error('System Command Error:', error);
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: msg });
    }
  }
};
