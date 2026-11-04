const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'profile',
  alias: ['getdp', 'setdp', 'gdp', 'sdp'],
  desc: 'Fetch or update profile picture',
  category: 'tools',
  run: async ({ sock, msg, jid, args, command }) => {
    try {
      const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const cmdUsed = (command || messageText.trim().split(/\s+/)[0].slice(1)).toLowerCase();

      // ==========================================
      // 1. GETDP COMMAND (Fetch Profile Picture)
      // ==========================================
      if (cmdUsed === 'getdp' || cmdUsed === 'gdp') {
        let targetJid = '';

        const quotedUser = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const rawNumber = args.join('').replace(/[^0-9]/g, '');

        if (mentionedJid) {
          // If mentioned with @
          targetJid = mentionedJid;
        } else if (quotedUser) {
          // If replied to a user message
          targetJid = quotedUser;
        } else if (rawNumber) {
          // If phone number is passed (e.g. .getdp 947167386388)
          targetJid = `${rawNumber}@s.whatsapp.net`;
        } else {
          // Default to sender's own DP
          targetJid = msg.key.participant || msg.key.remoteJid;
        }

        await sock.sendMessage(jid, { 
          text: '⏳ *HESHAN OFC:* Fetching profile picture...' 
        }, { quoted: msg });

        let profilePicUrl = '';
        try {
          profilePicUrl = await sock.profilePictureUrl(targetJid, 'image');
        } catch (err) {
          return await sock.sendMessage(jid, { 
            text: '❌ *Failed to fetch DP!* The user may not have a profile picture or their privacy settings prevent viewing it.' 
          }, { quoted: msg });
        }

        const phoneDisplay = targetJid.split('@')[0];
        const caption = 
`> *👤⃝✨ H E S H A N   O F C   P R O F I L E*

*❖ ᴜsᴇʀ :* @${phoneDisplay}
*❖ sᴛᴀᴛᴜs :* High Quality Profile Fetched 🖼️

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

        return await sock.sendMessage(jid, {
          image: { url: profilePicUrl },
          caption,
          mentions: [targetJid]
        }, { quoted: msg });
      }

      // ==========================================
      // 2. SETDP COMMAND (Update Bot Profile Picture)
      // ==========================================
      if (cmdUsed === 'setdp' || cmdUsed === 'sdp') {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedImage = quotedMsg?.imageMessage;
        const isDirectImage = msg.message?.imageMessage;

        if (!isQuotedImage && !isDirectImage) {
          return await sock.sendMessage(jid, {
            text: `⚠️ *How to use .setdp:*\n\n1. Send an image with caption \`.setdp\`\n2. Reply to an existing image with \`.setdp\``
          }, { quoted: msg });
        }

        await sock.sendMessage(jid, { 
          text: '⏳ *HESHAN OFC:* Updating profile picture in high quality...' 
        }, { quoted: msg });

        let mediaBuffer;
        if (isQuotedImage) {
          mediaBuffer = await downloadMediaMessage(
            {
              key: {
                remoteJid: jid,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
              },
              message: quotedMsg
            },
            'buffer',
            {},
            { logger: console }
          );
        } else {
          mediaBuffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { logger: console }
          );
        }

        if (!mediaBuffer) {
          return await sock.sendMessage(jid, { 
            text: '❌ *Error:* Failed to process image file.' 
          }, { quoted: msg });
        }

        const botJid = sock.user.id.includes(':') 
          ? sock.user.id.split(':')[0] + '@s.whatsapp.net' 
          : sock.user.id;

        await sock.updateProfilePicture(botJid, mediaBuffer);

        return await sock.sendMessage(jid, {
          text: `✅ *Success!* Profile picture has been updated successfully.`
        }, { quoted: msg });
      }

    } catch (error) {
      console.error('Profile Command Error:', error);
      await sock.sendMessage(jid, { 
        text: `❌ *An error occurred:* ${error.message}` 
      }, { quoted: msg });
    }
  }
};
