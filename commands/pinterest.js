const axios = require('axios');

// Default WhatsApp Channel Links
const DEFAULT_CHANNEL = 'https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D';

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
 * Pinterest Short URL (pin.it) expander
 */
async function expandPinUrl(shortUrl) {
  try {
    const res = await axios.get(shortUrl, {
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return res.request?.res?.responseUrl || res.config?.url || shortUrl;
  } catch (e) {
    if (e.response?.headers?.location) return e.response.headers.location;
    return shortUrl;
  }
}

/**
 * Direct Pinterest Video & Image Extractor (No broken proxy)
 */
async function getPinterestMedia(url) {
  const fullUrl = await expandPinUrl(url);

  // Method 1: Direct Web HTML Metadata Scraping
  try {
    const { data: html } = await axios.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 20000
    });

    // Check for MP4 Video URL in HTML/JSON data
    const videoMatch = html.match(/https?:\/\/[^"'\s]+\.mp4/i);
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const imageMatch = html.match(/https?:\/\/i\.pinimg\.com\/originals\/[^"'\s]+\.(jpg|jpeg|png|webp)/i) ||
                       html.match(/https?:\/\/i\.pinimg\.com\/736x\/[^"'\s]+\.(jpg|jpeg|png|webp)/i);

    let cleanTitle = titleMatch ? titleMatch[1].replace(' | Pinterest', '').trim() : 'Pinterest Media';

    if (videoMatch && videoMatch[0]) {
      // Decode unicode slashes if any
      const cleanVideoUrl = videoMatch[0].replace(/\\u002F/g, '/');
      return {
        isVideo: true,
        downloadUrl: cleanVideoUrl,
        title: cleanTitle
      };
    }

    if (imageMatch && imageMatch[0]) {
      return {
        isVideo: false,
        downloadUrl: imageMatch[0].replace(/\\u002F/g, '/'),
        title: cleanTitle
      };
    }
  } catch (err) {
    console.warn('Direct HTML scrape failed, trying API scraper...');
  }

  // Method 2: Public Pinterest Downloader Gateway
  try {
    const apiRes = await axios.get(`https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(fullUrl)}`, {
      timeout: 20000
    });

    if (apiRes?.data?.status && apiRes?.data?.data) {
      const d = apiRes.data.data;
      if (d.video || d.url?.endsWith('.mp4')) {
        return {
          isVideo: true,
          downloadUrl: d.video || d.url,
          title: d.title || 'Pinterest Video'
        };
      }
      if (d.image || d.url) {
        return {
          isVideo: false,
          downloadUrl: d.image || d.url,
          title: d.title || 'Pinterest Image'
        };
      }
    }
  } catch (e) {
    console.error('Pinterest extraction error:', e.message);
  }

  return null;
}

module.exports = {
  name: 'pinterest',
  alias: ['pvd', 'pinvideo', 'pindl', 'cpvd'],
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

      // Pinterest Regex (Supports pin.it & pinterest.com)
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

      // Media දත්ත ලබාගැනීම
      const mediaResult = await getPinterestMedia(validPinUrl);

      if (!mediaResult || !mediaResult.downloadUrl) {
        return await sock.sendMessage(jid, { 
          text: '❌ Could not retrieve Pinterest video or image. Please make sure the link is public.' 
        }, { quoted: msg });
      }

      const isVideo = mediaResult.isVideo;
      const title = mediaResult.title || 'Pinterest Media';

      // Captions
      const normalCaption = 
`> *📌⃝✨ H E S H A N   O F C   P I N T E R E S T*

*❖ ᴛɪᴛʟᴇ :* ${title}
*❖ ᴛʏᴘᴇ :* ${isVideo ? 'Video 🎬' : 'Image 🖼️'}

\`\`\`➥ Downloaded in Original High Quality! ✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      const channelCaption = `${title}\n\n> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Media Buffer Download
      const fileStream = await axios({
        url: mediaResult.downloadUrl,
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
