const axios = require('axios');
const yts = require('yt-search');

// OpenRouter API Key
const OPENROUTER_API_KEY = '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';

// Active users & Chat Memory store
const activeAiSessions = new Map();

// Triggers
const ON_TRIGGERS = [
  'hey heshan', 'hi heshan', 'හෙලෝ හේෂාන්', 'හායි හේෂාන්', 'heshan'
];

const OFF_TRIGGERS = [
  'bye heshan', 'by heshan', 'bay heshan', 'baye heshan', 'බායි හේෂාන්', 'බයි හේෂාන්'
];

// Chamindu API Key
const CHAMA_API_KEY = 'chama_api_ec9848130d1aea209f08fb85e0b4720f';

/**
 * YouTube Song Downloader Helper
 */
async function downloadAndSendSong(sock, jid, msg, songQuery) {
  try {
    await sock.sendMessage(jid, { react: { text: '🎵', key: msg.key } });
    const searchResult = await yts(songQuery);
    if (!searchResult?.videos?.length) {
      return await sock.sendMessage(jid, { text: '❌ මචං සින්දුව හොයාගන්න බැරි වුණානේ.' }, { quoted: msg });
    }

    const song = searchResult.videos[0];
    const apiUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(song.url)}&quality=1080p&format=mp4&api_key=${CHAMA_API_KEY}`;
    
    const { data: apiResponse } = await axios.get(apiUrl, { timeout: 60000 });
    const downloadUrl = apiResponse?.download_url || apiResponse?.data?.download_url;

    if (!downloadUrl) {
      return await sock.sendMessage(jid, { text: '❌ Download කරගන්න ලින්ක් එක ගන්න බැරි වුණා බං.' }, { quoted: msg });
    }

    await sock.sendMessage(jid, {
      audio: { url: downloadUrl },
      mimetype: 'audio/mp4',
      fileName: `${song.title}.mp3`
    }, { quoted: msg });

  } catch (err) {
    console.error('Song AI Error:', err.message);
    await sock.sendMessage(jid, { text: '❌ සින්දුව ඩවුන්ලෝඩ් කරද්දි පොඩි අවුලක් ආවා බං.' }, { quoted: msg });
  }
}

/**
 * TikTok Downloader Helper
 */
async function downloadAndSendTikTok(sock, jid, msg, tiktokUrl) {
  try {
    await sock.sendMessage(jid, { react: { text: '🎬', key: msg.key } });
    const apiUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(tiktokUrl)}&api_key=${CHAMA_API_KEY}`;
    
    const { data: response } = await axios.get(apiUrl, { timeout: 45000 });
    const videoData = response?.data;
    const downloadUrl = videoData?.downloads?.no_watermark_hd || videoData?.downloads?.no_watermark;

    if (!downloadUrl) {
      return await sock.sendMessage(jid, { text: '❌ වීඩියෝ එක ගන්න බැරි වුණා බං, ලින්ක් එක චෙක් කරලා බලන්න.' }, { quoted: msg });
    }

    await sock.sendMessage(jid, {
      video: { url: downloadUrl },
      caption: `> *${videoData.title || 'TikTok Video'}*\n\n*H E S H A N   O F C*`,
      mimetype: 'video/mp4'
    }, { quoted: msg });

  } catch (err) {
    console.error('TikTok AI Error:', err.message);
    await sock.sendMessage(jid, { text: '❌ TikTok එක ඩවුන්ලෝඩ් කරද්දි error එකක් ආවා බං.' }, { quoted: msg });
  }
}

