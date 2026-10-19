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

// Audio Duration Helper function
function getDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata?.format?.duration) return resolve(60);
      resolve(Math.round(metadata.format.duration));
    });
  });
}

// 100% WhatsApp Channel PTT Standard Opus conversion
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

module.exports = {
  name: 'csong',
  alias: ['channelsong', 'cs'],
  desc: 'Send YouTube song as card and playable voice note to a channel',
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
              `2️⃣ *Custom Channel:* \`.csong <Channel Link>, <Song Name or YouTube Link>\`\n\n` +
              `*Examples:*\n` +
              `• \`.csong Ma Diha\`\n` +
              `• \`.csong https://whatsapp.com/channel/xxx, Ma Diha\`` 
      }, { quoted: msg });
    }

    let channelInput = DEFAULT_CHANNEL;
    let songQuery = input;

    // Check if custom channel link is provided with comma
    if (input.includes(',')) {
      const parts = input.split(',');
      channelInput = parts[0].trim();
      songQuery = parts.slice(1).join(',').trim();
    }

    await sock.sendMessage(jid, { text: '⏳ *HESHAN OFC:* Processing song card & voice note for channel...' }, { quoted: msg });

    const tempDir = os.tmpdir();
    const tempInputFile = path.join(tempDir, `raw_${Date.now()}.mp4`);
    const tempOutputFile = path.join(tempDir, `vn_${Date.now()}.ogg`);

    try {
      const targetChannelJid = await resolveChannelJid(sock, channelInput);

      let targetYoutubeUrl = songQuery;
      let searchedTitle = songQuery;
      let searchedDuration = '03:45';

      const isYoutubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(songQuery);
      
      if (!isYoutubeUrl) {
        const searchResult = await yts(songQuery);
        if (!searchResult?.videos?.length) {
          return await sock.sendMessage(jid, { text: '❌ Song not found on YouTube.' }, { quoted: msg });
        }
        targetYoutubeUrl = searchResult.videos[0].url;
        searchedTitle = searchResult.videos[0].title;
        searchedDuration = searchResult.videos[0].timestamp || '03:45';
      }

      // API Call
      const apiKey = 'chama_api_ec9848130d1aea209f08fb85e0b4720f';
      const apiUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(targetYoutubeUrl)}&quality=1080p&format=mp4&api_key=${apiKey}`;

      const { data: apiResponse } = await axios.get(apiUrl, { timeout: 60000 });
      const downloadUrl = apiResponse?.download_url || apiResponse?.data?.download_url;
      const title = apiResponse?.title || apiResponse?.data?.title || searchedTitle;
      const thumbnail = apiResponse?.thumbnail || apiResponse?.data?.thumbnail;
      const duration = searchedDuration;

      if (!downloadUrl) {
        return await sock.sendMessage(jid, { text: '❌ Failed to fetch download link from API.' }, { quoted: msg });
      }

      // 1. Send Song Card Image
      const songCardCaption = 
`> *🎵⃝✨ H E S H A N   O F C   M U S I C* 

*❖ ᴛɪᴛʟᴇ :* ${title}

01:23 ───🔘──────── ${duration}
⇄     ◁   ❚❚   ▷     ↻

\`\`\`➥ Don't forget to enjoy the song and leave a reaction! 🥰🎶\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ꜱᴏɴɢ ʜᴜʙ*`;

      await sock.sendMessage(targetChannelJid, {
        image: { url: thumbnail },
        caption: songCardCaption
      });

      // 2. Download Media File
      const fileResponse = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      fs.writeFileSync(tempInputFile, Buffer.from(fileResponse.data));

      // 3. Convert to WhatsApp Opus PTT
      await convertToOpus(tempInputFile, tempOutputFile);

      // 4. Calculate Duration
      const audioSeconds = await getDuration(tempOutputFile);

      // 5. Generate Waveform Bars
      const dummyWaveform = new Uint8Array(64);
      for (let i = 0; i < 64; i++) {
        dummyWaveform[i] = Math.floor(Math.random() * 80) + 20;
      }

      const audioBuffer = fs.readFileSync(tempOutputFile);

      // 6. Send Voice Note to Channel
      await sock.sendMessage(targetChannelJid, {
        audio: audioBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        seconds: audioSeconds,
        waveform: dummyWaveform
      });

      await sock.sendMessage(jid, { 
        text: `✅ *Success!* Song card and voice note have been uploaded to the channel.` 
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
