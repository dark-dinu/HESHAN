const axios = require('axios');

// Default WhatsApp Channel Links
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D';
const CHANNEL_2 = 'https://whatsapp.com/channel/0029Vb9GVpd0wajsDAReUJ2k';

// 🔴 Chamindu API Key
const CHAMA_API_KEY = 'chama_api_9c55e3c6d014abbdf65054f9046a920b';

// 💬 .ctt වීඩියෝව ගොස් තත්පර 15කින් Channel එකට යන Text Message එක
const EXTRA_TEXT_MESSAGE = `*ඊලග video එක ඕනිනම් මේ video එකට react 30 ක් දෙන්න යාලුවනේ....😈☝️✊*`;

// Delay Helper Function (Milliseconds)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * WhatsApp Channel JID Resolver (@newsletter format)
 */
async function resolveChannelJid(sock, channelInput) {
  let input = channelInput.trim();
  if (input.endsWith('@newsletter')) return input;

  const match = input.match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([a-zA-Z0-9]+)/i);
  if (match && match[1]) {
    const inviteCode = match[1];
    try {
      if (typeof sock.newsletterMetadata === 'function') {
        const meta = await sock.newsletterMetadata('invite', inviteCode);
        if (meta?.id) return meta.id;
      }
    } catch (e) {
      console.error('Newsletter meta error:', e.message);
    }
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
 * Multi-API TikTok Scraper (Chamindu API -> Fallback to TikWM)
 */
async function fetchTikTokData(tiktokUrl) {
  // 1. First Try: Chamindu API
  try {
    const chamaUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(tiktokUrl)}&api_key=${CHAMA_API_KEY}`;
    const { data: res } = await axios.get(chamaUrl, { timeout: 20000 });
    if (res?.status && res?.data) {
      const v = res.data;
      const downloadUrl = v.downloads?.no_watermark_hd || v.downloads?.no_watermark || v.downloads?.no_watermark_sd;
      if (downloadUrl) {
        return {
          title: v.title || '',
          author: v.author?.nickname || v.author?.unique_id || 'TikTok User',
          duration: v.duration ? `${v.duration}s` : 'N/A',
          views: formatNumber(v.stats?.views),
          likes: formatNumber(v.stats?.likes),
          downloadUrl
        };
      }
    }
  } catch (err) {
    console.warn('Chamindu API failed, attempting Fallback API...');
  }

  // 2. Fallback: TikWM Official Public API (No Key Required, Highly Stable)
  try {
    const { data: tikRes } = await axios.post(
      'https://www.tikwm.com/api/',
      new URLSearchParams({ url: tiktokUrl, hd: '1' }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        timeout: 25000
      }
    );

    if (tikRes?.code === 0 && tikRes?.data) {
      const d = tikRes.data;
      return {
        title: d.title || '',
        author: d.author?.nickname || d.author?.unique_id || 'TikTok User',
        duration: d.duration ? `${d.duration}s` : 'N/A',
        views: formatNumber(d.play_count),
        likes: formatNumber(d.digg_count),
        downloadUrl: d.hdplay || d.play
      };
    }
  } catch (err) {
    console.error('Fallback API failed:', err.message);
  }

  return null;
}

module.exports = {
  name: 'tiktok',
  alias: ['tt', 'ctiktok', 'ctt', 'ctt1'],
  desc: 'Download TikTok video to chat or send to WhatsApp channel',
  category: 'downloader',
  run: async ({ sock, msg, jid, args, command }) => {
    try {
      const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const cmdUsed = (command || messageText.trim().split(/\s+/)[0].slice(1)).toLowerCase();
      const isChannelCmd = cmdUsed === 'ctt' || cmdUsed === 'ctiktok' || cmdUsed === 'ctt1';
      const isChannel2 = cmdUsed === 'ctt1';
      const isOnlyCtt = cmdUsed === 'ctt';

      // Reply message text extract
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

      // TikTok link extract (vt, vm, www හෝ direct shorts link)
      const urlMatch = tiktokUrl.match(/https?:\/\/(?:[a-zA-Z0-9_-]+\.)?tiktok\.com\/[^\s]+/i);
      if (!urlMatch) {
        return await sock.sendMessage(jid, { 
          text: isChannelCmd
            ? `⚠️ *No TikTok link found!*\n\n*Usage:* \`.${cmdUsed} <TikTok Link>\`\n*Or* reply to a link with \`.${cmdUsed}\``
            : `⚠️ *No TikTok link found!*\n\n*Usage:* \`.tt <TikTok Link>\`\n*Or* reply to a link with \`.tt\``
        }, { quoted: msg });
      }

      const validTiktokUrl = urlMatch[0].trim();

      await sock.sendMessage(jid, { 
        text: isChannelCmd 
          ? '⏳ *HESHAN OFC:* Processing TikTok video for channel...' 
          : '⏳ *HESHAN OFC:* Downloading TikTok video...' 
      }, { quoted: msg });

      // Fetch Video Data with Multi-API Support
      const videoData = await fetchTikTokData(validTiktokUrl);

      if (!videoData || !videoData.downloadUrl) {
        return await sock.sendMessage(jid, { 
          text: '❌ Could not retrieve TikTok video. The link might be invalid, private, or region-blocked.' 
        }, { quoted: msg });
      }

      // Title clean-up
      const cleanTitle = (videoData.title || '')
        .replace(/#\S+/g, '')
        .replace(/@\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Normal Chat Caption Design
      const normalChatCaption = 
`> *🎬⃝✨ H E S H A N   O F C   T I K T O K*

*❖ ᴛɪᴛʟᴇ :* ${cleanTitle || 'TikTok Video'}
*❖ ᴄʀᴇᴀᴛᴏʀ :* @${videoData.author}
*❖ ᴅᴜʀᴀᴛɪᴏɴ :* ${videoData.duration}
*❖ ᴠɪᴇᴡs :* ${videoData.views} • *ʟɪᴋᴇs :* ${videoData.likes}

\`\`\`➥ Enjoy the video without watermark! 🍿✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Channel Caption (.ctt / .ctt1)
      let channelCaption = '';
      if (isChannel2) {
        channelCaption = cleanTitle || 'TikTok Video';
      } else {
        channelCaption = cleanTitle 
          ? `${cleanTitle}\n\n> *𝄞𝄢𝐑𝐚𝐩 විතරමයි || 🎧🇱🇰*`
          : `> *𝄞𝄢𝐑𝐚𝐩 විතරමයි || 🎧🇱🇰*`;
      }

      // Download Stream to Buffer
      const videoStream = await axios({
        url: videoData.downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.tiktok.com/'
        }
      });

      const videoBuffer = Buffer.from(videoStream.data);

      if (isChannelCmd) {
        // Channel JID එක resolve නොවී invite link එකක් විදිහටම තියෙනවද බැලීම
        if (!destinationJid.endsWith('@newsletter')) {
          return await sock.sendMessage(jid, {
            text: `❌ Could not resolve Channel JID. Make sure the bot is an admin in the channel or check the channel link.`
          }, { quoted: msg });
        }

        // 1. Channel Upload
        await sock.sendMessage(destinationJid, {
          video: videoBuffer,
          caption: channelCaption,
          mimetype: 'video/mp4'
        });

        await sock.sendMessage(jid, { 
          text: `✅ *Success!* TikTok video uploaded to the channel.` 
        }, { quoted: msg });

        // 2. Extra message delay for .ctt
        if (isOnlyCtt) {
          await delay(15000);
          await sock.sendMessage(destinationJid, {
            text: EXTRA_TEXT_MESSAGE
          });
        }

      } else {
        // Direct Chat Send
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
