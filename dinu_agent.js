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
        if (!imgMessage) return "මට photo එකක් හම්බුනේ නෑ. Photo එකකට reply කරලා 'Dinu මේක dp දාන්න' කියලා කියන්න.";

        const stream = await downloadContentFromMessage(imgMessage, 'image');
        const buffer = await streamToBuffer(stream);
        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sock.updateProfilePicture(myJid, buffer);
        return "ඔයාගේ WhatsApp DP එක මම සාර්ථකව වෙනස් කළා මචං! ✔️";
    } catch (e) {
        return "DP එක මාරු කරන්න බැරි වුණා.";
    }
}

// 2. Make Sticker
async function actionMakeSticker(sock, jid, msg, quotedMsg) {
    try {
        const imgMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
        if (!imgMessage) return "Sticker එකක් හදන්න image එකක් හම්බුනේ නෑ. Photo එකකට reply කරලා කියන්න.";

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
            return "Media එක සාර්ථකව save කරලා එව්වා!";
        } else if (vid) {
            const stream = await downloadContentFromMessage(vid, 'video');
            const buffer = await streamToBuffer(stream);
            await sock.sendMessage(jid, { video: buffer, caption: "Saved Video 📥" });
            return "Video එක සාර්ථකව save කරලා එව්වා!";
        }
        return "මේක image එකක් හෝ video එකක් නෙවෙයි.";
    } catch (e) {
        return "Media එක download කරගන්න බැරි වුණා.";
    }
}

// 4. Block / Unblock User
async function actionBlockUser(sock, jid, block = true) {
    try {
        if (jid.endsWith('@g.us')) return "ගෲප් block කරන්න බෑ මචං, පුද්ගලික chat එකකදී කියන්න.";
        await sock.updateBlockStatus(jid, block ? 'block' : 'unblock');
        return block ? "User ව සාර්ථකව Block කළා! 🚫" : "User ව Unblock කළා! ✅";
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
            const postText = promptText.replace(/dinu/gi, '').replace(linkMatch ? linkMatch[0] : '', '').trim();
            contentToSend = { text: postText };
        }

        await sock.sendMessage(targetJid, contentToSend);
        return "මැසේජ් එක සාර්ථකව channel එකට post කළා! 🚀";
    } catch (e) {
        return "Channel එකට post කරන්න බැරි වුණා. Admin permissions බලන්න.";
    }
}

// 7. Core AI Action Decider
async function processDinuRequest(sock, jid, msg, quotedMsg, promptText, latency) {
    const low = promptText.toLowerCase();

    // Fast-path for quick keywords
    if (low.includes('ping') || low.includes('speed')) {
        return `\`\`\`Dinu Speed: ${latency}ms 🚀\`\`\`\nමම online ඉන්නේ මචං, කියන්න මොනවද වෙන්න ඕන?`;
    }
    if ((low.includes('dp') || low.includes('photo')) && (msg.message?.imageMessage || quotedMsg?.imageMessage)) {
        return await actionChangeDP(sock, msg, quotedMsg);
    }
    if (low.includes('sticker') && (msg.message?.imageMessage || quotedMsg?.imageMessage)) {
        return await actionMakeSticker(sock, jid, msg, quotedMsg);
    }

    const systemPrompt = `You are 'Dinu', the ultra-smart personal WhatsApp assistant of the bot owner.
Understand the owner's natural language command and strictly choose an action.

Available Actions:
- "CHANGE_DP": Change, set or update DP/profile photo.
- "MAKE_STICKER": Turn photo/media into a sticker.
- "SAVE_MEDIA": Download, save status, or send back quoted view-once/media.
- "BLOCK_USER": Block current user.
- "UNBLOCK_USER": Unblock current user.
- "MUTE_GROUP": Mute group/make only admin send messages.
- "UNMUTE_GROUP": Unmute group/open chat for all.
- "SEND_CHANNEL_POST": Send text/post to channel or group link.
- "CHECK_PING": Inquire about ping, speed, or status.
- "CHAT": General discussion or greeting.

Output STRICT JSON only:
{"action": "ACTION_NAME", "reply": "Natural friendly Sinhala text response"}`;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: promptText }
                ],
                temperature: 0.3
            },
            {
                headers: {
                    'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 12000
            }
        );

        let content = response.data?.choices?.[0]?.message?.content?.trim() || '{}';
        content = content.replace(/^```json/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(content);

        switch (parsed.action) {
            case 'CHANGE_DP': return await actionChangeDP(sock, msg, quotedMsg);
            case 'MAKE_STICKER': return await actionMakeSticker(sock, jid, msg, quotedMsg);
            case 'SAVE_MEDIA': return await actionSaveMedia(sock, jid, quotedMsg);
            case 'BLOCK_USER': return await actionBlockUser(sock, jid, true);
            case 'UNBLOCK_USER': return await actionBlockUser(sock, jid, false);
            case 'MUTE_GROUP': return await actionGroupMute(sock, jid, true);
            case 'UNMUTE_GROUP': return await actionGroupMute(sock, jid, false);
            case 'SEND_CHANNEL_POST': return await actionSendChannelPost(sock, msg, quotedMsg, promptText);
            case 'CHECK_PING': return `\`\`\`Dinu Speed: ${latency}ms 🚀\`\`\``;
            default: return parsed.reply || "ඔව් මචං, මම අහගෙන ඉන්නේ. කියන්න මොකක්ද මම කරලා දෙන්න ඕනේ?";
        }
    } catch (err) {
        console.error('AI Request Error:', err.message);
        return "ඔව් මචං, මම online ඉන්නේ! මොකක්ද මම කරලා දෙන්න ඕන?";
    }
}

module.exports = { processDinuRequest };
