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
        return "Sticker එක හදන්න බැරි වුණා බොස්.";
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

// 2. Multi-Model AI Engine
async function processDinuRequest(sock, jid, msg, quotedMsg, promptText, latency) {
    const low = promptText.toLowerCase();

    // Fast Hardware / Ping Check
    if (low.includes('ping') || low.includes('speed') || low.includes('ස්පීඩ්')) {
        return `\`\`\`Dinu Ultra Speed: ${latency}ms ⚡\`\`\`\nමම online ඉන්නේ බොස්, කියන්න මොනවද වෙන්න ඕනේ?`;
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

    // Dynamic Persona System Prompt
    const systemPrompt = `You are 'Dinu' (දිනූ), an ultra-loyal, completely obedient, humble, witty and caring personal WhatsApp AI assistant.
- OWNER: The person talking to you is your BOSS / MASTER (බොස්).
- BEHAVIOR:
  * Always address him respectfully as 'බොස්' (Boss).
  * Answer the EXACT topic asked. NEVER give repetitive or pre-defined canned answers!
  * If asked what you are doing, explain creatively that you are monitoring the system and awaiting commands.
  * If asked if you ate, reply humorously about eating electricity/data and ask him if he ate.
  * Keep replies SHORT (1-2 sentences), lively, friendly, with 1-2 nice emojis.
  * Language: Natural conversational Sinhala or Singlish.`;

    // Try reliable free models in order
    const modelsToTry = [
        'deepseek/deepseek-chat',
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free'
    ];

    for (const modelName of modelsToTry) {
        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: promptText }
                    ],
                    temperature: 0.7,
                    max_tokens: 100
                },
                {
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'HTTP-Referer': 'https://render.com',
                        'Content-Type': 'application/json'
                    },
                    timeout: 7000
                }
            );

            const aiReply = response.data?.choices?.[0]?.message?.content?.trim();
            if (aiReply) {
                return aiReply;
            }
        } catch (err) {
            console.error(`Model ${modelName} failed:`, err.message);
            // Continue to next model
        }
    }

    // Dynamic Context-Aware Fallback (Only if ALL models fail)
    if (low.includes('කවුද')) return "මම ඔබතුමාගේ පුද්ගලික AI සහායක දිනූ බොස්! ඕනෑම වැඩකට මම සූදානම්. ⚡🤖";
    if (low.includes('කෑවද') || low.includes('කාලද')) return "මම AI එකක්නේ බොස්, ඔයාගේ commands වලින් තමයි මගේ බඩ පිරෙන්නේ 😂 ඔයා කෑවද?";
    if (low.includes('මොකද කරන්නෙ') || low.includes('මොකද වෙන්නෙ')) return "ඔබතුමාගේ අණක් ලැබෙනකම් සිස්ටම් එක බලාගෙන ඉන්නවා බොස්! මොකක්ද අද වෙන්න ඕනේ? ✨";

    return `ඔව් බොස්, "${promptText.replace(/dinu|දිනූ|දිනු/gi, '').trim()}" ගැන මොකක්ද මම කරලා දෙන්න ඕන? 🫡`;
}

module.exports = { processDinuRequest };
