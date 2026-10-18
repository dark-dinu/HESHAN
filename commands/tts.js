const axios = require('axios');
const translate = require('@vitalets/google-translate-api');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// 🔴 ඔයාගේ ElevenLabs API Key එක:
const ELEVEN_API_KEY = 'sk_1f13e8dd2fc5f2b6f868532aa95d1df87ef42bc722c16023';

// ElevenLabs Voice IDs
const VOICES = {
  adam: 'pNInz6obpgDQGcFmaJgB',      // Male Voice (Default)
  rachel: '21m00Tcm4TlvDq8ikWAM',    // Calm Female Voice
  nicole: 'piTKgcLEGmPE4e6mEKli',    // Soft Female Voice
  antoni: 'ErXwobaYiN019PkySvjV',    // Friendly Male Voice
  charlotte: 'XB0fDUnXU5powFXDhCwa'  // British Female Voice
};

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
  alias: ['speak', 'say', 'eleven'],
  desc: 'Text to speech using ElevenLabs with translation support',
  category: 'ai',
  run: async ({ sock, msg, jid, args }) => {
    const tempDir = os.tmpdir();
    const tempInputFile = path.join(tempDir, `tts_raw_${Date.now()}.mp3`);
    const tempOutputFile = path.join(tempDir, `tts_vn_${Date.now()}.ogg`);

    try {
      const fullText = args.join(' ').trim();
      const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

      const inputText = fullText || quotedText;

      if (!inputText) {
        return await sock.sendMessage(jid, { 
          text: `⚠️ *භාවිතා කරන ආකාරය:*\n\n` +
                `1️⃣ *සාමාන්‍ය TTS:* \`.tts Hello how are you\`\n` +
                `2️⃣ *Voice තෝරා ගැනීම:* \`.tts rachel Hello there\`\n` +
                `*(Voices: adam, rachel, nicole, antoni, charlotte)*\n\n` +
                `3️⃣ *Google Translate කර Voice ගැනීම:* \`.tts --en මොකද කරන්නේ\`\n` +
                `*(ඕනෑම භාෂාවකින් translate කර voice note ලබා දේ)*`
        }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

      let selectedVoice = VOICES.adam;
      let textToConvert = inputText;

      // 1. Google Translate Flag පරීක්ෂාව
      const langMatch = textToConvert.match(/^--([a-z]{2})\s+(.+)/i);
      if (langMatch) {
        const targetLang = langMatch[1].toLowerCase();
        const rawContent = langMatch[2].trim();
        
        try {
          const res = await translate(rawContent, { to: targetLang });
          textToConvert = res.text;
        } catch (e) {
          console.error('Translation Error:', e);
        }
      }

      // 2. Custom Voice පරීක්ෂාව
      const firstWord = textToConvert.split(/\s+/)[0].toLowerCase();
      if (VOICES[firstWord]) {
        selectedVoice = VOICES[firstWord];
        textToConvert = textToConvert.slice(firstWord.length).trim();
      }

      if (!textToConvert) {
        return await sock.sendMessage(jid, { text: '❌ කරුණාකර වචන ඇතුළත් කරන්න.' }, { quoted: msg });
      }

      // 3. ElevenLabs API Call
      const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`;
      
      const response = await axios({
        method: 'POST',
        url: elevenUrl,
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': ELEVEN_API_KEY,
          'Content-Type': 'application/json'
        },
        data: {
          text: textToConvert,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        },
        responseType: 'arraybuffer',
        timeout: 60000
      });

      // Local MP3 file එකකට save කිරීම
      fs.writeFileSync(tempInputFile, Buffer.from(response.data));

      // WhatsApp Standard Opus Voice Note බවට convert කිරීම
      await convertToOpus(tempInputFile, tempOutputFile);

      const audioBuffer = fs.readFileSync(tempOutputFile);

      // Waveform bars සකස් කිරීම
      const dummyWaveform = new Uint8Array(64);
      for (let i = 0; i < 64; i++) {
        dummyWaveform[i] = Math.floor(Math.random() * 80) + 20;
      }

      // 4. WhatsApp වෙත Voice Note එකක් (PTT) ලෙස යැවීම
      await sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        waveform: dummyWaveform
      }, { quoted: msg });

      await sock.sendMessage(jid, { react: { text: '🎙️', key: msg.key } });

    } catch (error) {
      console.error('ElevenLabs TTS Error:', error?.response?.data ? error.response.data.toString() : error.message);
      await sock.sendMessage(jid, { 
        text: `❌ දෝෂයක්: ${error?.response?.status === 401 ? 'API Key එක වැරදියි හෝ Limit ඉවරයි.' : error.message}` 
      }, { quoted: msg });
    } finally {
      // Temp files ඉවත් කිරීම
      if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
      if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
    }
  }
};
