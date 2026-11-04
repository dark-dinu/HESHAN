const axios = require('axios');
const yts = require('yt-search');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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
      .outputOptions(['-avoid_negative_ts make_zero', '-map_metadata -1'])
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
    if (dl) return { downloadUrl: dl, title: res?.title || res?.data?.title || '' };
  } catch (err) {}

  try {
    const videoUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(targetYoutubeUrl)}&quality=360p&format=mp4&api_key=${CHAMA_API_KEY}`;
    const { data: res2 } = await axios.get(videoUrl, { timeout: 45000 });
    const dl2 = res2?.download_url || res2?.data?.download_url || res2?.result?.download_url;
    if (dl2) return { downloadUrl: dl2, title: res2?.title || res2?.data?.title || '' };
  } catch (e) {}

  return null;
}

module.exports = {
  name: 'song',
  alias: ['play', 'sing', 'mp3'],
  desc: 'Download song with selection (Audio, Document, Voice Note)',
  category: 'music',
  run: async ({ sock, msg, jid, args, text, reply }) => {
    try {
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedCaption = quotedMsg?.imageMessage?.caption || 
                            quotedMsg?.conversation || 
                            quotedMsg?.extendedTextMessage?.text || '';

      const isReply = ['1', '2', '3'].includes(text?.trim());
      const isSongCard = quotedCaption.includes('H E S H A N   O F C   M U S I C') || quotedCaption.includes('SELECT FORMAT');

      // ==========================================
      // 1. අංක 1, 2, 3 එබූ විට FILE එක පමණක් යැවීම
      // ==========================================
      if (isReply && isSongCard) {
        const choice = text.trim();
        const titleMatch = quotedCaption.match(/TITLE\s*:\s*([^\n]+)/i);
        const songTitle = titleMatch ? titleMatch[1].trim() : 'Song';

        // පරිශීලකයාගේ අංකයට React දැමීම (Processing indicator)
        await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

        const searchResult = await yts(songTitle);
        if (!searchResult?.videos?.length) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          return;
        }

        const ytData = await fetchYouTubeDownload(searchResult.videos[0].url);
        if (!ytData?.downloadUrl) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          return;
        }

        const fileResponse = await axios({
          url: ytData.downloadUrl,
          method: 'GET',
          responseType: 'arraybuffer',
          timeout: 120000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const mediaBuffer = Buffer.from(fileResponse.data);
        const cleanFileName = `${(ytData.title || songTitle).replace(/[\\/:*?"<>|]/g, '')}.mp3`;

        // 1. Audio File (Player)
        if (choice === '1') {
          await sock.sendMessage(jid, { 
            audio: mediaBuffer, 
            mimetype: 'audio/mpeg', 
            ptt: false 
          }, { quoted: msg });
        } 
        // 2. Document File (Save File)
        else if (choice === '2') {
          await sock.sendMessage(jid, { 
            document: mediaBuffer, 
            mimetype: 'audio/mpeg', 
            fileName: cleanFileName, 
            caption: `> *📥 ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴀᴜᴅɪᴏ ꜰɪʟᴇ*` 
          }, { quoted: msg });
        } 
        // 3. Playable Voice Note (Opus PTT)
        else if (choice === '3') {
          const tempDir = os.tmpdir();
          const tempInput = path.join(tempDir, `raw_${Date.now()}.bin`);
          const tempOutput = path.join(tempDir, `vn_${Date.now()}.ogg`);
          try {
            fs.writeFileSync(tempInput, mediaBuffer);
            await convertToOpus(tempInput, tempOutput);
            const audioSeconds = await getDuration(tempOutput);
            const dummyWaveform = new Uint8Array(64);
            for (let i = 0; i < 64; i++) dummyWaveform[i] = Math.floor(Math.random() * 80) + 20;

            await sock.sendMessage(jid, {
              audio: fs.readFileSync(tempOutput),
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

        // සාර්ථකව ගිය පසු Success Reaction එකක් දැමීම
        return await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
      }

      // ==========================================
      // 2. .SONG ගැසූ විට REACT වී කෙළින්ම CARD එක යැවීම
      // ==========================================
      const query = args.join(' ').trim();
      if (!query) {
        return reply('⚠️ *Usage:* `.song <Song Name>`\n*Example:* `.song Lelena`');
      }

      // User ගේ .song කමාන්ඩ් මැසේජ් එකට React දැමීම (කිසිම text මැසේජ් එකක් නොයයි)
      await sock.sendMessage(jid, { react: { text: '🎵', key: msg.key } });

      let targetYoutubeUrl = query;
      let searchedTitle = query;
      let searchedThumbnail = '';
      let searchedDuration = '03:45';
      let searchedAuthor = 'Unknown Artist';

      const isYoutubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(query);
      if (!isYoutubeUrl) {
        const searchResult = await yts(query);
        if (!searchResult?.videos?.length) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          return reply('❌ *Song not found on YouTube.*');
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
      console.error('Song Error:', error);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    }
  }
};
