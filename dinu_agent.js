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

// 1. Change DP
async function actionChangeDP(sock, msg, quotedMsg) {
    try {
        const imgMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
        if (!imgMessage) return "මට photo එකක් හම්බුනේ නෑ මචං. Photo එකකට reply කරලා 'Dinu මේක dp දාන්න' කියලා කියන්න.";

        const stream = await downloadContentFromMessage(imgMessage, 'image');
        const buffer = await streamToBuffer(stream);
        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sock.updateProfilePicture(myJid, buffer);
        return "ඔයාගේ WhatsApp DP එක මම සාර්ථකව වෙනස් කළා මචං! ✔️";
    } catch (e) {
        return "DP එක මාරු කරන්න ගිය වෙලාවේ error එකක් ආවා.";
    }
}

// 2. Make Sticker
async function actionMakeSticker(sock, jid, msg, quotedMsg) {
    try {
        const imgMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
        if (!imgMessage) return "Sticker එකක් හදන්න photo එකකට reply කරලා කියන්න මචං.";

        const stream = await downloadContentFromMessage(imgMessage, 'image');
        const buffer = await streamToBuffer(stream);

        await sock.sendMessage(jid, { sticker: buffer });
        return "මෙන්න ඔයාගේ Sticker එක! 🎨";
    } catch (e) {
        return "Sticker එක හදද්දී error එකක් ආවා.";
    }
}

// 3. Save Media
async function actionSaveMedia(sock, jid, quotedMsg) {
    try {
        if (!quotedMsg) return "මට download කරන්න media එකක් quote කරලා නෑ.";

        const img = quotedMsg.imageMessage;
        const vid = quotedMsg.videoMessage;

        if (img) {
            const stream = await downloadContentFromMessage(img, 'image');
            const buffer = await streamToBuffer(stream);
            await sock.sendMessage(jid, { image: buffer, caption: "Saved Image 📥" });
            return "Media එක save කරලා එව්වා මචං!";
        } else if (vid) {
            const stream = await downloadContentFromMessage(vid, 'video');
            const buffer = await streamToBuffer(stream);
            await sock.sendMessage(jid, { video: buffer, caption: "Saved Video 📥" });
            return "Video එක save කරලා එව්වා මචං!";
        }
        return "මේක image එකක් හෝ video එකක් නෙවෙයි.";
    } catch (e) {
        return "Media එක download කරගන්න බැරි වුණා.";
    }
}

// 4. Block / Unblock User
async function actionBlockUser(sock, jid, block = true) {
    try {
        if (jid.endsWith('@g.us')) return "ගෲප් block කරන්න බෑ මචං.";
        await sock.updateBlockStatus(jid, block ? 'block' : 'unblock');
        return block ? "User ව Block කළා! 🚫" : "User ව Unblock කළා! ✅";
    } catch (e) {
        return "Block status වෙනස් කරන්න බැරි වුණා.";
    }
}

// 5. Group Mute / Unmute
async function actionGroupMute(sock, jid, mute = true) {
    try {
        if (!jid.endsWith('@g.us')) return "මේක Group එකක් නෙවෙයි මචං.";
        await sock.groupSettingUpdate(jid, mute ? 'announcement' : 'not_announcement');
        return mute ? "Group එක mute කළා (Admins only)! 🔒" : "Group එක unmute කළා (All members)! 🔓";
    } catch (e) {
        return "Group settings වෙනස් කරන්න Admin rights නෑ.";
    }
}

// 6. Send Channel Post
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

        if (!targetJid) return "Channel link එකක් හම්බුනේ නෑ මචං.";

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
        return "මැසේජ් එක සාර්ථකව channel එකට post කළා! 🚀";
    } catch (e) {
        return "Channel එකට post කරන්න බැරි වුණා. Admin permissions බලන්න.";
    }
}

