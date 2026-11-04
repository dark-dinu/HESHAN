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
  desc: 'Display interactive categorized menu',
  category: 'general',
  run: async ({ sock, msg, jid, text, args, prefix = '.', commands }) => {
    try {
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedCaption = quotedMsg?.imageMessage?.caption || 
                            quotedMsg?.conversation || 
                            quotedMsg?.extendedTextMessage?.text || '';

      const isReply = ['1', '2', '3', '4', '5'].includes(text?.trim());
      const isMenuCard = quotedCaption.includes('H E S H A N   O F C   M E N U') || quotedCaption.includes('SELECT CATEGORY');

      const logoBuffer = getBotLogo();
      const imagePayload = logoBuffer ? logoBuffer : { url: 'https://i.imgur.com/8Q8ZQ8Z.png' };

      // ==========================================
      // 1. අංක 1 - 5 REPLY කළ විට අදාළ CATEGORY එක පෙන්වීම
      // ==========================================
      if (isReply && isMenuCard) {
        const choice = text.trim();
        await sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } });

        let categoryTitle = '';
        let categoryCommands = '';

        if (choice === '1') {
          categoryTitle = 'DOWNLOADER COMMANDS 📥';
          categoryCommands = 
`┃  *• ${prefix}song* <name> ➯ Download MP3 / Doc / Voice
┃  *• ${prefix}csong* <name> ➯ Download Song to Channel
┃  *• ${prefix}video* <name> ➯ Download Video with Quality
┃  *• ${prefix}ytv* <url> ➯ Direct YouTube MP4
┃  *• ${prefix}cytv* <url> ➯ YouTube Video to Channel
┃  *• ${prefix}tiktok* <url> ➯ Download TikTok No WM
┃  *• ${prefix}pinterest* <url> ➯ Download Pin Video/Image
┃  *• ${prefix}cpvd* <url> ➯ Pin Media to Channel`;
        } 
        else if (choice === '2') {
          categoryTitle = 'CHANNEL AUTOMATION 📢';
          categoryCommands = 
`┃  *• ${prefix}csong* ➯ Post song cards to Channel
┃  *• ${prefix}cytv* ➯ Stream YouTube videos to Channel
┃  *• ${prefix}cpvd* ➯ Post Pinterest media to Channel
┃  *• ${prefix}cpost* ➯ Send styled announcement`;
        } 
        else if (choice === '3') {
          categoryTitle = 'PROFILE & TOOLS 👤';
          categoryCommands = 
`┃  *• ${prefix}getdp* ➯ Get your own HD Profile Picture
┃  *• ${prefix}getdp* <num/@> ➯ Get target user's DP
┃  *• ${prefix}setdp* ➯ Reply to image to set bot DP`;
        } 
        else if (choice === '4') {
          categoryTitle = 'SYSTEM & GENERAL ⚙️';
          categoryCommands = 
`┃  *• ${prefix}alive* ➯ Bot status, uptime & memory
┃  *• ${prefix}menu* ➯ Open command dashboard
┃  *• ${prefix}ping* ➯ Check bot response speed`;
        } 
        else if (choice === '5') {
          categoryTitle = 'ALL COMMANDS OVERVIEW 📋';
          categoryCommands = 
`┃  *• ${prefix}song*      *• ${prefix}video*
┃  *• ${prefix}csong*     *• ${prefix}ytv*
┃  *• ${prefix}tiktok*    *• ${prefix}pinterest*
┃  *• ${prefix}getdp*     *• ${prefix}setdp*
┃  *• ${prefix}alive*     *• ${prefix}menu*`;
        }

        const catCaption = 
`> *📂⃝✨ H E S H A N   O F C   C A T E G O R Y*

*╭━━━〔 ${categoryTitle} 〕━━━╮*
┃
${categoryCommands}
┃
*╰━━━━━━━━━━━━━━━━━━━━━━╯*

\`\`\`➥ Prefix: [ ${prefix} ] | HESHAN OFC MD\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

        return await sock.sendMessage(jid, {
          image: imagePayload,
          caption: catCaption
        }, { quoted: msg });
      }

      // ==========================================
      // 2. .MENU ගැසූ විට MAIN CATEGORY CARD එක යැවීම
      // ==========================================
      await sock.sendMessage(jid, { react: { text: '📜', key: msg.key } });

      const totalCmds = commands ? commands.size : '12+';

      const mainCaption = 
`> *📜⃝✨ H E S H A N   O F C   M E N U*

*╭━━━〔 BOT OVERVIEW 〕━━━╮*
┃
┃  *❖ ʙᴏᴛ :* HESHAN OFC MD
┃  *❖ ᴘʀᴇғɪx :* [ ${prefix} ]
┃  *❖ sᴛᴀᴛᴜs :* Online 🟢
┃  *❖ ᴄᴏᴍᴍᴀɴᴅs :* ${totalCmds} Active
┃
*╰━━━━━━━━━━━━━━━━━━━━━━╯*

*╭━━━〔 SELECT CATEGORY 〕━━━╮*
┃
┃  *1* ➯ *Downloaders* 📥
┃  *2* ➯ *Channel Tools* 📢
┃  *3* ➯ *Profile & Media* 👤
┃  *4* ➯ *System & Status* ⚙️
┃  *5* ➯ *All Commands List* 📋
┃
*╰━━━━━━━━━━━━━━━━━━━━━━╯*

\`\`\`➥ Reply to this message with 1, 2, 3, 4, or 5 to view commands!\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴜʟᴛɪ-ᴅᴇᴠɪᴄᴇ ʙᴏᴛ*`;

      await sock.sendMessage(jid, {
        image: imagePayload,
        caption: mainCaption
      }, { quoted: msg });

    } catch (error) {
      console.error('Menu Error:', error);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    }
  }
};
