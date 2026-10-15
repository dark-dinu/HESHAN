const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const API_KEY = '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';

async function streamToBuffer(stream) {
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

// DP Change
async function actionChangeDP(sock, msg, quotedMsg) {
    try {
        const imgMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
        if (!imgMessage) return "මට photo එකක් හම්බුනේ නෑ මචං. Photo එකක් එක්ක කියන්න.";

        const stream = await downloadContentFromMessage(imgMessage, 'image');
        const buffer = await streamToBuffer(stream);
        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sock.updateProfilePicture(myJid, buffer);
        return "ඔයාගේ WhatsApp DP එක මම සාර්ථකව වෙනස් කළා මචං! ✔️";
    } catch (e) {
        return "DP එක මාරු කරන්න බැරි වුණා.";
    }
}

// Sticker Make
async function actionMakeSticker(sock, jid, msg, quotedMsg) {
    try {
        const imgMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
        if (!imgMessage) return "Sticker එකක් හදන්න photo එකක් mention කරලා කියන්න මචං! 🎨";

        const stream = await downloadContentFromMessage(imgMessage, 'image');
        const buffer = await streamToBuffer(stream);
        await sock.sendMessage(jid, { sticker: buffer });
        return null;
    } catch (e) {
        return "Sticker එක හදද්දී පොඩි error එකක් ආවා මචං.";
    }
}

// Save Media
async function actionSaveMedia(sock, jid, quotedMsg) {
    try {
        if (!quotedMsg) return "මට save කරන්න media එකක් quote කරලා නෑ මචං.";
        const img = quotedMsg.imageMessage;
        const vid = quotedMsg.videoMessage;

        if (img) {
            const stream = await downloadContentFromMessage(img, 'image');
            const buffer = await streamToBuffer(stream);
            await sock.sendMessage(jid, { image: buffer, caption: "Saved Photo 📥" });
            return null;
        } else if (vid) {
            const stream = await downloadContentFromMessage(vid, 'video');
            const buffer = await streamToBuffer(stream);
            await sock.sendMessage(jid, { video: buffer, caption: "Saved Video 📥" });
            return null;
        }
        return "මේක image එකක් හෝ video එකක් නෙවෙයි.";
    } catch (e) {
        return "Media එක download කරගන්න බැරි වුණා.";
    }
}

// Process AI
async function processDinuRequest(sock, jid, msg, quotedMsg, promptText, latency) {
    const low = promptText.toLowerCase();

    // Fast Keywords
    if (low.includes('ping') || low.includes('speed') || low.includes('ස්පීඩ්')) {
        return `\`\`\`Dinu Speed: ${latency}ms 🚀\`\`\`\nමම active එකේ ඉන්නේ මචං, කියන්න මොනවද වෙන්න ඕනේ?`;
    }
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

    const systemPrompt = `You are 'Dinu' (දිනූ), the ultra-smart, loyal, friendly personal WhatsApp AI assistant of the bot owner.
- Identity: Dinu (දිනූ).
- Personality: Speak naturally like a close Sri Lankan best friend (මචං, මම ඉන්නවා, etc.).
- Language: Friendly Sinhala or Singlish.
- Tone: Never sound robotic. Never output markdown code blocks unless asked. Direct friendly reply.`;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: promptText }
                ],
                temperature: 0.7,
                max_tokens: 300
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'HTTP-Referer': 'https://render.com',
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        return response.data?.choices?.[0]?.message?.content?.trim() || "ඔව් මචං, මම අහගෙන ඉන්නේ! මොකක්ද වෙන්න ඕනේ?";

    } catch (err) {
        console.error('OpenRouter Direct Call Error:', err.response?.data || err.message);

        // Fallback Response
        if (low.includes('කාලද')) return "මම AI එකක්නේ මචං, මට කෑම ඕන නෑ 😂 ඔයා කෑවද?";
        if (low.includes('මොකද කරන්නෙ')) return "නිකන් ඉන්නවා මචං ඔයාට උදව්වක් දෙන්න බලාගෙන! කියන්න මොනවද වෙන්න ඕනේ?";
        return "ඔව් මචං, මම online ඉන්නේ! කියන්න මොකක්ද කරලා දෙන්න ඕන?";
    }
}

module.exports = { processDinuRequest };
