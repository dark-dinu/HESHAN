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
 * Short links (pin.it) expander
 */
async function expandUrl(shortUrl) {
  try {
    const res = await axios.get(shortUrl, {
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return res.request?.res?.responseUrl || res.config?.url || shortUrl;
  } catch (err) {
    if (err.response?.headers?.location) return err.response.headers.location;
    return shortUrl;
  }
}

/**
 * High Priority Pinterest Video Extractor
 */
async function fetchPinterestMedia(rawUrl) {
  const fullUrl = await expandUrl(rawUrl);

  // 1. Direct Page JSON Scraping (Pinterest page එක ඇතුළෙන්ම MP4 video stream එක ඇද ගැනීම)
  try {
    const { data: html } = await axios.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 20000
    });

    // Pinterest videos වල direct 720p / 1080p MP4 URLs regex
    const videoMatches = html.match(/https?:\/\/[^"'\s]+\.mp4/g);
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].replace(' | Pinterest', '').trim() : 'Pinterest Media';

    if (videoMatches && videoMatches.length > 0) {
      // 720p හෝ හොඳම quality MP4 එක තෝරා ගැනීම
      const bestVideo = videoMatches.find(v => v.includes('720p') || v.includes('exp=')) || videoMatches[0];
      const cleanVideoUrl = bestVideo.replace(/\\u002F/g, '/');
      return {
        isVideo: true,
        downloadUrl: cleanVideoUrl,
        title
      };
    }
  } catch (e) {
    console.warn('Direct web inspection failed, checking Chamindu API...');
  }

  // 2. Chamindu API (Check video specific objects)
  try {
    const chamaUrl = `https://api.chamindu.site/api/v1/media/pinterest/infodl?q=${encodeURIComponent(fullUrl)}&api_key=${CHAMA_API_KEY}`;
    const { data: res } = await axios.get(chamaUrl, { timeout: 25000 });

    if (res?.status && res?.data) {
      const d = res.data;
      const downloads = d.downloads || [];

      // වීඩියෝවක් තිබේදැයි දැඩිව පරීක්ෂා කිරීම
      const vid = downloads.find(x => 
        x.type === 'video' || 
        x.name?.toLowerCase().includes('video') || 
        x.link?.includes('.mp4')
      );

      if (vid && vid.link) {
        return {
          isVideo: true,
          downloadUrl: vid.link,
          title: d.title || 'Pinterest Video'
        };
      }

      // වීඩියෝවක් නැත්නම් පමණක් Image එකක් ලෙස තෝරා ගැනීම
      const img = downloads.find(x => x.type === 'image_direct' || x.type === 'image');
      const fallbackImg = img?.link || d.image || (d.gallery && d.gallery[0]);

      if (fallbackImg) {
        return {
          isVideo: false,
          downloadUrl: fallbackImg,
          title: d.title || 'Pinterest Image'
        };
      }
    }
  } catch (err) {
    console.warn('Chamindu API failed, trying public resolver...');
  }

  // 3. Dedicated Pinterest Video Scraper Gateway
  try {
    const res = await axios.get(`https://pinterestdownloader.io/backend/download?url=${encodeURIComponent(fullUrl)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 20000
    });

    if (res?.data?.url) {
      return {
        isVideo: true,
        downloadUrl: res.data.url,
        title: 'Pinterest Video'
      };
    }
  } catch (e) {
    console.error('All engines failed:', e.message);
  }

  return null;
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

      // Search & Extract
      const mediaResult = await fetchPinterestMedia(validPinUrl);

      if (!mediaResult || !mediaResult.downloadUrl) {
        return await sock.sendMessage(jid, { 
          text: '❌ Could not retrieve media from this Pinterest link.' 
        }, { quoted: msg });
      }

      const isVideo = mediaResult.isVideo;
      const title = (mediaResult.title || 'Pinterest Media').replace(/\s+/g, ' ').trim();

      // Caption Designs
      const normalCaption = 
`> *📌⃝✨ H E S H A N   O F C   P I N T E R E S T*

*❖ ᴛɪᴛʟᴇ :* ${title}
*❖ ᴛʏᴘᴇ :* ${isVideo ? 'Video 🎬' : 'Image 🖼️'}

\`\`\`➥ Downloaded in Original High Quality! ✨\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      const channelCaption = `${title}\n\n> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴇᴅɪᴀ ʜᴜʙ*`;

      // Download Stream Buffer
      const fileStream = await axios({
        url: mediaResult.downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });

      const mediaBuffer = Buffer.from(fileStream.data);

      if (isChannelCmd) {
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
