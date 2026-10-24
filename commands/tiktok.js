const axios = require('axios');

// Default WhatsApp Channel Links
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D';
const CHANNEL_2 = 'https://whatsapp.com/channel/0029Vb9GVpd0wajsDAReUJ2k';

// 🔴 Chamindu API Key (Updated Active Key)
const CHAMA_API_KEY = 'chama_api_a07913f17a3e85774735fe6d9cdcdea6';

/**
 * WhatsApp Channel JID Resolver
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
 * vt.tiktok.com හෝ vm.tiktok.com short links සම්පූර්ණ URL එක බවට පත් කිරීම
 */
async function expandUrl(shortUrl) {
  try {
    const res = await axios.get(shortUrl, {
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return res.request?.res?.responseUrl || res.config?.url || shortUrl;
  } catch (err) {
    if (err.response?.headers?.location) {
      return err.response.headers.location;
    }
    return shortUrl;
  }
}

/**
 * Primary: Chamindu API | Fallback: TikWM
 */
async function getTikTokData(inputUrl) {
  const realUrl = await expandUrl(inputUrl);

  // 1. Primary: Chamindu API (New Working Key)
  try {
    const chamaUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(realUrl)}&api_key=${CHAMA_API_KEY}`;
    const res = await axios.get(chamaUrl, { timeout: 25000 });

    if (res?.data?.status && res?.data?.data) {
      const v = res.data.data;
      const downloadUrl = v.downloads?.no_watermark_hd || v.downloads?.no_watermark || v.downloads?.no_watermark_sd;

      if (downloadUrl) {
        return {
          downloadUrl,
          title: v.title || '',
          author: v.author?.nickname || v.author?.unique_id || 'TikTok User',
          duration: v.duration ? `${v.duration}s` : 'N/A',
          views: formatNumber(v.stats?.views),
          likes: formatNumber(v.stats?.likes)
        };
      }
    }
  } catch (e) {
    console.warn('Chamindu API failed, trying TikWM fallback...');
  }

  // 2. Backup Fallback: TikWM Direct
  try {
    const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(realUrl)}&hd=1`;
    const res = await axios.get(tikwmUrl, {
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (res?.data?.code === 0 && res?.data?.data) {
      const d = res.data.data;
      const dl = d.hdplay || d.play || d.wmplay;
      const downloadUrl = dl.startsWith('http') ? dl : `https://www.tikwm.com${dl}`;

      return {
        downloadUrl,
        title: d.title || '',
        author: d.author?.nickname || d.author?.unique_id || 'TikTok User',
        duration: d.duration ? `${d.duration}s` : 'N/A',
        views: formatNumber(d.play_count),
        likes: formatNumber(d.digg_count)
      };
    }
  } catch (err) {
    console.error('TikTok download failed on all methods:', err.message);
  }

  return null;
}

module.exports = {
  name: 'tiktok',
  alias: ['tt', 'ctiktok', 'ctt', 'ctt1'],
  desc: 'Download TikTok video using Chamindu API with direct stream',
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

      // Link Extract
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

      // Get video data using updated API
      const videoResult = await getTikTokData(validTiktokUrl);

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

      // Download Stream Buffer
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
