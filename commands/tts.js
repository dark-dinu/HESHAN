const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// 🔴 ඔයාගේ ElevenLabs API Key එක:
const ELEVEN_API_KEY = 'sk_1f13e8dd2fc5f2b6f868532aa95d1df87ef42bc722c16023';

// ElevenLabs ජනප්‍රියම Voice Models ලැයිස්තුව
const VOICE_LIST = [
  { id: '1', name: 'Adam', voiceId: 'pNInz6obpgDQGcFmaJgB', desc: 'Deep & Natural Male (පිරිමි ගැඹුරු හඬ)' },
  { id: '2', name: 'Rachel', voiceId: '21m00Tcm4TlvDq8ikWAM', desc: 'Calm & Professional Female (කාන්තා සන්සුන් හඬ)' },
  { id: '3', name: 'Nicole', voiceId: 'piTKgcLEGmPE4e6mEKli', desc: 'Soft & Friendly Female (කාන්තා මෘදු හඬ)' },
  { id: '4', name: 'Antoni', voiceId: 'ErXwobaYiN019PkySvjV', desc: 'Energetic Male (පිරිමි තරුණ හඬ)' },
  { id: '5', name: 'Charlotte', voiceId: 'XB0fDUnXU5powFXDhCwa', desc: 'Sweet Character Female (මිහිරි කාන්තා හඬ)' },
  { id: '6', name: 'Arnold', voiceId: 'VR6AewLTigWG4xSOukaG', desc: 'Strong & Crisp Male (පැහැදිලි පිරිමි හඬ)' },
  { id: '7', name: 'Elli', voiceId: 'MF3mGyEYCl7XYWbV9V6O', desc: 'Emotional & Gentle Female (හැඟීම්බර කාන්තා හඬ)' },
  { id: '8', name: 'Josh', voiceId: 'TxGEqnHWrfWFTfGW9XjX', desc: 'Deep American Male (ඇමරිකානු පිරිමි හඬ)' },
  { id: '9', name: 'Bella', voiceId: 'EXAVITQu4vr4xnSDxMaL', desc: 'Cute Female Voice (හුරතල් කාන්තා හඬ)' },
  { id: '10', name: 'Sam', voiceId: 'yoZ06aMxZJJ28mfd3POQ', desc: 'Storyteller / Dynamic Male (කතා කියන පිරිමි හඬ)' }
];

// WhatsApp Standard Opus Voice Note බවට convert කිරීම (Media upload fail නොවීමට)
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
  desc: 'Ultra Realistic ElevenLabs AI Voice Note with numbered selection',
  category: 'ai',
  run: async ({ sock, msg, jid, args }) => {
    const tempDir = os.tmpdir();
    const tempInputFile = path.join(tempDir, `tts_raw_${Date.now()}.mp3`);
    const tempOutputFile = path.join(tempDir, `tts_vn_${Date.now()}.ogg`);

    try {
      const fullText = args.join(' ').trim();
      const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

      const input = fullText || quotedText;

      // Text එකක් නැතිව නිකන්ම .tts ගැහුවම එන ලස්සන Menu එක
      if (!input) {
        let menuText = `> *🎙️⃝✨ H E S H A N   O F C   A I   V O I C E S*\n\n`;
        menuText += `*කරුණාකර ඔබට අවශ්‍ය Voice අංකය (1-10) සහ Text එක ඇතුළත් කරන්න:*\n\n`;

        VOICE_LIST.forEach((v) => {
          menuText += `*${v.id}* - *${v.name}* (${v.desc})\n`;
        });

        menuText += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
        menuText += `*📌 භාවිතා කරන ආකාරය:*\n`;
        menuText += `\`.tts <Voice අංකය> <ඔබට කියවීමට අවශ්‍ය Text එක>\`\n\n`;
        menuText += `*උදාහරණ:*\n`;
        menuText += `• \`.tts 1 මොකද කරන්නේ මචං\`\n`;
        menuText += `• \`.tts 2 Good morning everyone\`\n`;
        menuText += `• \`.tts 9 ඔයාට කොහොමද\`\n`;
        menuText += `*(Text එකකට reply කර අංකය ගැසීමටද හැක)*\n`;
        menuText += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        menuText += `> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴀɪ ꜱᴛᴜᴅɪᴏ*`;

        return await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

      // Voice එක තෝරා ගැනීම (අංකයෙන් හෝ නමෙන්)
      const parts = input.split(/\s+/);
      const firstArg = parts[0].toLowerCase();
      let selectedVoice = VOICE_LIST[0]; // Default: 1 - Adam
      let textToSpeak = input;

      const foundVoice = VOICE_LIST.find(
        (v) => v.id === firstArg || v.name.toLowerCase() === firstArg
      );

      if (foundVoice) {
        selectedVoice = foundVoice;
        textToSpeak = parts.slice(1).join(' ').trim();
      }

      // අංකය පමණක් ගසා reply කර තිබුණොත්:
      if (!textToSpeak && quotedText) {
        textToSpeak = quotedText;
      }

      if (!textToSpeak) {
        return await sock.sendMessage(jid, { 
          text: `❌ කරුණාකර කතා කිරීමට අවශ්‍ය text එක ලබා දෙන්න.\n\n*උදාහරණය:* \`.tts ${selectedVoice.id} මොකද කරන්නේ\`` 
        }, { quoted: msg });
      }

      // ElevenLabs Multilingual v2 API Call (Real Human Quality)
      const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice.voiceId}`;
      
      const response = await axios({
        method: 'POST',
        url: elevenUrl,
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': ELEVEN_API_KEY,
          'Content-Type': 'application/json'
        },
        data: {
          text: textToSpeak,
          model_id: 'eleven_multilingual_v2', // සිංහල සහ ඉංග්‍රීසි වඩාත්ම natural ලෙස කියවන model එක
          voice_settings: {
            stability: 0.45,       // ස්වභාවික හැඟීම් සහිත උච්චාරණයකට
            similarity_boost: 0.85,
            style: 0.2,
            use_speaker_boost: true
          }
        },
        responseType: 'arraybuffer',
        timeout: 60000
      });

      fs.writeFileSync(tempInputFile, Buffer.from(response.data));

      // WhatsApp Standard Opus Voice Note බවට පරිවර්තනය
      await convertToOpus(tempInputFile, tempOutputFile);

      const audioBuffer = fs.readFileSync(tempOutputFile);

      // Waveform bars සකස් කිරීම
      const dummyWaveform = new Uint8Array(64);
      for (let i = 0; i < 64; i++) {
        dummyWaveform[i] = Math.floor(Math.random() * 80) + 20;
      }

      // 100% WhatsApp Voice Note එකක් (PTT) විදිහට යැවීම
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
        text: `❌ දෝෂයක් සිදු විය: ${error?.response?.status === 401 ? 'API Key එක අවලංගුයි හෝ limit ඉවරයි.' : error.message}` 
      }, { quoted: msg });
    } finally {
      if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
      if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
    }
  }
};
