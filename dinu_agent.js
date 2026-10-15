const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('./config');

async function streamToBuffer(stream) {
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

// 1. WhatsApp Actions
async function actionChangeDP(sock, msg, quotedMsg) {
    try {
        const imgMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
        if (!imgMessage) return "මට photo එකක් හම්බුනේ නෑ මචං. Photo එකකට reply කරලා හරි photo එකක් එවලා 'Dinu මේක dp දාන්න' කියලා කියන්න. 🖼️";

        const stream = await downloadContentFromMessage(imgMessage, 'image');
        const buffer = await streamToBuffer(stream);
        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sock.updateProfilePicture(myJid, buffer);
        return "ඔන්න මචං මම ඔයාගේ WhatsApp DP එක සාර්ථකව වෙනස් කළා! ලස්සනට තියෙනවා ✨";
    } catch (e) {
        return "DP එක මාරු කරන්න ගිය වෙලාවේ පොඩි අවුලක් ආවා මචං.";
    }
}

async function actionMakeSticker(sock, jid, msg, quotedMsg) {
    try {
        const imgMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
        if (!imgMessage) return "Sticker එකක් හදන්න photo එකක් mention කරලා කියන්න මචං! 🎨";

        const stream = await downloadContentFromMessage(imgMessage, 'image');
        const buffer = await streamToBuffer(stream);
        await sock.sendMessage(jid, { sticker: buffer });
        return null; // Sticker sent directly
    } catch (e) {
        return "Sticker එක හදද්දී පොඩි error එකක් ආවා මචං.";
    }
}

async function actionSaveMedia(sock, jid, quotedMsg) {
    try {
        if (!quotedMsg) return "මට save කරන්න media එකක් quote කරලා නෑ මචං. 📥";

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

        if (!targetJid) return "Channel link එකක් හොයාගන්න බැරි වුණා මචං. Link එකත් එක්ක දාන්න.";

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
        return "ඔයා කියපු පෝස්ට් එක මම සාර්ථකව Channel එකට දැම්මා මචං! 🚀";
    } catch (e) {
        return "Channel එකට post කරන්න බැරි වුණා. ඔයාට ඒකෙ Admin rights තියෙනවද බලන්න.";
    }
}

// 2. Intelligent Agent Brain
async function processDinuRequest(sock, jid, msg, quotedMsg, promptText, latency) {
    const low = promptText.toLowerCase();

    // Fast Hardware / Ping check
    if (low.includes('ping') || low.includes('speed') || low.includes('ස්පීඩ්')) {
        return `\`\`\`Dinu Ultra-Speed: ${latency}ms ⚡\`\`\`\nමම active එකේ ඉන්නේ මචං, කියන්න මොනවද කරලා දෙන්න ඕන? 😊`;
    }

    // Direct Image checks
    const hasImage = Boolean(msg.message?.imageMessage || quotedMsg?.imageMessage);
    if ((low.includes('dp') || low.includes('photo') || low.includes('පොටෝ') || low.includes('profile')) && hasImage) {
        return await actionChangeDP(sock, msg, quotedMsg);
    }
    if ((low.includes('sticker') || low.includes('ස්ටිකර්')) && hasImage) {
        return await actionMakeSticker(sock, jid, msg, quotedMsg);
    }
    if ((low.includes('save') || low.includes('බාගන්න') || low.includes('දාන්නකො')) && quotedMsg) {
        return await actionSaveMedia(sock, jid, quotedMsg);
    }
    if (low.includes('channel') || low.includes('චැනල්')) {
        return await actionSendChannelPost(sock, msg, quotedMsg, promptText);
    }

    // High Intelligence Persona Prompt
    const systemPrompt = `You are 'Dinu' (දිනූ), the ultra-smart, deeply loyal, cheerful and witty personal WhatsApp AI assistant of the bot owner.
- Persona: You talk like a real caring Sri Lankan best friend (මචං, මම ඉන්නවා, ඔයාට උදව් කරන්නම්).
- Language: Natural Sinhala / Singlish matching the owner's tone. Never sound like a robot.
- Instructions:
  * If the owner asks what you are doing ("මොකද කරන්නෙ dinu"): say you're ready and waiting to assist them, ask how their day is going.
  * If the owner asks if you ate ("කාලද dinu"): make a witty friendly joke about being an AI powered by code/electricity, and ask if they ate.
  * Keep replies engaging, warm, crisp, and beautifully formatted with emojis.`;

    try {
        const response = await axios.post(
            '[https://openrouter.ai/api/v1/chat/completions](https://openrouter.ai/api/v1/chat/completions)',
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
                    'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
                    'HTTP-Referer': '[https://render.com](https://render.com)',
                    'Content-Type': 'application/json'
                },
                timeout: 12000
            }
        );

        let aiText = response.data?.choices?.[0]?.message?.content?.trim();
        if (aiText) return aiText;

    } catch (err) {
        console.error('AI Brain Error:', err.message);
    }

    // Natural Built-in Fallbacks (Guaranteed Reply if OpenRouter is unreachable)
    if (low.includes('කාලද')) {
        return "මම AI එකක්නේ මචං, මට කෑම ඕන නෑ ඔයාගේ command වලින් තමයි මගේ බඩ පිරෙන්නේ 😂 ඔයා කෑවද?";
    }
    if (low.includes('මොකද කරන්නෙ') || low.includes('මොකද වෙන්නෙ')) {
        return "නිකන් ඉන්නවා මචං ඔයාට support එකක් දෙන්න බලාගෙන! කියන්න අද මොනවද අපි කරන්නේ? ⚡";
    }
    if (low.includes('හලෝ') || low.includes('hello') || low.includes('hi')) {
        return "හායි මචං! මම අහගෙන ඉන්නේ, කියන්න මොකක්ද වෙන්න ඕන? 🫡";
    }

    return "ඔව් මචං, මම මෙතන ඉන්නවා! කියන්න මොකක්ද කරලා දෙන්න ඕනේ? ⚡";
}

module.exports = { processDinuRequest };
