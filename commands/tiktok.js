const axios = require('axios');

// Default WhatsApp Channel Links
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D';
const CHANNEL_2 = 'https://whatsapp.com/channel/0029Vb9GVpd0wajsDAReUJ2k';

/**
 * WhatsApp Channel JID Resolver (@newsletter format)
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

/**
 * කිසිම API Key එකක් නැති Direct TikTok Web Extractor (No Quota / No Limits)
 */
async function getTikTokDirect(url) {
  // Method 1: Direct Web Engine Scraping
  try {
    const res = await axios.post(
      'https://www.tikwm.com/api/',
      new URLSearchParams({ url: url, count: 12, cursor: 0, web: 1, hd: 1 }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 20000
      }
    );

    if (res?.data?.code === 0 && res?.data?.data) {
      const data = res.data.data;
      const dl = data.hdplay || data.play || data.wmplay;
      const finalDownloadUrl = dl.startsWith('http') ? dl : `https://www.tikwm.com${dl}`;

      return {
        downloadUrl: finalDownloadUrl,
        title: data.title || '',
        author: data.author?.nickname || data.author?.unique_id || 'TikTok User',
        duration: data.duration ? `${data.duration}s` : 'N/A',
        views: formatNumber(data.play_count),
        likes: formatNumber(data.digg_count)
      };
    }
  } catch (err) {
    console.warn('Engine 1 failed, trying Engine 2...');
  }

  // Method 2: Public CDN Direct Resolver
  try {
    const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, {
      timeout: 20000
    });
    if (res?.data?.video?.noWatermark) {
      return {
        downloadUrl: res.data.video.noWatermark,
        title: res.data.title || '',
        author: res.data.author?.name || 'TikTok User',
        duration: 'N/A',
        views: 'N/A',
        likes: 'N/A'
      };
    }
  } catch (err) {
    console.error('Direct download failed:', err.message);
  }

  return null;
}

module.exports = {
  name: 'tiktok',
  alias: ['tt', 'ctiktok', 'ctt', 'ctt1'],
  desc: 'Download TikTok video without any API key directly',
  category: 'downloader',
  run: async ({ sock, msg, jid, args, command }) => {
    try {
      const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const cmdUsed = (command || messageText.trim().split(/\s+/)[0].slice(1)).toLowerCase();
      const isChannelCmd = cmdUsed === 'ctt' || cmdUsed === 'ctiktok' || cmdUsed === 'ctt1';
      const isChannel2 = cmdUsed === 'ctt1';

      const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

      const fullText = args.join(' ').trim();
      let destinationJid = jid;
      let tiktokUrl = '';

      if (isChannelCmd) {
        if (fullText.includes(',')) {
          const parts = fullText.split(',');
          destinationJid = await resolveChannelJid(sock, parts[0].trim());
          tiktokUrl = parts.slice(1).join(',').trim();
        } else {
          const targetChannel = isChannel2 ? CHANNEL_2 : DEFAULT_CHANNEL;
          destinationJid = await resolveChannelJid(sock, targetChannel);
          tiktokUrl = fullText || quotedText;
        }
      } else {
        tiktokUrl = fullText || quotedText;
      }

      // Extract Clean Link
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

      // Direct Extraction (No API Keys needed)
      const videoResult = await getTikTokDirect(validTiktokUrl);

      if (!videoResult || !videoResult.downloadUrl) {
        return await sock.sendMessage(jid, { 
          text: '❌ Could not retrieve TikTok video. The link might be invalid or private.' 
        }, { quoted: msg });
      }

      const cleanTitle = (videoResult.title || '')
        .replace(/#\S+/g, '')
        .replace(/@\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Normal Chat Caption
      const normalChatCaption = 
`> *🎬⃝✨ H E S H A N   O F C   T I K T O K*

*❖ ᴛɪᴛʟᴇ :* ${cleanTitle || videoResult.title || 'TikTok Video'}
*❖ ᴄʀᴇᴀᴛᴏʀ :* @${videoResult.author}
*❖ ᴅᴜʀᴀᴛɪᴏɴ :* ${videoResult.duration}
*❖ ᴠɪᴇᴡs :* ${videoResult.views} • *ʟɪᴋᴇs :* ${videoResult.likes}

\`\`\`➥ Enjoy the video without watermark! 🍿✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Channel Caption (.ctt / .ctt1)
      let channelCaption = '';
      if (isChannel2) {
        channelCaption = cleanTitle || videoResult.title || '';
      } else {
        channelCaption = cleanTitle 
          ? `${cleanTitle}\n\n> *𝄞𝄢𝐑𝐚ප විතරමයි || 🎧🇱🇰*`
          : `> *𝄞𝄢𝐑𝐚ප විතරමයි || 🎧🇱🇰*`;
      }

      // Download buffer directly
      const videoStream = await axios({
        url: videoResult.downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'https://www.tiktok.com/'
        }
      });

      const videoBuffer = Buffer.from(videoStream.data);

      if (isChannelCmd) {
        await sock.sendMessage(destinationJid, {
          video: videoBuffer,
          caption: channelCaption,
          mimetype: 'video/mp4'
        });

        await sock.sendMessage(jid, { 
          text: `✅ *Success!* TikTok video uploaded to the channel.` 
        }, { quoted: msg });

      } else {
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