module.exports = {
  name: 'heshan_ai',
  desc: 'Conversational Smart Human Persona AI',
  category: 'ai',
  handleMessage: async ({ sock, msg, jid, text }) => {
    if (!text) return false;
    const cleanText = text.trim();
    const lower = cleanText.toLowerCase();

    // 1. Session Start Trigger
    const isStart = ON_TRIGGERS.some(trig => lower.startsWith(trig) || lower === trig);
    if (isStart) {
      activeAiSessions.set(jid, [
        {
          role: 'system',
          content: `You are Heshan, a cool, smart, and friendly human-like buddy (Heshan OFC).
- Speak naturally in authentic Sinhala or English, just like a close friend (භාවිතා කරන්න: 'මචං', 'යාලුවා', 'මම හේෂාන්').
- Never sound like a robotic AI. Keep responses warm, engaging, and witty.
- If asked for the current date or time, respond in Sri Lankan time (+05:30).
- If the user wants a song, output strictly in format: [ACTION:SONG:song_name]
- If the user asks to download a TikTok video, output strictly in format: [ACTION:TIKTOK:url]
- Otherwise, reply naturally like a real person.`
        }
      ]);
      await sock.sendMessage(jid, { text: 'හායි මචං! කියපන්, මම හේෂාන්. මොකක්ද වෙන්න ඕනේ? සින්දුවක් ඕනෙද, ටික්ටොක් එකක්ද නැත්නම් කතා කරන්නද? මම ලෑස්තියි! ✨' }, { quoted: msg });
      return true;
    }

    // 2. Session Stop Trigger
    const isStop = OFF_TRIGGERS.some(trig => lower === trig || lower.startsWith(trig));
    if (isStop && activeAiSessions.has(jid)) {
      activeAiSessions.delete(jid);
      await sock.sendMessage(jid, { text: 'එල මචං, මම ගියා එහෙනම්! ඕන වෙලාවක "Hey heshan" කියලා කතා කරපන්. බායි, පරිස්සමෙන් ඉන්න! 🕊️' }, { quoted: msg });
      return true;
    }

    // Active session එකක් නැත්නම් pass කරන්න
    if (!activeAiSessions.has(jid)) return false;

    // 3. සෘජු TikTok Link Detect වීම
    const ttMatch = cleanText.match(/https?:\/\/(?:vt\.|vm\.|www\.)?tiktok\.com\/[^\s]+/i);
    if (ttMatch && (lower.includes('download') || lower.includes('දියන්') || lower.includes('දාපන්') || lower.includes('download karala'))) {
      await downloadAndSendTikTok(sock, jid, msg, ttMatch[0]);
      return true;
    }

    // 4. සෘජු Song Detect වීම (උදා: "mata song ekak diyan", "සින්දුවක් දියන්")
    if (lower.startsWith('song ') || lower.startsWith('සින්දුව ') || lower.startsWith('play ')) {
      const q = cleanText.replace(/^(song|සින්දුව|play)\s+/i, '');
      await downloadAndSendSong(sock, jid, msg, q);
      return true;
    }

    // 5. OpenRouter AI Processing
    try {
      await sock.sendMessage(jid, { react: { text: '💭', key: msg.key } });

      const history = activeAiSessions.get(jid);
      
      // Current Real-time Context Pass කිරීම
      const now = new Date();
      const lkTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true });
      const lkDate = now.toLocaleDateString('en-US', { timeZone: 'Asia/Colombo', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      history.push({
        role: 'user',
        content: `[Current LK Time: ${lkTime}, Date: ${lkDate}]: ${cleanText}`
      });

      // Memory එක දිග වැඩි නොවීමට slice කිරීම
      if (history.length > 10) {
        history.splice(1, 2);
      }

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'deepseek/deepseek-chat',
          messages: history,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 45000
        }
      );

      const aiReply = response.data?.choices?.[0]?.message?.content?.trim();

      if (!aiReply) {
        await sock.sendMessage(jid, { text: 'පොඩි සිග්නල් අවුලක් මචං, ආයේ කියපන්කෝ බලන්න?' }, { quoted: msg });
        return true;
      }

      // Song Action Handle කිරීම
      const songAction = aiReply.match(/\[ACTION:SONG:(.+?)\]/);
      if (songAction) {
        await downloadAndSendSong(sock, jid, msg, songAction[1].trim());
        return true;
      }

      // TikTok Action Handle කිරීම
      const ttAction = aiReply.match(/\[ACTION:TIKTOK:(.+?)\]/);
      if (ttAction) {
        await downloadAndSendTikTok(sock, jid, msg, ttAction[1].trim());
        return true;
      }

      // Normal Conversation Reply
      history.push({ role: 'assistant', content: aiReply });
      await sock.sendMessage(jid, { text: aiReply }, { quoted: msg });
      await sock.sendMessage(jid, { react: { text: '✨', key: msg.key } });
      return true;

    } catch (e) {
      console.error('OpenRouter AI Error:', e.response?.data || e.message);
      await sock.sendMessage(jid, { text: 'මචං මගේ server එකට පොඩි බරක් ආවා, තව ටිකකින් ට්‍රයි කරමුද?' }, { quoted: msg });
      return true;
    }
  }
};
