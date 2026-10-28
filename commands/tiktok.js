const axios = require('axios');

// Default WhatsApp Channel Links
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D';
const CHANNEL_2 = 'https://whatsapp.com/channel/0029Vb9GVpd0wajsDAReUJ2k';

// 🔴 Chamindu API Key (100% Active Working Key)
const CHAMA_API_KEY = 'chama_api_9c55e3c6d014abbdf65054f9046a920b';

// 💬 .ctt වීඩියෝව ගිය පසු Channel එකට ස්වයංක්‍රීයව යන Text Message එක
const EXTRA_TEXT_MESSAGE = `*ඊලග video එක ඕනිනම් මේ video එකට react 30 ක් දෙන්න යාලුවනේ....😈☝️✊*`;

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

      // TikTok link extract (vt, vm හෝ www)
      const urlMatch = tiktokUrl.match(/https?:\/\/(?:vt\.|vm\.|www\.)?tiktok\.com\/[^\s]+/i);
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

      // Chamindu API Call
      const chamaUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(validTiktokUrl)}&api_key=${CHAMA_API_KEY}`;
      const { data: res } = await axios.get(chamaUrl, { timeout: 45000 });

      if (!res?.status || !res?.data) {
        return await sock.sendMessage(jid, { 
          text: '❌ Could not retrieve TikTok video. The link might be invalid or private.' 
        }, { quoted: msg });
      }

      const v = res.data;
      const downloadUrl = v.downloads?.no_watermark_hd || v.downloads?.no_watermark || v.downloads?.no_watermark_sd;

      if (!downloadUrl) {
        return await sock.sendMessage(jid, { 
          text: '❌ No watermark-free video download link found.' 
        }, { quoted: msg });
      }

      // Title clean-up
      const cleanTitle = (v.title || '')
        .replace(/#\S+/g, '')
        .replace(/@\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const author = v.author?.nickname || v.author?.unique_id || 'TikTok User';
      const duration = v.duration ? `${v.duration}s` : 'N/A';
      const views = formatNumber(v.stats?.views);
      const likes = formatNumber(v.stats?.likes);

      // Normal Chat Caption Design
      const normalChatCaption = 
`> *🎬⃝✨ H E S H A N   O F C   T I K T O K*

*❖ ᴛɪᴛʟᴇ :* ${cleanTitle || v.title || 'TikTok Video'}
*❖ ᴄʀᴇᴀᴛᴏʀ :* @${author}
*❖ ᴅᴜʀᴀᴛɪᴏɴ :* ${duration}
*❖ ᴠɪᴇᴡs :* ${views} • *ʟɪᴋᴇs :* ${likes}

\`\`\`➥ Enjoy the video without watermark! 🍿✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Channel Caption (.ctt / .ctt1)
      let channelCaption = '';
      if (isChannel2) {
        // .ctt1: නම නැතුව title පමණි
        channelCaption = cleanTitle || v.title || '';
      } else {
        // .ctt: නම සහිතව
        channelCaption = cleanTitle 
          ? `${cleanTitle}\n\n> *𝄞𝄢𝐑𝐚𝐩 විතරමයි || 🎧🇱🇰*`
          : `> *𝄞𝄢𝐑𝐚𝐩 විතරමයි || 🎧🇱🇰*`;
      }

      // Video Stream Buffer Download
      const videoStream = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });

      const videoBuffer = Buffer.from(videoStream.data);

      if (isChannelCmd) {
        // 1. Video එක Channel එකට Upload කිරීම
        await sock.sendMessage(destinationJid, {
          video: videoBuffer,
          caption: channelCaption,
          mimetype: 'video/mp4'
        });

        // 2. .ctt cmd එකට පමණක් auto text message එක channel එකට යැවීම
        if (isOnlyCtt) {
          await sock.sendMessage(destinationJid, {
            text: EXTRA_TEXT_MESSAGE
          });
        }

        await sock.sendMessage(jid, { 
          text: `✅ *Success!* TikTok video uploaded to the channel.` 
        }, { quoted: msg });

      } else {
        // Normal Chat එකට යැවීම
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
