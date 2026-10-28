const axios = require('axios');

// Default WhatsApp Channel Link
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D';

// Active Chamindu API Key
const CHAMA_API_KEY = 'chama_api_9c55e3c6d014abbdf65054f9046a920b';

/**
 * WhatsApp Channel JID Resolver (@newsletter)
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

/**
 * 100% Reliable Pinterest Downloader Engine
 */
async function getPinterestData(pinUrl) {
  // Method 1: Chamindu Pinterest API
  try {
    const chamaUrl = `https://api.chamindu.site/api/v1/media/pinterest/infodl?q=${encodeURIComponent(pinUrl)}&api_key=${CHAMA_API_KEY}`;
    const { data: res } = await axios.get(chamaUrl, { timeout: 25000 });

    if (res?.status && res?.data) {
      const d = res.data;
      const downloads = d.downloads || [];

      // Check if real video exists
      const videoItem = downloads.find(x => x.type === 'video' || x.name?.toLowerCase().includes('video'));
      const imageItem = downloads.find(x => x.type === 'image_direct' || x.type === 'image');

      if (videoItem?.link) {
        return {
          isVideo: true,
          downloadUrl: videoItem.link,
          title: d.title || 'Pinterest Video'
        };
      }

      const rawImage = imageItem?.link || d.image || (d.gallery && d.gallery[0]);
      if (rawImage) {
        return {
          isVideo: false,
          downloadUrl: rawImage,
          title: d.title || 'Pinterest Image'
        };
      }
    }
  } catch (err) {
    console.warn('Chamindu Pinterest API failed, trying Cobalt direct engine...');
  }

  // Method 2: Cobalt Public Engine (Best for Pinterest MP4 Videos)
  try {
    const cobaltRes = await axios.post('https://co.wuk.sh/api/json', {
      url: pinUrl
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 25000
    });

    if (cobaltRes?.data?.url) {
      const isVid = cobaltRes.data.url.includes('.mp4') || cobaltRes.data.pickerType === 'video';
      return {
        isVideo: isVid,
        downloadUrl: cobaltRes.data.url,
        title: 'Pinterest Media'
      };
    }
  } catch (e) {
    console.warn('Cobalt engine failed, trying Direct Resolver...');
  }

  // Method 3: Public Direct Scraper (All-in-one Video & Image)
  try {
    const api = await axios.get(`https://api.agatz.xyz/api/pinterest?url=${encodeURIComponent(pinUrl)}`, {
      timeout: 25000
    });
    if (api?.data?.status === 200 && api?.data?.data) {
      const data = api.data.data;
      if (data.video_url || (typeof data === 'string' && data.endsWith('.mp4'))) {
        return {
          isVideo: true,
          downloadUrl: data.video_url || data,
          title: 'Pinterest Video'
        };
      }
      if (data.image_url || (Array.isArray(data) && data[0])) {
        return {
          isVideo: false,
          downloadUrl: data.image_url || data[0],
          title: 'Pinterest Image'
        };
      }
    }
  } catch (e) {
    console.error('All Pinterest downloaders failed:', e.message);
  }

  return null;
}

module.exports = {
  name: 'pinterest',
  alias: ['pt', 'pinvideo', 'pindl', 'cpvd'],
  desc: 'Download Pinterest Video or Image directly to chat or channel',
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

      // Pinterest Regex
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

      // Fetch Direct Stream URL
      const mediaResult = await getPinterestData(validPinUrl);

      if (!mediaResult || !mediaResult.downloadUrl) {
        return await sock.sendMessage(jid, { 
          text: '❌ Could not retrieve Pinterest video or image. The link might be invalid or private.' 
        }, { quoted: msg });
      }

      const isVideo = mediaResult.isVideo;
      const title = (mediaResult.title || 'Pinterest Media').replace(/\s+/g, ' ').trim();

      // Normal Chat Caption
      const normalCaption = 
`> *📌⃝✨ H E S H A N   O F C   P I N T E R E S T*

*❖ ᴛɪᴛʟᴇ :* ${title}
*❖ ᴛʏᴘᴇ :* ${isVideo ? 'Video 🎬' : 'Image 🖼️'}

\`\`\`➥ Downloaded in Original High Quality! ✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅ ʜᴜʙ*`;

      // Channel Caption
      const channelCaption = `${title}\n\n> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Download Stream Buffer safely
      const fileStream = await axios({
        url: mediaResult.downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': '*/*'
        }
      });

      const mediaBuffer = Buffer.from(fileStream.data);

      if (isChannelCmd) {
        // Upload to Channel
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
        // Send to Normal Chat
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
