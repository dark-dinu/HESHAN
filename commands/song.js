const axios = require('axios');
const yts = require('yt-search');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Active Chamindu API Key
const CHAMA_API_KEY = 'chama_api_9c55e3c6d014abbdf65054f9046a920b';

function getDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata?.format?.duration) return resolve(60);
      resolve(Math.round(metadata.format.duration));
    });
  });
}

function convertToOpus(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libopus')
      .audioChannels(1)
      .audioFrequency(48000)
      .audioBitrate('64k')
      .format('ogg')
      .outputOptions([
        '-avoid_negative_ts make_zero',
        '-map_metadata -1'
      ])
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}

async function fetchYouTubeDownload(targetYoutubeUrl) {
  try {
    const directUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(targetYoutubeUrl)}&quality=128k&format=mp3&api_key=${CHAMA_API_KEY}`;
    const { data: res } = await axios.get(directUrl, { timeout: 45000 });
    const dl = res?.download_url || res?.data?.download_url || res?.result?.download_url;
    if (dl) {
      return {
        downloadUrl: dl,
        title: res?.title || res?.data?.title || ''
      };
    }
  } catch (err) {
    console.warn('Direct MP3 fetch failed, trying MP4 format...');
  }

  try {
    const videoUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(targetYoutubeUrl)}&quality=360p&format=mp4&api_key=${CHAMA_API_KEY}`;
    const { data: res2 } = await axios.get(videoUrl, { timeout: 45000 });
    const dl2 = res2?.download_url || res2?.data?.download_url || res2?.result?.download_url;
    if (dl2) {
      return {
        downloadUrl: dl2,
        title: res2?.title || res2?.data?.title || ''
      };
    }
  } catch (e) {
    console.error('YouTube API Error:', e.message);
  }

  return null;
}

