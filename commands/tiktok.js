const axios = require('axios');

// Default WhatsApp Channel Links
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D';
const CHANNEL_2 = 'https://whatsapp.com/channel/0029Vb9GVpd0wajsDAReUJ2k';

/**
 * .csong එකේ භාවිත කළ 100% Verified Channel Resolver Logic එක
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
        console.error('Newsletter meta error:', e);
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
  alias: ['tt', 'ctiktok', 'ctt', 'ctt1'],
  desc: 'Download TikTok video to chat or send to default channel',
  category: 'downloader',
  run: async ({ sock, msg, jid, args, command }) => {
    try {
      const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const cmdUsed = (command || messageText.trim().split(/\s+/)[0].slice(1)).toLowerCase();
      const isChannelCmd = cmdUsed === 'ctt' || cmdUsed === 'ctiktok' || cmdUsed === 'ctt1';
      const isChannel2 = cmdUsed === 'ctt1';

      // Reply message check
      const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

      const fullText = args.join(' ').trim();
      let destinationJid = jid;
      let tiktokUrl = '';

      if (isChannelCmd) {
        // Channel Command
        if (fullText.includes(',')) {
          const parts = fullText.split(',');
          destinationJid = await resolveChannelJid(sock, parts[0].trim());
          tiktokUrl = parts.slice(1).join(',').trim();
        } else {
          // .ctt1 නම් CHANNEL_2, නැතහොත් DEFAULT_CHANNEL
          const targetChannel = isChannel2 ? CHANNEL_2 : DEFAULT_CHANNEL;
          destinationJid = await resolveChannelJid(sock, targetChannel);
          tiktokUrl = fullText || quotedText;
        }
      } else {
        // Normal Chat Command
        tiktokUrl = fullText || quotedText;
      }

      // Extract TikTok URL cleanly
      const urlMatch = tiktokUrl.match(/https?:\/\/(?:vt\.|vm\.|www\.)?tiktok\.com\/[^\s]+/i);
      if (!urlMatch) {
        return await sock.sendMessage(jid, { 
          text: isChannelCmd
            ? `⚠️ *No TikTok link found!*\n\n*Usage:* \`.${cmdUsed} <TikTok Link>\`\n*Or* reply to a link with \`.${cmdUsed}\``
            : `⚠️ *No TikTok link found!*\n\n*Usage:* \`.tt <TikTok Link>\`\n*Or* reply to a link with \`.tt\``
        }, { quoted: msg });
      }

      const validTiktokUrl = urlMatch[0];

      await sock.sendMessage(jid, { 
        text: isChannelCmd 
          ? '⏳ *HESHAN OFC:* Processing TikTok video for channel...' 
          : '⏳ *HESHAN OFC:* Downloading TikTok video...' 
      }, { quoted: msg });

      // Chamindu API
      const apiKey = 'chama_api_ec9848130d1aea209f08fb85e0b4720f';
      const apiUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(validTiktokUrl)}&api_key=${apiKey}`;

      const { data: response } = await axios.get(apiUrl, { timeout: 45000 });

      if (!response?.status || !response?.data) {
        return await sock.sendMessage(jid, { text: '❌ Failed to fetch video. Please check the URL.' }, { quoted: msg });
      }

      const videoData = response.data;
      const videoDownloadUrl = videoData.downloads?.no_watermark_hd || videoData.downloads?.no_watermark || videoData.downloads?.no_watermark_sd;

      if (!videoDownloadUrl) {
        return await sock.sendMessage(jid, { text: '❌ No watermark-free video link was found.' }, { quoted: msg });
      }

      const rawTitle = videoData.title || '';
      const cleanTitle = rawTitle.replace(/#\S+/g, '').replace(/@\S+/g, '').replace(/\s+/g, ' ').trim();

      const author = videoData.author?.nickname || videoData.author?.unique_id || 'TikTok User';
      const duration = videoData.duration ? `${videoData.duration}s` : 'N/A';
      const views = formatNumber(videoData.stats?.views);
      const likes = formatNumber(videoData.stats?.likes);

      // Normal Chat Caption
      const normalChatCaption = 
`> *🎬⃝✨ H E S H A N   O F C   T I K T O K*

*❖ ᴛɪᴛʟᴇ :* ${cleanTitle || rawTitle || 'TikTok Video'}
*❖ ᴄʀᴇᴀᴛᴏʀ :* @${author}
*❖ ᴅᴜʀᴀᴛɪᴏɴ :* ${duration}
*❖ ᴠɪᴇᴡs :* ${views} • *ʟɪᴋᴇs :* ${likes}

\`\`\`➥ Enjoy the video without watermark! 🍿✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Channel Caption (.ctt / .ctt1)
      let channelCaption = '';
      if (isChannel2) {
        // .ctt1: යටින් කිසිම නමක් නැතිව title එක පමණි
        channelCaption = cleanTitle || rawTitle || '';
      } else {
        // .ctt: පැරණි විදිහටම නම සහිතව
        channelCaption = cleanTitle 
          ? `${cleanTitle}\n\n> *𝄞𝄢𝐑𝐚𝐩 විතරමයි || 🎧🇱🇰*`
          : `> *𝄞𝄢𝐑𝐚𝐩 විතරමයි || 🎧🇱🇰*`;
      }

      // Direct Stream Buffer Download
      const videoStream = await axios({
        url: videoDownloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const videoBuffer = Buffer.from(videoStream.data);

      if (isChannelCmd) {
        // Send to Channel
        await sock.sendMessage(destinationJid, {
          video: videoBuffer,
          caption: channelCaption,
          mimetype: 'video/mp4'
        });

        await sock.sendMessage(jid, { 
          text: `✅ *Success!* TikTok video uploaded to the channel.` 
        }, { quoted: msg });

      } else {
        // Send to Normal Chat
        await sock.sendMessage(jid, {
          video: videoBuffer,
          caption: normalChatCaption,
          mimetype: 'video/mp4'
        }, { quoted: msg });
      }

    } catch (error) {
      console.error('TikTok Command Error:', error);
      await sock.sendMessage(jid, { text: `❌ An error occurred: ${error.message}` }, { quoted: msg });
    }
  }
};
