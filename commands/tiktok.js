const axios = require('axios');

// 🔴 ඔයාගේ WhatsApp Channel වල නියම JID මෙතනට දාන්න (Invite link වෙනුවට JID එක දැමීමෙන් 100% ක් Fail වීම නවතී)
// (Channel එකේ Settings හෝ Info බැලූ විට ලැබෙන 120363xxx@newsletter format එක)
// Invite link එකක් දැම්මත් code එකෙන් auto-convert කරගනී.
const DEFAULT_CHANNEL_INPUT = 'https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D';
const CHANNEL_2_INPUT = 'https://whatsapp.com/channel/0029Vb9GVpd0wajsDAReUJ2k';

// 🔴 Chamindu API Key
const CHAMA_API_KEY = 'chama_api_9c55e3c6d014abbdf65054f9046a920b';

// 💬 .ctt වීඩියෝව ගොස් තත්පර 15කින් Channel එකට යන Text Message එක
const EXTRA_TEXT_MESSAGE = `*ඊලග video එක ඕනිනම් මේ video එකට react 30 ක් දෙන්න යාලුවනේ....😈☝️✊*`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * WhatsApp Channel Invite Link -> JID Resolver
 */
async function getChannelJid(sock, input) {
  const cleanInput = input.trim();
  if (cleanInput.endsWith('@newsletter')) return cleanInput;

  const match = cleanInput.match(/(?:whatsapp\.com\/channel\/)([a-zA-Z0-9]+)/i);
  if (match && match[1]) {
    const inviteCode = match[1];
    try {
      if (typeof sock.newsletterMetadata === 'function') {
        const res = await sock.newsletterMetadata('invite', inviteCode);
        if (res?.id) return res.id;
      }
    } catch (e) {
      console.error('Channel metadata fetch failed:', e.message);
    }
  }
  return cleanInput;
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

/**
 * TikTok Video Data Multi-Scraper
 */
async function fetchTikTokVideo(url) {
  // 1. First Try: Chamindu API
  try {
    const chamaUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(url)}&api_key=${CHAMA_API_KEY}`;
    const { data: res } = await axios.get(chamaUrl, { timeout: 25000 });
    if (res?.status && res?.data) {
      const v = res.data;
      const dl = v.downloads?.no_watermark_hd || v.downloads?.no_watermark || v.downloads?.no_watermark_sd;
      if (dl) {
        return {
          title: v.title || '',
          author: v.author?.nickname || v.author?.unique_id || 'TikTok User',
          duration: v.duration ? `${v.duration}s` : 'N/A',
          views: formatNumber(v.stats?.views),
          likes: formatNumber(v.stats?.likes),
          downloadUrl: dl
        };
      }
    }
  } catch (e) {}

  // 2. Backup: TikWM High-Speed API
  try {
    const { data: res } = await axios.post(
      'https://www.tikwm.com/api/',
      new URLSearchParams({ url, hd: '1' }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        timeout: 25000
      }
    );
    if (res?.code === 0 && res?.data) {
      const d = res.data;
      return {
        title: d.title || '',
        author: d.author?.nickname || d.author?.unique_id || 'TikTok User',
        duration: d.duration ? `${d.duration}s` : 'N/A',
        views: formatNumber(d.play_count),
        likes: formatNumber(d.digg_count),
        downloadUrl: d.hdplay || d.play
      };
    }
  } catch (e) {}

  return null;
}

module.exports = {
  name: 'tiktok',
  alias: ['tt', 'ctiktok', 'ctt', 'ctt1'],
  desc: 'Download TikTok video to chat or send to WhatsApp channel',
  category: 'downloader',
  run: async ({ sock, msg, jid, args, command }) => {
    try {
      const textMsg = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const cmdUsed = (command || textMsg.trim().split(/\s+/)[0].slice(1)).toLowerCase();
      
      const isChannelCmd = ['ctt', 'ctiktok', 'ctt1'].includes(cmdUsed);
      const isChannel2 = cmdUsed === 'ctt1';
      const isOnlyCtt = cmdUsed === 'ctt';

      const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

      const rawInput = args.join(' ').trim();
      let tiktokUrl = rawInput || quotedText;

      // URL එක අල්ලා ගැනීම
      const match = tiktokUrl.match(/https?:\/\/(?:[a-zA-Z0-9_-]+\.)?tiktok\.com\/[^\s]+/i);
      if (!match) {
        return await sock.sendMessage(jid, {
          text: `⚠️ *කරුණාකර නිවැරදි TikTok Link එකක් ලබාදෙන්න!*\n\n*භාවිතය:* \`.${cmdUsed} <TikTok Link>\`\n*නැතහොත් link එකකට reply කර:* \`.${cmdUsed}\``
        }, { quoted: msg });
      }

      const validUrl = match[0].trim();

      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

      // Video එක Fetch කිරීම
      const data = await fetchTikTokVideo(validUrl);
      if (!data || !data.downloadUrl) {
        return await sock.sendMessage(jid, {
          text: '❌ වීඩියෝව ලබාගැනීමට නොහැකි විය. Link එක පරීක්ෂා කරන්න.'
        }, { quoted: msg });
      }

      // Title Clean-up
      const cleanTitle = (data.title || '')
        .replace(/#\S+/g, '')
        .replace(/@\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Normal Chat Caption
      const normalCaption = 
`> *🎬⃝✨ H E S H A N   O F C   T I K T O K*

*❖ ᴛɪᴛʟᴇ :* ${cleanTitle || 'TikTok Video'}
*❖ ᴄʀᴇᴀᴛᴏʀ :* @${data.author}
*❖ ᴅᴜʀᴀᴛɪᴏɴ :* ${data.duration}
*❖ ᴠɪᴇᴡs :* ${data.views} • *ʟɪᴋᴇs :* ${data.likes}

\`\`\`➥ Enjoy the video without watermark! 🍿✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Channel Caption
      let channelCaption = '';
      if (isChannel2) {
        channelCaption = cleanTitle || 'TikTok Video';
      } else {
        channelCaption = cleanTitle 
          ? `${cleanTitle}\n\n> *𝄞𝄢𝐑𝐚𝐩 විතරමයි || 🎧🇱🇰*`
          : `> *𝄞𝄢𝐑𝐚𝐩 විතරමයි || 🎧🇱🇰*`;
      }

      // Download Stream to Buffer
      const stream = await axios({
        url: data.downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const videoBuffer = Buffer.from(stream.data);

      if (isChannelCmd) {
        // Channel එක Resolve කරගැනීම
        const targetInput = isChannel2 ? CHANNEL_2_INPUT : DEFAULT_CHANNEL_INPUT;
        const targetChannelJid = await getChannelJid(sock, targetInput);

        if (!targetChannelJid.endsWith('@newsletter')) {
          return await sock.sendMessage(jid, {
            text: `❌ *Channel JID එක සොයාගත නොහැකි විය!*\nබොට් Channel එකේ Admin කෙනෙක් දැයි පරීක්ෂා කරන්න.`
          }, { quoted: msg });
        }

        // 1. Channel එකට Video එක යැවීම
        await sock.sendMessage(targetChannelJid, {
          video: videoBuffer,
          caption: channelCaption,
          mimetype: 'video/mp4'
        });

        await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        await sock.sendMessage(jid, {
          text: `✅ *සාර්ථකයි!* වීඩියෝව WhatsApp Channel එකට Upload කරන ලදී.`
        }, { quoted: msg });

        // 2. .ctt පමණක් තත්පර 15කින් අමතර message එක යැවීම
        if (isOnlyCtt) {
          await delay(15000);
          await sock.sendMessage(targetChannelJid, {
            text: EXTRA_TEXT_MESSAGE
          });
        }

      } else {
        // Normal Chat Send
        await sock.sendMessage(jid, {
          video: videoBuffer,
          caption: normalCaption,
          mimetype: 'video/mp4'
        }, { quoted: msg });
        await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
      }

    } catch (err) {
      console.error('TikTok Command Execution Error:', err);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(jid, { text: `❌ දෝෂයක් සිදු විය: ${err.message}` }, { quoted: msg });
    }
  }
};
