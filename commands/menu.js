const fs = require('fs');
const path = require('path');
const process = require('process');

function getBotLogo() {
  const possiblePaths = [
    path.join(__dirname, '../img.png'),
    path.join(__dirname, '../../img.png'),
    path.join(process.cwd(), 'img.png')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return null;
}

module.exports = {
  name: 'menu',
  alias: ['help', 'list', 'commands'],
  desc: 'Display clean interactive categorized menu',
  category: 'general',

  // 1 - 5 Menu Category Reply Handling
  onReply: async ({ sock, msg, jid, text, quotedText, prefix = '.' }) => {
    const isMenuCard = quotedText.includes('HESHAN OFC') && (quotedText.includes('MAIN DASHBOARD') || quotedText.includes('SELECT MENU'));
    const isValidChoice = ['1', '2', '3', '4', '5'].includes(text.trim());

    if (!isMenuCard || !isValidChoice) return false;

    const choice = text.trim();
    await sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } });

    const logoBuffer = getBotLogo();
    const imagePayload = logoBuffer ? logoBuffer : { url: 'https://i.imgur.com/8Q8ZQ8Z.png' };

    let categoryTitle = '';
    let cmdList = '';

    if (choice === '1') {
      categoryTitle = 'DOWNLOADERS';
      cmdList = 
`┌───〔 ${categoryTitle} 〕
│
├▸ *${prefix}song* <query>
│  └ Multi-format Song DL
│
├▸ *${prefix}video* <query>
│  └ MP4 Video with Qualities
│
├▸ *${prefix}ytv* <link>
│  └ Direct YouTube Stream
│
├▸ *${prefix}tiktok* <link>
│  └ TikTok No Watermark
│
├▸ *${prefix}pinterest* <link>
│  └ Pin Videos & Photos
│
└────────────···▸`;
    } 
    else if (choice === '2') {
      categoryTitle = 'CHANNELS';
      cmdList = 
`┌───〔 ${categoryTitle} 〕
│
├▸ *${prefix}csong* <link>
│  └ Post Song to Channel
│
├▸ *${prefix}cytv* <link>
│  └ Post Video to Channel
│
├▸ *${prefix}cpvd* <link>
│  └ Post Pinterest Media
│
└────────────···▸`;
    } 
    else if (choice === '3') {
      categoryTitle = 'PROFILE TOOLS';
      cmdList = 
`┌───〔 ${categoryTitle} 〕
│
├▸ *${prefix}getdp*
│  └ Fetch HD Profile DP
│
├▸ *${prefix}getdp* <num/@>
│  └ Fetch Target User DP
│
├▸ *${prefix}setdp* (reply img)
│  └ Update Bot Profile DP
│
└────────────···▸`;
    } 
    else if (choice === '4') {
      categoryTitle = 'SYSTEM STATS';
      cmdList = 
`┌───〔 ${categoryTitle} 〕
│
├▸ *${prefix}alive*
│  └ System Status & Uptime
│
├▸ *${prefix}menu*
│  └ Open Main Dashboard
│
└────────────···▸`;
    } 
    else if (choice === '5') {
      categoryTitle = 'ALL COMMANDS';
      cmdList = 
`┌───〔 ${categoryTitle} 〕
│
├▸ *Media:* song, video, ytv
├▸ *Social:* tiktok, pinterest
├▸ *Channel:* csong, cytv, cpvd
├▸ *Profile:* getdp, setdp
├▸ *Core:* alive, menu
│
└────────────···▸`;
    }

    const subMenuCaption = 
`> *⚡ HESHAN OFC MD*

${cmdList}

\`\`\`Mode: Multi-Device | Prefix: [ ${prefix} ]\`\`\`

> *Media Automation Engine*`;

    await sock.sendMessage(jid, {
      image: imagePayload,
      caption: subMenuCaption
    }, { quoted: msg });

    return true;
  },

  // Normal Command Execution
  run: async ({ sock, msg, jid, prefix = '.', commands }) => {
    try {
      await sock.sendMessage(jid, { react: { text: '📜', key: msg.key } });

      const logoBuffer = getBotLogo();
      const imagePayload = logoBuffer ? logoBuffer : { url: 'https://i.imgur.com/8Q8ZQ8Z.png' };
      const totalCmds = commands ? commands.size : '12';

      const mainDashboardCaption = 
`> *⚡ HESHAN OFC MD*

┌───〔 MAIN DASHBOARD 〕
│
├ ✦ *Owner:* Dinidu Heshan
├ ✦ *Prefix:* [ ${prefix} ]
├ ✦ *Status:* Online 🟢
├ ✦ *Commands:* ${totalCmds} Active
│
└───〔 SELECT MENU 〕
│
├ [1] 📥 Downloaders
├ [2] 📢 Channel Tools
├ [3] 👤 Profile Tools
├ [4] ⚙️ System Stats
├ [5] 📋 Full Command List
│
└────────────···▸

\`\`\`Reply with a number (1 - 5)\`\`\`

> *ʜᴇꜱʜᴀɴ ᴏꜰᴄ ʙᴏᴛ*`;

      await sock.sendMessage(jid, {
        image: imagePayload,
        caption: mainDashboardCaption
      }, { quoted: msg });

    } catch (error) {
      console.error('Menu Error:', error);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    }
  }
};
