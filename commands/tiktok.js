const axios = require('axios');

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

/**
 * Views / Likes format කිරීම (e.g. 591910 -> 591.9K)
 */
function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

module.exports = {
  name: 'tiktok',
  alias: ['tt', 'ctiktok', 'ctt'],
  desc: 'Download TikTok video to chat or send to a channel',
  category: 'downloader',
  run: async ({ sock, msg, jid, args, command }) => {
    try {
      // Command එක හඳුනා ගැනීම (ctt ද tt ද කියා)
      const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const cmdUsed = (command || messageText.trim().split(/\s+/)[0].slice(1)).toLowerCase();
      const isChannelCmd = cmdUsed === 'ctt' || cmdUsed === 'ctiktok';

      const fullText = args.join(' ').trim();
      let targetJid = jid;
      let tiktokUrl = '';

      // 1. Inputs වෙන් කර හඳුනා ගැනීම
      if (isChannelCmd) {
        // Channel Command (.ctt / .ctiktok)
        const parts = fullText.split(',');
        if (parts.length < 2) {
          return await sock.sendMessage(jid, { 
            text: `⚠️ *භාවිතා කරන ආකාරය:*\n\n.ctt <Channel Link>, <TikTok Link>\n\n*උදාහරණ:*\n.ctt https://whatsapp.com/channel/xxx, https://vt.tiktok.com/xxxx/` 
          }, { quoted: msg });
        }
        const channelInput = parts[0].trim();
        tiktokUrl = parts.slice(1).join(',').trim();
        targetJid = await resolveChannelJid(sock, channelInput);
      } else {
        // Normal Chat Command (.tt / .tiktok)
        if (!fullText) {
          return await sock.sendMessage(jid, { 
            text: `⚠️ *භාවිතා කරන ආකාරය:*\n\n.tt <TikTok Link>\n\n*උදාහරණ:*\n.tt https://vt.tiktok.com/xxxx/` 
          }, { quoted: msg });
        }
        tiktokUrl = fullText;
      }

      // Link Validation
      if (!tiktokUrl.includes('tiktok.com')) {
        return await sock.sendMessage(jid, { text: '❌ කරුණාකර නිවැරදි TikTok වීඩියෝ link එකක් ලබා දෙන්න.' }, { quoted: msg });
      }

      await sock.sendMessage(jid, { 
        text: isChannelCmd 
          ? '⏳ *HESHAN OFC:* වීඩියෝව Channel එකට සකසමින් පවතී...' 
          : '⏳ *HESHAN OFC:* වීඩියෝව බාගත වෙමින් පවතී...' 
      }, { quoted: msg });

      // 2. Chamindu API Call
      const apiKey = 'chama_api_ec9848130d1aea209f08fb85e0b4720f';
      const apiUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(tiktokUrl)}&api_key=${apiKey}`;

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

      // 3. Caption Design
      const videoCaption = 
`> *🎬⃝✨ H E S H A N   O F C   T I K T O K*

*❖ ᴛɪᴛʟᴇ :* ${title}
*❖ ᴄʀᴇᴀᴛᴏʀ :* @${author}
*❖ ᴅᴜʀᴀᴛɪᴏɴ :* ${duration}
*❖ ᴠɪᴇᴡs :* ${views} • *ʟɪᴋᴇs :* ${likes}

\`\`\`➥ Enjoy the video without watermark! 🍿✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // 4. Video Buffer Download (Buffer එකක් ලෙස ගැනීමෙන් WhatsApp Channels වලට සහ Normal Chat වලට 100% upload වේ)
      const videoStream = await axios({
        url: videoDownloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const videoBuffer = Buffer.from(videoStream.data);

      // 5. Video එක යැවීම
      if (isChannelCmd) {
        // Channel එකට යැවීම
        await sock.sendMessage(targetJid, {
          video: videoBuffer,
          caption: videoCaption,
          mimetype: 'video/mp4'
        });

        // User හට confirmation එකක්
        await sock.sendMessage(jid, { 
          text: `✅ *සාර්ථකයි!* TikTok වීඩියෝව Channel එකට සාර්ථකව යවන ලදී.` 
        }, { quoted: msg });

      } else {
        // සාමාන්‍ය Chat එකට යැවීම
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
