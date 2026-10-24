const axios = require('axios');
const yts = require('yt-search');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Default WhatsApp Channel Link
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbAAjtcC1FuCIiYc8z3T';

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
 * Chamindu YouTube Download Link Resolver
 */
async function fetchYouTubeDownload(targetYoutubeUrl) {
  // Method 1: YouTube Download API (MP3 Audio direct)
  try {
    const directUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(targetYoutubeUrl)}&quality=128k&format=mp3&api_key=${CHAMA_API_KEY}`;
    const { data: res } = await axios.get(directUrl, { timeout: 45000 });
    const dl = res?.download_url || res?.data?.download_url || res?.result?.download_url;
    if (dl) {
      return {
        downloadUrl: dl,
        title: res?.title || res?.data?.title || '',
        thumbnail: res?.thumbnail || res?.data?.thumbnail || ''
      };
    }
  } catch (err) {
    console.warn('Direct MP3 fetch failed, trying MP4 format...');
  }

  // Method 2: MP4 format fallback
  try {
    const videoUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(targetYoutubeUrl)}&quality=360p&format=mp4&api_key=${CHAMA_API_KEY}`;
    const { data: res2 } = await axios.get(videoUrl, { timeout: 45000 });
    const dl2 = res2?.download_url || res2?.data?.download_url || res2?.result?.download_url;
    if (dl2) {
      return {
        downloadUrl: dl2,
        title: res2?.title || res2?.data?.title || '',
        thumbnail: res2?.thumbnail || res2?.data?.thumbnail || ''
      };
    }
  } catch (e) {
    console.error('YouTube API Error:', e.message);
  }

  return null;
}

module.exports = {
  name: 'csong',
  alias: ['channelsong', 'cs'],
  desc: 'Send YouTube song as card, voice note, and document to a channel',
  category: 'music',
  run: async ({ sock, msg, jid, args }) => {
    const fullText = args.join(' ').trim();
    const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                       msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

    const input = fullText || quotedText;

    if (!input) {
      return await sock.sendMessage(jid, { 
        text: `⚠️ *How to use:*\n\n` +
              `1️⃣ *Default Channel:* \`.csong <Song Name or YouTube Link>\`\n` +
              `2️⃣ *Custom Channel:* \`.csong <Channel Link>, <Song Name or YouTube Link>\`` 
      }, { quoted: msg });
    }

    let channelInput = DEFAULT_CHANNEL;
    let songQuery = input;

    if (input.includes(',')) {
      const parts = input.split(',');
      channelInput = parts[0].trim();
      songQuery = parts.slice(1).join(',').trim();
    }

    await sock.sendMessage(jid, { text: '⏳ *HESHAN OFC:* Processing song card, voice note & document for channel...' }, { quoted: msg });

    const tempDir = os.tmpdir();
    const tempInputFile = path.join(tempDir, `raw_${Date.now()}.bin`);
    const tempOutputFile = path.join(tempDir, `vn_${Date.now()}.ogg`);

    try {
      const targetChannelJid = await resolveChannelJid(sock, channelInput);

      let targetYoutubeUrl = songQuery;
      let searchedTitle = songQuery;
      let searchedThumbnail = '';
      let searchedDuration = '03:45';

      const isYoutubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(songQuery);
      
      if (!isYoutubeUrl) {
        const searchResult = await yts(songQuery);
        if (!searchResult?.videos?.length) {
          return await sock.sendMessage(jid, { text: '❌ Song not found on YouTube.' }, { quoted: msg });
        }
        const video = searchResult.videos[0];
        targetYoutubeUrl = video.url;
        searchedTitle = video.title;
        searchedThumbnail = video.thumbnail;
        searchedDuration = video.timestamp || '03:45';
      }

      // API හරහා download link ලබා ගැනීම
      const ytData = await fetchYouTubeDownload(targetYoutubeUrl);

      if (!ytData?.downloadUrl) {
        return await sock.sendMessage(jid, { text: '❌ Failed to fetch valid download link from YouTube API.' }, { quoted: msg });
      }

      const finalTitle = ytData.title || searchedTitle;
      const finalThumbnail = ytData.thumbnail || searchedThumbnail;

      // 1. Send Song Card Image
      const songCardCaption = 
`> *🎵⃝✨ H E S H A N   O F C   M U S I C* 

*❖ ᴛɪᴛʟᴇ :* ${finalTitle}

01:23 ───🔘──────── ${searchedDuration}
⇄     ◁   ❚❚   ▷     ↻

\`\`\`➥ Don't forget to enjoy the song and leave a reaction! 🥰🎶\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ꜱᴏɴɢ ʜᴜʙ*`;

      if (finalThumbnail) {
        await sock.sendMessage(targetChannelJid, {
          image: { url: finalThumbnail },
          caption: songCardCaption
        });
      }

      // 2. Download Media Buffer
      const fileResponse = await axios({
        url: ytData.downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': '*/*'
        }
      });

      const mediaBuffer = Buffer.from(fileResponse.data);

      // Buffer එක වලංගු ගොනුවක් දැයි පරීක්ෂා කිරීම (HTML/Error string වැළැක්වීමට)
      if (mediaBuffer.length < 10000) {
        return await sock.sendMessage(jid, { text: '❌ The downloaded file was corrupt or incomplete. Please try again.' }, { quoted: msg });
      }

      fs.writeFileSync(tempInputFile, mediaBuffer);

      // 3. Convert to WhatsApp Opus PTT
      await convertToOpus(tempInputFile, tempOutputFile);
      const audioSeconds = await getDuration(tempOutputFile);

      // Waveform
      const dummyWaveform = new Uint8Array(64);
      for (let i = 0; i < 64; i++) {
        dummyWaveform[i] = Math.floor(Math.random() * 80) + 20;
      }

      const opusBuffer = fs.readFileSync(tempOutputFile);

      // 4. Send Voice Note (PTT)
      await sock.sendMessage(targetChannelJid, {
        audio: opusBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        seconds: audioSeconds,
        waveform: dummyWaveform
      });

      // 5. Send Audio Document
      await sock.sendMessage(targetChannelJid, {
        document: mediaBuffer,
        mimetype: 'audio/mpeg',
        fileName: `${finalTitle.replace(/[\\/:*?"<>|]/g, '')}.mp3`,
        caption: `> *📥 ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴀᴜᴅɪᴏ ꜰɪʟᴇ*`
      });

      await sock.sendMessage(jid, { 
        text: `✅ *Success!* Song card, voice note, and document uploaded to the channel.` 
      }, { quoted: msg });

    } catch (error) {
      console.error('Csong Error:', error);
      await sock.sendMessage(jid, { text: `❌ An error occurred: ${error.message}` }, { quoted: msg });
    } finally {
      if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
      if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
    }
  }
};
