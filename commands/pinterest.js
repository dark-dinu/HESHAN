const axios = require('axios');

// Default WhatsApp Channel Links
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D';

// Chamindu Active API Key
const CHAMA_API_KEY = 'chama_api_9c55e3c6d014abbdf65054f9046a920b';

/**
 * WhatsApp Channel JID Resolver (@newsletter format)
 */
async function resolveChannelJid(sock, channelInput) {
  let input = channelInput.trim();
  if (input.endsWith('@newsletter')) return input;

  const match = input.match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([a-zA-Z0-9]+)/i);
  if (match && match[1]) {
    const inviteCode = match[1];
    if (typeof sock.newsletterMetadata === 'function') {
      try {
        const meta = await sock.newsletterMetadata('invite', inviteCode);
        if (meta?.id) return meta.id;
      } catch (e) {
        console.error('Newsletter meta error:', e);
      }
    }
    return `${inviteCode}@newsletter`;
  }
  return input;
}

module.exports = {
  name: 'pinterest',
  alias: ['pt', 'pinvideo', 'pindl', 'cpvd'],
  desc: 'Download Pinterest Video or Image to chat or channel',
  category: 'downloader',
  run: async ({ sock, msg, jid, args, command }) => {
    try {
      const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const cmdUsed = (command || messageText.trim().split(/\s+/)[0].slice(1)).toLowerCase();
      const isChannelCmd = cmdUsed === 'cpvd';

      const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

      const fullText = args.join(' ').trim();
      let destinationJid = jid;
      let pinUrl = '';

      if (isChannelCmd) {
        if (fullText.includes(',')) {
          const parts = fullText.split(',');
          destinationJid = await resolveChannelJid(sock, parts[0].trim());
          pinUrl = parts.slice(1).join(',').trim();
        } else {
          destinationJid = await resolveChannelJid(sock, DEFAULT_CHANNEL);
          pinUrl = fullText || quotedText;
        }
      } else {
        pinUrl = fullText || quotedText;
      }

      // Pinterest Link Regex (pin.it හෝ pinterest.com)
      const urlMatch = pinUrl.match(/https?:\/\/(?:www\.)?(?:[a-z]{2}\.)?pinterest\.(?:com|it)\/[^\s]+|https?:\/\/pin\.it\/[^\s]+/i);
      if (!urlMatch) {
        return await sock.sendMessage(jid, { 
          text: isChannelCmd
            ? `⚠️ *No Pinterest link found!*\n\n*Usage:* \`.cpvd <Pinterest Link>\`\n*Or* \`.cpvd <Channel Link>, <Pinterest Link>\``
            : `⚠️ *No Pinterest link found!*\n\n*Usage:* \`.pvd <Pinterest Link>\`\n*Or* reply to a link with \`.pvd\``
        }, { quoted: msg });
      }

      const validPinUrl = urlMatch[0].trim();

      await sock.sendMessage(jid, { 
        text: isChannelCmd 
          ? '⏳ *HESHAN OFC:* Processing Pinterest media for channel...' 
          : '⏳ *HESHAN OFC:* Downloading Pinterest media...' 
      }, { quoted: msg });

      // Chamindu Pinterest API Call
      const apiUrl = `https://api.chamindu.site/api/v1/media/pinterest/infodl?q=${encodeURIComponent(validPinUrl)}&api_key=${CHAMA_API_KEY}`;
      const { data: res } = await axios.get(apiUrl, { timeout: 45000 });

      if (!res?.status || !res?.data) {
        return await sock.sendMessage(jid, { 
          text: '❌ Could not retrieve Pinterest media. The link might be invalid or private.' 
        }, { quoted: msg });
      }

      const pinData = res.data;
      const downloads = pinData.downloads || [];

      // Video download link එකක් තිබේදැයි බැලීම (නැතිනම් Image link එක ගැනීම)
      let selectedMedia = downloads.find(d => d.type === 'video' || d.type === 'video_hd' || d.name?.toLowerCase().includes('video'));
      let isVideo = true;

      if (!selectedMedia) {
        isVideo = false;
        selectedMedia = downloads.find(d => d.type === 'image_direct' || d.type === 'image') || { link: pinData.image };
      }

      const mediaUrl = selectedMedia?.link || pinData.image;

      if (!mediaUrl) {
        return await sock.sendMessage(jid, { 
          text: '❌ No direct download stream found for this Pin.' 
        }, { quoted: msg });
      }

      const title = (pinData.title || 'Pinterest Media').replace(/\s+/g, ' ').trim();

      // Normal Chat Caption Design
      const normalCaption = 
`> *📌⃝✨ H E S H A N   O F C   P I N T E R E S T*

*❖ ᴛɪᴛʟᴇ :* ${title}
*❖ ᴛʏᴘᴇ :* ${isVideo ? 'Video 🎬' : 'Image 🖼️'}

\`\`\`➥ Downloaded in Original High Quality! ✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Channel Caption
      const channelCaption = `${title}\n\n> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Buffer එක Download කර ගැනීම
      const fileStream = await axios({
        url: mediaUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'https://www.pinterest.com/'
        }
      });

      const mediaBuffer = Buffer.from(fileStream.data);

      if (isChannelCmd) {
        // Channel එකට යැවීම
        if (isVideo) {
          await sock.sendMessage(destinationJid, {
            video: mediaBuffer,
            caption: channelCaption,
            mimetype: 'video/mp4'
          });
        } else {
          await sock.sendMessage(destinationJid, {
            image: mediaBuffer,
            caption: channelCaption
          });
        }

        await sock.sendMessage(jid, { 
          text: `✅ *Success!* Pinterest ${isVideo ? 'video' : 'image'} uploaded to the channel.` 
        }, { quoted: msg });

      } else {
        // Chat එකට යැවීම
        if (isVideo) {
          await sock.sendMessage(jid, {
            video: mediaBuffer,
            caption: normalCaption,
            mimetype: 'video/mp4'
          }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, {
            image: mediaBuffer,
            caption: normalCaption
          }, { quoted: msg });
        }
      }

    } catch (error) {
      console.error('Pinterest Downloader Error:', error);
      await sock.sendMessage(jid, { text: `❌ An error occurred: ${error.message}` }, { quoted: msg });
    }
  }
};
