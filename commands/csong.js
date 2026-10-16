const axios = require('axios');
const yts = require('yt-search');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

// FFmpeg binary path සකස් කිරීම
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * ඕනෑම Audio එකක් 100% WhatsApp Voice Note (PTT Opus) බවට convert කරන function එක
 */
function convertToOpus(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('ogg')
      .audioCodec('libopus')
      .audioChannels(1)
      .audioFrequency(48000)
      .outputOptions([
        '-avoid_negative_ts make_zero',
        '-map_metadata -1'
      ])
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}

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
      const meta = await sock.newsletterMetadata('invite', inviteCode);
      return meta?.id || `${inviteCode}@newsletter`;
    }
    return `${inviteCode}@newsletter`;
  }
  return input;
}

module.exports = {
  name: 'csong',
  alias: ['channelsong', 'cs'],
  desc: 'Send YouTube song as card & voice note to a channel',
  category: 'music',
  run: async ({ sock, msg, jid, args }) => {
    // Input format: .csong <channel_link>, <song_name හෝ youtube_link>
    const fullText = args.join(' ');
    const parts = fullText.split(',');

    if (parts.length < 2) {
      return await sock.sendMessage(jid, { 
        text: `⚠️ *භාවිතා කරන ආකාරය:*\n\n.csong <Channel Link>, <Song Name හෝ YouTube Link>\n\n*උදාහරණ:*\n.csong https://whatsapp.com/channel/xxx, Neth Manema\n.csong https://whatsapp.com/channel/xxx, https://youtu.be/xxx` 
      }, { quoted: msg });
    }

    const channelInput = parts[0].trim();
    const songQuery = parts.slice(1).join(',').trim();

    await sock.sendMessage(jid, { text: '⏳ *HESHAN OFC:* සින්දුව සකසමින් පවතී, කරුණාකර රැඳී සිටින්න...' }, { quoted: msg });

    const tempDir = os.tmpdir();
    const tempInputFile = path.join(tempDir, `input_${Date.now()}.mp3`);
    const tempOutputFile = path.join(tempDir, `vn_${Date.now()}.opus`);

    try {
      // 1. Channel JID එක ලබා ගැනීම
      const targetChannelJid = await resolveChannelJid(sock, channelInput);

      // 2. YouTube Link එකක්ද නැතහොත් Search Query එකක්ද යන්න හඳුනා ගැනීම
      let targetYoutubeUrl = songQuery;
      let searchedTitle = songQuery;

      const isYoutubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(songQuery);
      if (!isYoutubeUrl) {
        const searchResult = await yts(songQuery);
        if (!searchResult?.videos?.length) {
          return await sock.sendMessage(jid, { text: '❌ ඔබ සෙවූ ගීතය YouTube වෙතින් හමු නොවීය.' }, { quoted: msg });
        }
        targetYoutubeUrl = searchResult.videos[0].url;
        searchedTitle = searchResult.videos[0].title;
      }

      // 3. Chamindu API එකෙන් Download link එක ලබා ගැනීම
      const apiKey = 'chama_api_ec9848130d1aea209f08fb85e0b4720f';
      const apiUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(targetYoutubeUrl)}&quality=1080p&format=mp4&api_key=${apiKey}`;

      const { data: apiResponse } = await axios.get(apiUrl, { timeout: 45000 });

      if (!apiResponse?.status || !apiResponse?.download_url) {
        return await sock.sendMessage(jid, { text: '❌ API එක මගින් Download Link එක ලබා ගැනීමට නොහැකි විය.' }, { quoted: msg });
      }

      const songData = apiResponse;
      const downloadUrl = songData.download_url;
      const title = songData.title || searchedTitle;
      const thumbnail = songData.thumbnail;

      // 4. Channel එකට Song Card Image එක යැවීම
      const songCardCaption = 
`🎵 *H E S H A N   O F C   M U S I C* 🎵
━━━━━━━━━━━━━━━━━━━━━━
🎧 *Title:* ${title}
⚡ *Platform:* YouTube Music
📡 *Sent By:* HESHAN-OFC BOT
━━━━━━━━━━━━━━━━━━━━━━
> 🎧 Play the voice note below to listen!`;

      await sock.sendMessage(targetChannelJid, {
        image: { url: thumbnail },
        caption: songCardCaption
      });

      // 5. Audio එක download කර තාවකාලික ගොනුවකට ලිවීම
      const audioStreamResponse = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream'
      });

      const writeStream = fs.createWriteStream(tempInputFile);
      audioStreamResponse.data.pipe(writeStream);

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // 6. Voice note (Opus) බවට පරිවර්තනය කිරීම
      await convertToOpus(tempInputFile, tempOutputFile);
      const voiceBuffer = fs.readFileSync(tempOutputFile);

      // 7. Channel එකට 100% Play වන Voice Note එක යැවීම
      await sock.sendMessage(targetChannelJid, {
        audio: voiceBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
      });

      // User හට සාර්ථක පණිවිඩය ලබා දීම
      await sock.sendMessage(jid, { 
        text: `✅ *සාර්ථකයි!*\n\n"${title}" ගීත කාඩ්පත සහ Voice Note එක Channel එකට සාර්ථකව යවන ලදී!` 
      }, { quoted: msg });

    } catch (error) {
      console.error('Error in csong command:', error);
      await sock.sendMessage(jid, { text: `❌ දෝෂයක් සිදු විය: ${error.message || error}` }, { quoted: msg });
    } finally {
      // Temp files ඉවත් කිරීම
      if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
      if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
    }
  }
};
