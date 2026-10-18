const googleTTS = require('google-tts-api');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// WhatsApp Standard Opus Voice Note බවට convert කිරීම
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

module.exports = {
  name: 'tts',
  alias: ['sinhala', 'say', 'speak'],
  desc: '100% Clear Sinhala Natural Voice Note',
  category: 'ai',
  run: async ({ sock, msg, jid, args }) => {
    const tempDir = os.tmpdir();
    const tempInputFile = path.join(tempDir, `sin_raw_${Date.now()}.mp3`);
    const tempOutputFile = path.join(tempDir, `sin_vn_${Date.now()}.ogg`);

    try {
      const fullText = args.join(' ').trim();
      const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

      const textToSpeak = fullText || quotedText;

      if (!textToSpeak) {
        return await sock.sendMessage(jid, { 
          text: `⚠️ *භාවිතා කරන ආකාරය:*\n\n\`.tts <ඔයාට සිංහලෙන් කියන්න ඕන දේ>\`\n\n*උදාහරණ:*\n• \`.tts මචං මොකද කරන්නේ කොහෙද යන්නේ\`\n• \`.tts ඔයාට සුබ දවසක් වේවා\`\n*(හෝ ඕනෑම text එකකට reply කර \`.tts\` ගසන්න)*` 
        }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '🎙️', key: msg.key } });

      // 1. Google Sinhala Engine එකෙන් Direct Audio URL එක ගැනීම (Language: 'si')
      const audioUrl = googleTTS.getAudioUrl(textToSpeak, {
        lang: 'si',
        slow: false,
        host: 'https://translate.google.com',
        timeout: 20000,
      });

      // 2. Audio එක download කර තාවකාලික ගොනුවක තැබීම
      const response = await axios({
        method: 'GET',
        url: audioUrl,
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });

      fs.writeFileSync(tempInputFile, Buffer.from(response.data));

      // 3. WhatsApp Opus Voice Note බවට Convert කිරීම
      await convertToOpus(tempInputFile, tempOutputFile);
      const audioBuffer = fs.readFileSync(tempOutputFile);

      // 4. Waveform Bars සකස් කිරීම
      const dummyWaveform = new Uint8Array(64);
      for (let i = 0; i < 64; i++) {
        dummyWaveform[i] = Math.floor(Math.random() * 80) + 20;
      }

      // 5. WhatsApp එකට Playable Voice Note එකක් ලෙස යැවීම
      await sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        waveform: dummyWaveform
      }, { quoted: msg });

    } catch (error) {
      console.error('Sinhala TTS Error:', error);
      await sock.sendMessage(jid, { text: `❌ දෝෂයක් සිදු විය: ${error.message}` }, { quoted: msg });
    } finally {
      if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
      if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
    }
  }
};
