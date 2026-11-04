const fs = require('fs');
const path = require('path');
const os = require('os');
const process = require('process');

// Uptime Formatter
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

// Memory Formatter (MB)
function formatMemory(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

module.exports = {
  name: 'alive',
  alias: ['bot', 'system', 'status'],
  desc: 'Display HESHAN OFC Bot System Status',
  category: 'general',
  run: async ({ sock, msg, jid, prefix, commands }) => {
    try {
      // 1. React with online pulse
      await sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } });

      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const uptimeStr = formatUptime(process.uptime());
      const totalCmds = commands ? commands.size : '30+';

      // 2. High-End Alive Caption
      const aliveCaption = 
`> *⚡⃝✨ H E S H A N   O F C   M D   A L I V E*

*╭━━━〔 SYSTEM STATUS 〕━━━╮*
┃
┃  *❖ ʙᴏᴛ :* HESHAN OFC MD
┃  *❖ ᴠᴇʀsɪᴏɴ :* 2.5.0 (Multi-Device)
┃  *❖ sᴛᴀᴛᴜs :* Online & Operational 🟢
┃  *❖ ᴜᴘᴛɪᴍᴇ :* ${uptimeStr}
┃  *❖ ʀᴀᴍ :* ${formatMemory(usedMemory)} / ${formatMemory(totalMemory)}
┃  *❖ ᴘʟᴀᴛғᴏʀᴍ :* ${os.platform()} (${os.arch()})
┃  *❖ ᴘʀᴇғɪx :* [ ${prefix || '.'} ]
┃  *❖ ᴄᴏᴍᴍᴀɴᴅs :* ${totalCmds} Active
┃
*╰━━━━━━━━━━━━━━━━━━━━━━╯*

*╭━━━〔 OFFICIAL CHANNELS 〕━━━╮*
┃
┃  *✦ ᴍᴇᴅɪᴀ ʜᴜʙ :* Active
┃  *✦ ɴᴇᴛᴡᴏʀᴋ :* Ultra High Speed CDN
┃
*╰━━━━━━━━━━━━━━━━━━━━━━╯*

\`\`\`➥ Powered by Baileys Multi-Device Engine ✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴜʟᴛɪ-ᴅᴇᴠɪᴄᴇ ʙᴏᴛ*`;

      // 3. Logo path resolution (img.png file එක check කිරීම)
      const possiblePaths = [
        path.join(__dirname, '../img.png'),
        path.join(__dirname, '../../img.png'),
        path.join(process.cwd(), 'img.png')
      ];

      let imageBuffer = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          imageBuffer = fs.readFileSync(p);
          break;
        }
      }

      // img.png තිබුණොත් ඒකෙන් යැවීම, නැතහොත් default web backup එකකින් යැවීම
      if (imageBuffer) {
        await sock.sendMessage(jid, {
          image: imageBuffer,
          caption: aliveCaption
        }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, {
          image: { url: 'https://i.imgur.com/8Q8ZQ8Z.png' },
          caption: aliveCaption
        }, { quoted: msg });
      }

      // 4. Success Reaction
      await sock.sendMessage(jid, { react: { text: '🕊️', key: msg.key } });

    } catch (error) {
      console.error('Alive Command Error:', error);
      await sock.sendMessage(jid, { 
        text: `❌ *An error occurred:* ${error.message}` 
      }, { quoted: msg });
    }
  }
};
