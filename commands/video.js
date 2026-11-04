const axios = require('axios');
const yts = require('yt-search');

const CHAMA_API_KEY = 'chama_api_9c55e3c6d014abbdf65054f9046a920b';

const QUALITY_MAP = {
  '1': '360p',
  '2': '480p',
  '3': '720p',
  '4': '1080p'
};

async function fetchYouTubeVideoDownload(targetYoutubeUrl, quality = '720p') {
  try {
    const directUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(targetYoutubeUrl)}&quality=${quality}&format=mp4&api_key=${CHAMA_API_KEY}`;
    const { data: res } = await axios.get(directUrl, { timeout: 45000 });
    const dl = res?.download_url || res?.data?.download_url || res?.result?.download_url;
    if (dl) {
      return {
        downloadUrl: dl,
        title: res?.title || res?.data?.title || '',
        quality: res?.quality || quality
      };
    }
  } catch (err) {}

  try {
    const fallbackUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(targetYoutubeUrl)}&quality=360p&format=mp4&api_key=${CHAMA_API_KEY}`;
    const { data: res2 } = await axios.get(fallbackUrl, { timeout: 45000 });
    const dl2 = res2?.download_url || res2?.data?.download_url || res2?.result?.download_url;
    if (dl2) {
      return {
        downloadUrl: dl2,
        title: res2?.title || res2?.data?.title || '',
        quality: '360p'
      };
    }
  } catch (e) {}

  return null;
}

module.exports = {
  name: 'video',
  alias: ['ytv', 'ytvideo', 'mp4'],
  desc: 'Download YouTube video with quality selection',
  category: 'downloader',

  // 1, 2, 3, 4 Reply Handling
  onReply: async ({ sock, msg, jid, text, quotedText }) => {
    const isVideoCard = quotedText.includes('H E S H A N   O F C   V I D E O') || quotedText.includes('SELECT QUALITY');
    const isValidChoice = ['1', '2', '3', '4'].includes(text.trim());

    if (!isVideoCard || !isValidChoice) return false;

    const choice = text.trim();
    const selectedQuality = QUALITY_MAP[choice] || '720p';
    const titleMatch = quotedText.match(/TITLE\s*:\s*([^\n]+)/i);
    const videoTitle = titleMatch ? titleMatch[1].trim() : 'Video';

    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    const searchResult = await yts(videoTitle);
    if (!searchResult?.videos?.length) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      return true;
    }

    const ytData = await fetchYouTubeVideoDownload(searchResult.videos[0].url, selectedQuality);
    if (!ytData?.downloadUrl) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      return true;
    }

    const fileResponse = await axios({
      url: ytData.downloadUrl,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 180000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const videoBuffer = Buffer.from(fileResponse.data);

    await sock.sendMessage(jid, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      caption: 
`> *🎬⃝✨ H E S H A N   O F C   V I D E O*

*❖ ᴛɪᴛʟᴇ :* ${ytData.title || videoTitle}
*❖ ǫᴜᴀʟɪᴛʏ :* ${ytData.quality}

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`
    }, { quoted: msg });

    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    return true;
  },

  // Normal Command Execution
  run: async ({ sock, msg, jid, args, reply }) => {
    try {
      const query = args.join(' ').trim();
      if (!query) return reply('⚠️ *Usage:* `.video <Video Name>`\n*Example:* `.video Lelena`');

      await sock.sendMessage(jid, { react: { text: '🎬', key: msg.key } });

      let targetYoutubeUrl = query;
      let searchedTitle = query;
      let searchedThumbnail = '';
      let searchedDuration = '03:45';
      let searchedAuthor = 'Unknown Channel';

      const isYoutubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(query);
      if (!isYoutubeUrl) {
        const searchResult = await yts(query);
        if (!searchResult?.videos?.length) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          return reply('❌ *Video not found on YouTube.*');
        }
        const video = searchResult.videos[0];
        targetYoutubeUrl = video.url;
        searchedTitle = video.title;
        searchedThumbnail = video.thumbnail;
        searchedDuration = video.timestamp || '03:45';
        searchedAuthor = video.author?.name || 'Unknown Channel';
      }

      const menuCaption = 
`> *🎬⃝✨ H E S H A N   O F C   V I D E O*

*❖ TITLE :* ${searchedTitle}
*❖ CHANNEL :* ${searchedAuthor}
*❖ DURATION :* ${searchedDuration}

01:23 ───🔘──────── ${searchedDuration}
⇄     ◁   ❚❚   ▷     ↻

╭━━━〔 SELECT QUALITY 〕━━━╮
┃
┃ 1 ➯ 360p (Data Saver) 📱
┃ 2 ➯ 480p (Standard) 🎬
┃ 3 ➯ 720p (High Def) 🌟
┃ 4 ➯ 1080p (Full HD) 🚀
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯

➥ Reply to this message with 1, 2, 3, or 4 to download!

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      await sock.sendMessage(jid, {
        image: { url: searchedThumbnail || 'https://i.imgur.com/8Q8ZQ8Z.png' },
        caption: menuCaption
      }, { quoted: msg });

    } catch (error) {
      console.error('Video Error:', error);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    }
  }
};