module.exports = {
  name: 'song',
  alias: ['play', 'sing', 'mp3', '1', '2', '3'],
  desc: 'Download song with selection (Audio, Document, Voice Note)',
  category: 'music',
  run: async ({ sock, msg, jid, args, command }) => {
    try {
      const messageText = msg.message?.conversation || 
                         msg.message?.extendedTextMessage?.text || '';

      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedText = quotedMsg?.conversation || 
                         quotedMsg?.extendedTextMessage?.text || 
                         quotedMsg?.imageMessage?.caption || '';

      const input = messageText.trim();
      const isSongCardReply = quotedText.includes('H E S H A N   O F C   M U S I C') || quotedText.includes('SELECT FORMAT');

      // ==========================================
      // 1. අංක 1, 2, 3 REPLY එක හඳුනාගැනීම
      // ==========================================
      if (isSongCardReply && (input === '1' || input === '2' || input === '3')) {
        const choice = input;

        // Quoted message එකෙන් Title එක ලබාගැනීම
        const titleMatch = quotedText.match(/TITLE\s*:\s*([^\n]+)/i);
        const songTitle = titleMatch ? titleMatch[1].trim() : 'Song';

        await sock.sendMessage(jid, { 
          text: `⏳ *HESHAN OFC:* Processing option *[${choice}]* for: *${songTitle}*...` 
        }, { quoted: msg });

        // YouTube search එකක් සිදු කර සෘජු link එක ලබා ගැනීම
        const searchResult = await yts(songTitle);
        if (!searchResult?.videos?.length) {
          return await sock.sendMessage(jid, { 
            text: '❌ *Song link could not be re-resolved.* Please try searching again.' 
          }, { quoted: msg });
        }

        const ytUrl = searchResult.videos[0].url;
        const ytData = await fetchYouTubeDownload(ytUrl);

        if (!ytData?.downloadUrl) {
          return await sock.sendMessage(jid, { 
            text: '❌ *Failed to get download stream from YouTube API.*' 
          }, { quoted: msg });
        }

        // Audio Buffer බාගත කිරීම
        const fileResponse = await axios({
          url: ytData.downloadUrl,
          method: 'GET',
          responseType: 'arraybuffer',
          timeout: 120000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const mediaBuffer = Buffer.from(fileResponse.data);
        const cleanFileName = `${(ytData.title || songTitle).replace(/[\\/:*?"<>|]/g, '')}.mp3`;

        // OPTION 1: Normal Audio Player
        if (choice === '1') {
          return await sock.sendMessage(jid, {
            audio: mediaBuffer,
            mimetype: 'audio/mpeg',
            ptt: false
          }, { quoted: msg });
        }

        // OPTION 2: Document (Save File)
        if (choice === '2') {
          return await sock.sendMessage(jid, {
            document: mediaBuffer,
            mimetype: 'audio/mpeg',
            fileName: cleanFileName,
            caption: `> *📥 ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴀᴜᴅɪᴏ ꜰɪʟᴇ*`
          }, { quoted: msg });
        }

        // OPTION 3: Voice Note (Opus PTT)
        if (choice === '3') {
          const tempDir = os.tmpdir();
          const tempInput = path.join(tempDir, `raw_${Date.now()}.bin`);
          const tempOutput = path.join(tempDir, `vn_${Date.now()}.ogg`);

          try {
            fs.writeFileSync(tempInput, mediaBuffer);
            await convertToOpus(tempInput, tempOutput);
            const audioSeconds = await getDuration(tempOutput);

            const dummyWaveform = new Uint8Array(64);
            for (let i = 0; i < 64; i++) {
              dummyWaveform[i] = Math.floor(Math.random() * 80) + 20;
            }

            const opusBuffer = fs.readFileSync(tempOutput);

            return await sock.sendMessage(jid, {
              audio: opusBuffer,
              mimetype: 'audio/ogg; codecs=opus',
              ptt: true,
              seconds: audioSeconds,
              waveform: dummyWaveform
            }, { quoted: msg });
          } finally {
            if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
            if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
          }
        }
      }

      // ==========================================
      // 2. SONG සර්ච් කර CARD එක යැවීම
      // ==========================================
      const query = args.join(' ').trim() || quotedText;

      if (!query || input === '1' || input === '2' || input === '3') {
        return await sock.sendMessage(jid, { 
          text: `⚠️ *How to use:*\n\n• \`.song <Song Name or YouTube Link>\`\n• Example: \`.song Lelena\`` 
        }, { quoted: msg });
      }

      await sock.sendMessage(jid, { 
        text: '⏳ *HESHAN OFC:* Searching YouTube track...' 
      }, { quoted: msg });

      let targetYoutubeUrl = query;
      let searchedTitle = query;
      let searchedThumbnail = '';
      let searchedDuration = '03:45';
      let searchedAuthor = 'Unknown Artist';

      const isYoutubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(query);

      if (!isYoutubeUrl) {
        const searchResult = await yts(query);
        if (!searchResult?.videos?.length) {
          return await sock.sendMessage(jid, { 
            text: '❌ *Song not found on YouTube.* Please check spelling.' 
          }, { quoted: msg });
        }
        const video = searchResult.videos[0];
        targetYoutubeUrl = video.url;
        searchedTitle = video.title;
        searchedThumbnail = video.thumbnail;
        searchedDuration = video.timestamp || '03:45';
        searchedAuthor = video.author?.name || 'Unknown Artist';
      }

      const menuCaption = 
`> *🎵⃝✨ H E S H A N   O F C   M U S I C*

*❖ TITLE :* ${searchedTitle}
*❖ ARTIST :* ${searchedAuthor}
*❖ DURATION :* ${searchedDuration}

01:23 ───🔘──────── ${searchedDuration}
⇄     ◁   ❚❚   ▷     ↻

╭━━━〔 SELECT FORMAT 〕━━━╮
┃
┃ 1 ➯ Audio File 🎧
┃ 2 ➯ Document File 📁
┃ 3 ➯ Voice Note (PTT) 🎙️
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯

➥ Reply to this message with 1, 2, or 3 to download!

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴜsɪᴄ ʜᴜʙ*`;

      await sock.sendMessage(jid, {
        image: { url: searchedThumbnail || 'https://i.imgur.com/8Q8ZQ8Z.png' },
        caption: menuCaption
      }, { quoted: msg });

    } catch (error) {
      console.error('Song Command Error:', error);
      await sock.sendMessage(jid, { 
        text: `❌ *An error occurred:* ${error.message}` 
      }, { quoted: msg });
    }
  }
};