// 7. Core AI Processing & Smart Conversation
async function processDinuRequest(sock, jid, msg, quotedMsg, promptText, latency) {
    const low = promptText.toLowerCase();

    // Fast-path keywords for ultra speed
    if (low.includes('ping') || low.includes('speed') || low.includes('ස්පීඩ්')) {
        return `\`\`\`Dinu Speed: ${latency}ms 🚀\`\`\`\nමම online ඉන්නේ මචං, කියන්න මොනවද වෙන්න ඕනේ?`;
    }
    if ((low.includes('dp') || low.includes('photo') || low.includes('පොටෝ')) && (msg.message?.imageMessage || quotedMsg?.imageMessage)) {
        return await actionChangeDP(sock, msg, quotedMsg);
    }
    if ((low.includes('sticker') || low.includes('ස්ටිකර්')) && (msg.message?.imageMessage || quotedMsg?.imageMessage)) {
        return await actionMakeSticker(sock, jid, msg, quotedMsg);
    }

    const systemPrompt = `You are 'Dinu' (දිනූ), the ultra-smart, loyal, friendly personal WhatsApp AI assistant of the bot owner.
- Identity: Your name is Dinu (දිනූ).
- Personality: Extremely sharp, witty, caring, friendly, and natural. Speak like a real close friend (මචං, ඔව් මම ඉන්නවා, etc.).
- Tone: Natural conversational Sinhala / Singlish matching the owner's language.
- Examples:
  * "මොකද කරන්නෙ dinu" -> "නිකන් ඉන්නවා මචං, ඔයා මොකද කරන්නේ? මොකක්ද වෙන්න ඕන?"
  * "කාලද දිනූ ඔයා" -> "මම AI එකක්නේ මචං, මට කෑම ඕන නෑ ඔයාගේ command වලින් තමයි මගේ බඩ පිරෙන්නේ 😂 ඔයා කෑවද?"
- Actions: If the user explicitly asks to execute WhatsApp commands (CHANGE_DP, MAKE_STICKER, SAVE_MEDIA, BLOCK_USER, UNBLOCK_USER, MUTE_GROUP, UNMUTE_GROUP, SEND_CHANNEL_POST), respond in strict JSON. Otherwise, respond in natural Sinhala/Singlish plain text.`;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: promptText }
                ],
                temperature: 0.6,
                max_tokens: 350
            },
            {
                headers: {
                    'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        let content = response.data?.choices?.[0]?.message?.content?.trim() || '';

        // If returned JSON for actions
        if (content.startsWith('{') && content.endsWith('}')) {
            try {
                const parsed = JSON.parse(content);
                if (parsed.action === 'CHANGE_DP') return await actionChangeDP(sock, msg, quotedMsg);
                if (parsed.action === 'MAKE_STICKER') return await actionMakeSticker(sock, jid, msg, quotedMsg);
                if (parsed.action === 'SAVE_MEDIA') return await actionSaveMedia(sock, jid, quotedMsg);
                if (parsed.action === 'BLOCK_USER') return await actionBlockUser(sock, jid, true);
                if (parsed.action === 'UNBLOCK_USER') return await actionBlockUser(sock, jid, false);
                if (parsed.action === 'MUTE_GROUP') return await actionGroupMute(sock, jid, true);
                if (parsed.action === 'UNMUTE_GROUP') return await actionGroupMute(sock, jid, false);
                if (parsed.action === 'SEND_CHANNEL_POST') return await actionSendChannelPost(sock, msg, quotedMsg, promptText);
                if (parsed.reply) return parsed.reply;
            } catch (e) {}
        }

        return content || "ඔව් මචං, මම අහගෙන ඉන්නේ. කියන්න මොකක්ද වෙන්න ඕනේ?";

    } catch (err) {
        // Fallback model if Gemini is busy
        try {
            const fallbackRes = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: 'deepseek/deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: promptText }
                    ]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            return fallbackRes.data?.choices?.[0]?.message?.content?.trim() || "මම මෙතන ඉන්නවා මචං, කියන්න!";
        } catch (e) {
            return "ඔව් මචං, මම online ඉන්නේ! මොකක්ද මම කරලා දෙන්න ඕන?";
        }
    }
}

module.exports = { processDinuRequest };
