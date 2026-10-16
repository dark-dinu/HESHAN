const axios = require('axios');
const yts = require('yt-search');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Audio Duration එක ගන්න Helper function එක
function getDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata?.format?.duration) return resolve(60);
      resolve(Math.round(metadata.format.duration));
    });
  });
}

// 100% WhatsApp Channel PTT Standard Opus එකකට convert කිරීම
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
    const fullText = args.join(' ');
    const parts = fullText.split(',');

    if (parts.length < 2) {
      return await sock.sendMessage(jid, { 
        text: `⚠️ *භාවිතා කරන ආකාරය:*\n\n.csong <Channel Link>, <Song Name හෝ YouTube Link>` 
      }, { quoted: msg });
    }

    const channelInput = parts[0].trim();
    const songQuery = parts.slice(1).join(',').trim();

    await sock.sendMessage(jid, { text: '⏳ *HESHAN OFC:* Voice note එක Channel එකට සකසමින් පවතී...' }, { quoted: msg });

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
          return await sock.sendMessage(jid, { text: '❌ ගීතය හමු නොවීය.' }, { quoted: msg });
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
        return await sock.sendMessage(jid, { text: '❌ Download Link එක ලබා ගැනීමට නොහැකි විය.' }, { quoted: msg });
      }

      // 1. Song Card Image එක යැවීම (නව Design එක)
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

      // 2. Audio/Video එක local file එකකට download කරගැනීම
      const fileResponse = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      fs.writeFileSync(tempInputFile, Buffer.from(fileResponse.data));

      // 3. Audio එක Opus (Voice Note) බවට FFmpeg හරහා convert කිරීම
      await convertToOpus(tempInputFile, tempOutputFile);

      // 4. Duration එක ගණනය කරගැනීම
      const audioSeconds = await getDuration(tempOutputFile);

      // 5. Channel එකේ Voice waveform එක පෙන්වීමට අවශ්‍ය fake waveform bytes හැදීම
      const dummyWaveform = new Uint8Array(64);
      for (let i = 0; i < 64; i++) {
        dummyWaveform[i] = Math.floor(Math.random() * 80) + 20;
      }

      const audioBuffer = fs.readFileSync(tempOutputFile);

      // 6. WhatsApp Channel එකට Voice Note එක යැවීම
      await sock.sendMessage(targetChannelJid, {
        audio: audioBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        seconds: audioSeconds,
        waveform: dummyWaveform
      });

      await sock.sendMessage(jid, { text: `✅ *සාර්ථකයි!* Song Card එක සහ Voice note එක Channel එකට යවන ලදී.` }, { quoted: msg });

    } catch (error) {
      console.error('Csong Error:', error);
      await sock.sendMessage(jid, { text: `❌ Voice note එක යැවීමේදී දෝෂයක්: ${error.message}` }, { quoted: msg });
    } finally {
      if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
      if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
    }
  }
};
