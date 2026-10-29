const axios = require('axios');
const yts = require('yt-search');

// Default WhatsApp Channel Link
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbAAjtcC1FuCIiYc8z3T';

// Chamindu Active API Key
const CHAMA_API_KEY = 'chama_api_9c55e3c6d014abbdf65054f9046a920b';

/**
 * WhatsApp Channel JID Resolver (@newsletter)
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

/**
 * Chamindu YouTube MP4 API
 */
async function fetchYouTubeVideo(ytUrl) {
  const qualities = ['1080p', '720p', '480p', '360p'];
  for (const q of qualities) {
    try {
      const apiUrl = `https://api.chamindu.site/api/v1/youtube/mp4?url=${encodeURIComponent(ytUrl)}&quality=${q}&api_key=${CHAMA_API_KEY}`;
      const { data: res } = await axios.get(apiUrl, { timeout: 35000 });

      if (res?.status && res?.data?.download_url) {
        return {
          downloadUrl: res.data.download_url,
          title: res.data.title || '',
          quality: res.data.quality || q,
          thumbnail: res.data.thumbnail || ''
        };
      }
    } catch (e) {
      console.warn(`YouTube ${q} fetch failed, checking lower resolution...`);
    }
  }
  return null;
}

module.exports = {
  name: 'ytv',
  alias: ['ytmp4', 'cytv', 'cytmp4', 'video'],
  desc: 'Download YouTube video to chat or WhatsApp channel',
  category: 'downloader',
  run: async ({ sock, msg, jid, args, command }) => {
    try {
      const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const cmdUsed = (command || messageText.trim().split(/\s+/)[0].slice(1)).toLowerCase();
      const isChannelCmd = cmdUsed === 'cytv' || cmdUsed === 'cytmp4';

      const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

      const fullText = args.join(' ').trim();
      let destinationJid = jid;
      let query = '';

      if (isChannelCmd) {
        if (fullText.includes(',')) {
          const parts = fullText.split(',');
          destinationJid = await resolveChannelJid(sock, parts[0].trim());
          query = parts.slice(1).join(',').trim();
        } else {
          destinationJid = await resolveChannelJid(sock, DEFAULT_CHANNEL);
          query = fullText || quotedText;
        }
      } else {
        query = fullText || quotedText;
      }

      if (!query) {
        return await sock.sendMessage(jid, {
          text: isChannelCmd
            ? `⚠️ *How to use:*\n\n• \`.${cmdUsed} <Song/Video Name or YouTube Link>\`\n• \`.${cmdUsed} <Channel Link>, <Song/Video Name or Link>\``
            : `⚠️ *How to use:*\n\n• \`.ytv <Song/Video Name or YouTube Link>\`\n• Reply to a YouTube link with \`.ytv\``
        }, { quoted: msg });
      }

      await sock.sendMessage(jid, {
        text: isChannelCmd
          ? '⏳ *HESHAN OFC:* Processing YouTube video for channel...'
          : '⏳ *HESHAN OFC:* Downloading YouTube video...'
      }, { quoted: msg });

      let targetYoutubeUrl = query;
      let searchedTitle = query;
      let searchedDuration = 'N/A';

      const isYoutubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(query);

      // YouTube Link එකක් නොවේ නම් නමින් search කර link එක ලබා ගැනීම
      if (!isYoutubeUrl) {
        const searchResult = await yts(query);
        if (!searchResult?.videos?.length) {
          return await sock.sendMessage(jid, { text: '❌ No results found on YouTube.' }, { quoted: msg });
        }
        const firstVid = searchResult.videos[0];
        targetYoutubeUrl = firstVid.url;
        searchedTitle = firstVid.title;
        searchedDuration = firstVid.timestamp || 'N/A';
      }

      // API Call
      const ytData = await fetchYouTubeVideo(targetYoutubeUrl);

      if (!ytData?.downloadUrl) {
        return await sock.sendMessage(jid, {
          text: '❌ Failed to generate video download link. Video might be age-restricted or unavailable.'
        }, { quoted: msg });
      }

      const finalTitle = (ytData.title || searchedTitle).replace(/[#@]/g, '').trim();

      // Normal Chat Caption
      const normalCaption =
`> *🎬⃝✨ H E S H A N   O F C   Y O U T U B E*

*❖ ᴛɪᴛʟᴇ :* ${finalTitle}
*❖ ǫᴜᴀʟɪᴛʏ :* ${ytData.quality}
*❖ ᴅᴜʀᴀᴛɪᴏɴ :* ${searchedDuration}

\`\`\`➥ High speed stream generated successfully! 🍿✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Channel Caption
      const channelCaption = `${finalTitle}\n\n> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Video Stream Buffer Download
      const fileStream = await axios({
        url: ytData.downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 180000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });

      const videoBuffer = Buffer.from(fileStream.data);

      if (isChannelCmd) {
        // Channel එකට upload කිරීම
        await sock.sendMessage(destinationJid, {
          video: videoBuffer,
          caption: channelCaption,
          mimetype: 'video/mp4'
        });

        await sock.sendMessage(jid, {
          text: `✅ *Success!* YouTube video uploaded to the channel.`
        }, { quoted: msg });

      } else {
        // Chat එකට යැවීම
        await sock.sendMessage(jid, {
          video: videoBuffer,
          caption: normalCaption,
          mimetype: 'video/mp4'
        }, { quoted: msg });
      }

    } catch (error) {
      console.error('YouTube Downloader Error:', error);
      await sock.sendMessage(jid, { text: `❌ An error occurred: ${error.message}` }, { quoted: msg });
    }
  }
};
