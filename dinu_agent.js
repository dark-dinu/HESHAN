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

// 1. Profile Picture Change Action
async function actionChangeDP(sock, msg, quotedMsg) {
    try {
        const imgMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
        if (!imgMessage) return "මට photo එකක් හම්බුනේ නෑ මචං. Photo එකකට reply කරලා 'Dinu මේක dp දාන්න' කියලා කියන්න. 🖼️";

        const stream = await downloadContentFromMessage(imgMessage, 'image');
        const buffer = await streamToBuffer(stream);
        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sock.updateProfilePicture(myJid, buffer);
        return "ඔන්න මචං ඔයාගේ WhatsApp DP එක මම ලස්සනට වෙනස් කළා! ✨";
    } catch (e) {
        return "DP එක මාරු කරන්න ගිය වෙලාවේ පොඩි අවුලක් ආවා මචං.";
    }
}

// 2. Sticker Maker Action
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

// 3. Save Media Action
async function actionSaveMedia(sock, jid, quotedMsg) {
    try {
        if (!quotedMsg) return "මට save කරන්න media එකක් quote කරලා නෑ මචං.";
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
        return "මේක image එකක් හෝ video එකක් නෙවෙයිනේ මචං.";
    } catch (e) {
        return "Media එක download කරගන්න බැරි වුණා.";
    }
}

// 4. Channel Post Action
async function actionSendChannelPost(sock, msg, quotedMsg, promptText) {
    try {
        const linkMatch = promptText.match(/(?:https:\/\/whatsapp\.com\/channel\/|https:\/\/chat\.whatsapp\.com\/)([a-zA-Z0-9_-]+)/);
        let targetJid = null;

        if (linkMatch) {
            const code = linkMatch[1];
            if (promptText.includes('/channel/')) {
                const metadata = await sock.newsletterMetadata('invite', code);
                targetJid = metadata.id;
            } else {
                const groupMeta = await sock.groupGetInviteInfo(code);
                targetJid = groupMeta.id;
            }
        }

        const rawJidMatch = promptText.match(/[0-9]+@(?:newsletter|g\.us)/);
        if (rawJidMatch) targetJid = rawJidMatch[0];

        if (!targetJid) return "Channel link එකක් හොයාගන්න බැරි වුණා මචං.";

        let contentToSend = {};
        if (quotedMsg) {
            if (quotedMsg.conversation || quotedMsg.extendedTextMessage?.text) {
                contentToSend = { text: quotedMsg.conversation || quotedMsg.extendedTextMessage?.text };
            } else if (quotedMsg.imageMessage) {
                const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
                const buffer = await streamToBuffer(stream);
                contentToSend = { image: buffer, caption: quotedMsg.imageMessage.caption || '' };
            }
        } else {
            const postText = promptText.replace(/dinu|දිනූ|දිනු/gi, '').replace(linkMatch ? linkMatch[0] : '', '').trim();
            contentToSend = { text: postText };
        }

        await sock.sendMessage(targetJid, contentToSend);
        return "ඔයා කියපු පෝස්ට් එක මම Channel එකට දැම්මා මචං! 🚀";
    } catch (e) {
        return "Channel එකට post කරන්න බැරි වුණා.";
    }
}

// 5. Intelligent Multi-Model AI Engine
async function processDinuRequest(sock, jid, msg, quotedMsg, promptText, latency) {
    const low = promptText.toLowerCase();

    // Fast Speed / Ping Check
    if (low.includes('ping') || low.includes('speed') || low.includes('ස්පීඩ්')) {
        return `\`\`\`Dinu Ultra Speed: ${latency}ms ⚡\`\`\`\nමම online ඉන්නේ මචං, කියන්න මොනවද වෙන්න ඕනේ?`;
    }

    // Direct Media Handling
    const hasImage = Boolean(msg.message?.imageMessage || quotedMsg?.imageMessage);
    if ((low.includes('dp') || low.includes('photo') || low.includes('පොටෝ') || low.includes('profile')) && hasImage) {
        return await actionChangeDP(sock, msg, quotedMsg);
    }
    if ((low.includes('sticker') || low.includes('ස්ටිකර්')) && hasImage) {
        return await actionMakeSticker(sock, jid, msg, quotedMsg);
    }
    if ((low.includes('save') || low.includes('බාගන්න')) && quotedMsg) {
        return await actionSaveMedia(sock, jid, quotedMsg);
    }
    if (low.includes('channel') || low.includes('චැනල්')) {
        return await actionSendChannelPost(sock, msg, quotedMsg, promptText);
    }

    // Friendly Sinhala Best-Friend Persona
    const systemPrompt = `You are 'Dinu' (දිනූ), an ultra-smart, loyal, friendly, witty and caring personal WhatsApp AI assistant for your owner.
- Identity: You are Dinu.
- Tone: Speak like a real Sri Lankan close best friend (මචං, මම ඉන්නවා, etc.). Be lively, natural, empathetic, and never sound like a robotic machine.
- Language: Natural conversational Sinhala or Singlish based on the owner's input.
- Instructions:
  * Answer the EXACT question asked by the user intelligently.
  * Never give repetitive answers.
  * Keep replies crisp, engaging, and friendly with emojis.`;

    // Primary: Google Gemini 2.0 Flash
    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: promptText }
                ],
                temperature: 0.8,
                max_tokens: 400
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'HTTP-Referer': 'https://github.com',
                    'Content-Type': 'application/json'
                },
                timeout: 12000
            }
        );

        const aiText = response.data?.choices?.[0]?.message?.content?.trim();
        if (aiText) return aiText;

    } catch (err1) {
        console.error('Gemini call failed, trying DeepSeek...', err1.message);

        // Fallback: DeepSeek Chat
        try {
            const fallbackResponse = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: 'deepseek/deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: promptText }
                    ],
                    temperature: 0.7,
                    max_tokens: 350
                },
                {
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'HTTP-Referer': 'https://github.com',
                        'Content-Type': 'application/json'
                    },
                    timeout: 12000
                }
            );

            const fallbackText = fallbackResponse.data?.choices?.[0]?.message?.content?.trim();
            if (fallbackText) return fallbackText;

        } catch (err2) {
            console.error('DeepSeek call failed too:', err2.message);
        }
    }

    // Dynamic Contextual Fallbacks
    if (low.includes('කවුද')) {
        return "මම ඔයාගේ පෞද්ගලික WhatsApp AI සහායක 'දිනූ' මචං! ඔයාට ඕනෑම වැඩක් කරලා දෙන්න මම මෙතන ඉන්නවා! ⚡🤖";
    }
    if (low.includes('කෑවද') || low.includes('බඩගිනි')) {
        return "මම AI එකක්නේ මචං, මට කෑම ඕන නෑ ඔයාගේ command වලින් තමයි මගේ බඩ පිරෙන්නේ 😂 ඔයා කෑවද?";
    }
    if (low.includes('මොකද කරන්නෙ') || low.includes('මොකද වෙන්නෙ')) {
        return "නිකන් ඉන්නවා මචං ඔයා කතා කරනකම් බලාගෙන! කියන්න අද මොකද වෙන්නේ? ✨";
    }

    return "ඔව් මචං, මම අහගෙන ඉන්නේ! කියන්න මොකක්ද වෙන්න ඕන? ⚡";
}

module.exports = { processDinuRequest };
