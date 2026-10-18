const axios = require('axios');

// 🔴 ඔයාගේ Channel Link එක Default විදිහට Set කර ඇත:
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D'; 

/**
 * WhatsApp Channel JID එක resolve කිරීම (@newsletter format එකට)
 */
async function resolveChannelJid(sock, channelInput) {
  let input = channelInput.trim();
  if (input.endsWith('@newsletter')) return input;

  const match = input.match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([a-zA-Z0-9]+)/i);
  if (match && match[1]) {
    const inviteCode = match[1];
    if (typeof sock.newsletterMetadata === 'function') {
      try {
        const meta = await sock.newsletterMetadata('invite', inviteCode);
        if (meta?.id) return meta.id;
      } catch (e) {
        console.error('Newsletter metadata error:', e);
      }
    }
    return `${inviteCode}@newsletter`;
  }
  return input;
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

module.exports = {
  name: 'tiktok',
  alias: ['tt', 'ctiktok', 'ctt'],
  desc: 'Download TikTok video to chat or auto-send to default channel',
  category: 'downloader',
  run: async ({ sock, msg, jid, args, command }) => {
    try {
      const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const cmdUsed = (command || messageText.trim().split(/\s+/)[0].slice(1)).toLowerCase();
      const isChannelCmd = cmdUsed === 'ctt' || cmdUsed === 'ctiktok';

      // Reply කරපු message එකක text එකක් තිබේදැයි බැලීම
      const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

      const fullText = args.join(' ').trim();
      let targetJid = jid;
      let tiktokUrl = '';

      if (isChannelCmd) {
        // Channel Command (.ctt)
        if (fullText.includes(',')) {
          // වෙනත් Channel එකකට දාන්න අවශ්‍ය නම්: .ctt other_channel_link, tiktok_link
          const parts = fullText.split(',');
          targetJid = await resolveChannelJid(sock, parts[0].trim());
          tiktokUrl = parts.slice(1).join(',').trim();
        } else {
          // Default Channel: .ctt tiktok_link හෝ link එකකට reply කර .ctt ගැසීම
          targetJid = await resolveChannelJid(sock, DEFAULT_CHANNEL);
          tiktokUrl = fullText || quotedText;
        }
      } else {
        // Normal Chat Command (.tt): .tt tiktok_link හෝ link එකකට reply කර .tt ගැසීම
        tiktokUrl = fullText || quotedText;
      }

      // TikTok URL එක extract කරගැනීම
      const urlMatch = tiktokUrl.match(/https?:\/\/(?:vt\.|vm\.|www\.)?tiktok\.com\/[^\s]+/i);
      if (!urlMatch) {
        return await sock.sendMessage(jid, { 
          text: isChannelCmd
            ? `⚠️ *TikTok link එකක් හමු නොවීය!*\n\n*පහසු ක්‍රමය:* \`.ctt <TikTok Link>\`\n*නැතහොත්* TikTok link එකකට reply කර \`.ctt\` ගසන්න.`
            : `⚠️ *TikTok link එකක් හමු නොවීය!*\n\n*භාවිතය:* \`.tt <TikTok Link>\`\n*නැතහොත්* TikTok link එකකට reply කර \`.tt\` ගසන්න.`
        }, { quoted: msg });
      }

      const validTiktokUrl = urlMatch[0];

      await sock.sendMessage(jid, { 
        text: isChannelCmd 
          ? '⏳ *HESHAN OFC:* වීඩියෝව Channel එකට සකසමින් පවතී...' 
          : '⏳ *HESHAN OFC:* වීඩියෝව බාගත වෙමින් පවතී...' 
      }, { quoted: msg });

      // Chamindu API Call
      const apiKey = 'chama_api_ec9848130d1aea209f08fb85e0b4720f';
      const apiUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(validTiktokUrl)}&api_key=${apiKey}`;

      const { data: response } = await axios.get(apiUrl, { timeout: 45000 });

      if (!response?.status || !response?.data) {
        return await sock.sendMessage(jid, { text: '❌ වීඩියෝව ලබා ගැනීමට නොහැකි විය. Link එක නිවැරදිදැයි බලන්න.' }, { quoted: msg });
      }

      const videoData = response.data;
      const videoDownloadUrl = videoData.downloads?.no_watermark_hd || videoData.downloads?.no_watermark || videoData.downloads?.no_watermark_sd;

      if (!videoDownloadUrl) {
        return await sock.sendMessage(jid, { text: '❌ Watermark රහිත වීඩියෝ link එකක් හමු නොවීය.' }, { quoted: msg });
      }

      const title = videoData.title || 'TikTok Video';
      const author = videoData.author?.nickname || videoData.author?.unique_id || 'TikTok User';
      const duration = videoData.duration ? `${videoData.duration}s` : 'N/A';
      const views = formatNumber(videoData.stats?.views);
      const likes = formatNumber(videoData.stats?.likes);

      // Caption Design
      const videoCaption = 
`> *🎬⃝✨ H E S H A N   O F C   T I K T O K*

*❖ ᴛɪᴛʟᴇ :* ${title}
*❖ ᴄʀᴇᴀᴛᴏʀ :* @${author}
*❖ ᴅᴜʀᴀᴛɪᴏɴ :* ${duration}
*❖ ᴠɪᴇᴡs :* ${views} • *ʟɪᴋᴇs :* ${likes}

\`\`\`➥ Enjoy the video without watermark! 🍿✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Video Download Buffer
      const videoStream = await axios({
        url: videoDownloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const videoBuffer = Buffer.from(videoStream.data);

      if (isChannelCmd) {
        // Channel එකට යැවීම
        await sock.sendMessage(targetJid, {
          video: videoBuffer,
          caption: videoCaption,
          mimetype: 'video/mp4'
        });

        await sock.sendMessage(jid, { 
          text: `✅ *සාර්ථකයි!* TikTok වීඩියෝව Channel එකට යවන ලදී.` 
        }, { quoted: msg });

      } else {
        // Normal Chat එකට යැවීම
        await sock.sendMessage(jid, {
          video: videoBuffer,
          caption: videoCaption,
          mimetype: 'video/mp4'
        }, { quoted: msg });
      }

    } catch (error) {
      console.error('TikTok Command Error:', error);
      await sock.sendMessage(jid, { text: `❌ දෝෂයක් සිදු විය: ${error.message}` }, { quoted: msg });
    }
  }
};
