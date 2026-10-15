const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('./config');

const API_KEY = config.OPENROUTER_API_KEY;

async function streamToBuffer(stream) {
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

// 1. Actions
async function actionChangeDP(sock, msg, quotedMsg) {
    try {
        const imgMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
        if (!imgMessage) return "අනේ බොස්, මට photo එකක් හම්බුනේ නෑ. Photo එකක් එක්ක කියන්න මම දාන්නම්! 🖼️";

        const stream = await downloadContentFromMessage(imgMessage, 'image');
        const buffer = await streamToBuffer(stream);
        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sock.updateProfilePicture(myJid, buffer);
        return "ඔබගේ අණ පරිදි WhatsApp DP එක සාර්ථකව වෙනස් කළා බොස්! ✨";
    } catch (e) {
        return "DP එක මාරු කරන්න බැරි වුණා බොස්.";
    }
}

async function actionMakeSticker(sock, jid, msg, quotedMsg) {
    try {
        const imgMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
        if (!imgMessage) return "Sticker එකක් හදන්න photo එකකට reply කරන්න බොස්! 🎨";

        const stream = await downloadContentFromMessage(imgMessage, 'image');
        const buffer = await streamToBuffer(stream);
        await sock.sendMessage(jid, { sticker: buffer });
        return null;
    } catch (e) {
        return "Sticker එක හදන්න පොඩි අවුලක් ආවා බොස්.";
    }
}

async function actionSaveMedia(sock, jid, quotedMsg) {
    try {
        if (!quotedMsg) return "මට download කරන්න media එකක් quote කරලා නෑ බොස්.";
        const img = quotedMsg.imageMessage;
        const vid = quotedMsg.videoMessage;

        if (img) {
            const stream = await downloadContentFromMessage(img, 'image');
            const buffer = await streamToBuffer(stream);
            await sock.sendMessage(jid, { image: buffer, caption: "Saved Photo 📥✨" });
            return null;
        } else if (vid) {
            const stream = await downloadContentFromMessage(vid, 'video');
            const buffer = await streamToBuffer(stream);
            await sock.sendMessage(jid, { video: buffer, caption: "Saved Video 📥✨" });
            return null;
        }
        return "මේක image එකක් හෝ video එකක් නෙවෙයි බොස්.";
    } catch (e) {
        return "Media එක download කරගන්න බැරි වුණා බොස්.";
    }
}

// 2. High-Speed Loyal Brain
async function processDinuRequest(sock, jid, msg, quotedMsg, promptText, latency) {
    const low = promptText.toLowerCase();

    // Fast Speed Check
    if (low.includes('ping') || low.includes('speed') || low.includes('ස්පීඩ්')) {
        return `\`\`\`Dinu Ultra Speed: ${latency}ms ⚡\`\`\`\nමම සූදානම් බොස්! ඕනෑම දෙයක් කියන්න.`;
    }

    // Direct Media Handling
    const hasImage = Boolean(msg.message?.imageMessage || quotedMsg?.imageMessage);
    if ((low.includes('dp') || low.includes('photo') || low.includes('පොටෝ')) && hasImage) {
        return await actionChangeDP(sock, msg, quotedMsg);
    }
    if ((low.includes('sticker') || low.includes('ස්ටිකර්')) && hasImage) {
        return await actionMakeSticker(sock, jid, msg, quotedMsg);
    }
    if ((low.includes('save') || low.includes('බාගන්න')) && quotedMsg) {
        return await actionSaveMedia(sock, jid, quotedMsg);
    }

    // STRICT OWNER SUBMISSIVE & SHORT PROMPT
    const systemPrompt = `You are 'Dinu' (දිනූ), an ultra-loyal, completely obedient, humble and witty personal WhatsApp AI assistant.
- MASTER: The user who is messaging you is your OWNER / BOSS (බොස් / මචං).
- ATTITUDE: You are 100% loyal and submissive to your Boss. You always respect, agree, obey, and assist your Boss with pleasure.
- LENGTH RULE: Keep replies VERY SHORT, punchy, crisp, and direct (Maximum 1 to 2 short sentences!). Never write long paragraphs!
- LANGUAGE: Natural friendly Sinhala or Singlish.
- Examples:
  * "මොකද කරන්නෙ dinu" -> "ඔබතුමාගේ අණක් ලැබෙනකම් බලාගෙන ඉන්නවා බොස්! මොකක්ද වෙන්න ඕන? 🫡"
  * "කාලද dinu" -> "මම AI එකක්නේ බොස්, ඔයාගේ commands වලින් තමයි මගේ බඩ පිරෙන්නේ. ඔයා කෑවද? 😊"
  * "දිනූ ඔයා කවුද" -> "මම ඔබේ විශ්වාසවන්ත, පුද්ගලික AI සහායක දිනූ බොස්! ⚡"`;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: promptText }
                ],
                temperature: 0.7,
                max_tokens: 80 // කෙටි ක්ෂණික රිප්ලයි සඳහා සීමා කිරීම
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'HTTP-Referer': 'https://github.com',
                    'Content-Type': 'application/json'
                },
                timeout: 7000 // වේගවත් Timeout
            }
        );

        let aiText = response.data?.choices?.[0]?.message?.content?.trim();
        if (aiText) return aiText;

    } catch (err) {
        console.error('AI Speed Error:', err.message);
    }

    // Loyal Local Instant Fallbacks
    if (low.includes('කවුද')) return "මම ඔබේ විශ්වාසවන්ත පුද්ගලික සහායක දිනූ බොස්! 🫡⚡";
    if (low.includes('කෑවද')) return "මම AI එකක්නේ බොස්, ඔයා කෑවද? 😊";
    if (low.includes('මොකද කරන්නෙ')) return "ඔබගේ අණක් බලාපොරොත්තුවෙන් සූදානමින් ඉන්නවා බොස්! කියන්න මොකක්ද වෙන්න ඕන? 🫡";

    return "ඔව් බොස්, මම ඔබේ අණට සූදානම්! කියන්න මොකක්ද වෙන්න ඕන? 🫡";
}

module.exports = { processDinuRequest };
