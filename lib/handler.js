const { downloadMediaMessage, jidNormalizedUser, getContentType } = require('@whiskeysockets/baileys');
const config = require('../config');
const path = require('path');
const fs = require('fs');

if (!global.msgStore) global.msgStore = new Map();

const ALLOWED_REACTIONS = [
  '😂','❤️','🌝','😭','😩','✔️','❤️‍🩹','😡','😏','👎',
  '🙏','🤗','🖕','👍','😍','🤮','🥵','😋','🫶','🤍',
  '🙂','🙄','☺️','😸','😗','🩶','👀'
];

const STATUS_KEYWORDS = ['oni', 'one', 'ewanna', 'danna', 'evanna', 'ewhn', 'evahn', 'send', 'dpn', 'dapan', 'ඕනි', 'එවන්න', 'දාන්න'];

async function getSettings(db, sessionId) {
  try {
    if (!db || !db.bots) return {};
    const data = await db.bots.findOne({ _id: sessionId });
    return Object.assign({
      antiDelete: true,
      antiViewOnce: true,
      sendDestination: 'inbox', // 'inbox' or 'chat'
      workType: 'public',
      statusSeen: false,
      statusReact: true,
      fakePresence: 'off',
      statusReactEmoji: '💖',
      alwaysOnline: false
    }, data?.settings || {});
  } catch {
    return {};
  }
}

// Destination Handler: Inbox හෝ Current Chat එක නිවැරදිව තෝරාගැනීම
function getTargetJid(settings, sock, currentJid) {
  if (settings.sendDestination === 'inbox') {
    return jidNormalizedUser(sock.user.id); // කෙළින්ම බොට්ගේ Private Inbox (Message Yourself)
  }
  return currentJid; // මැසේජ් එක ආපු Group එක හෝ Private Chat එක
}

async function sendDecryptedMedia(sock, targetJid, mObj, captionText, sender) {
  try {
    const buffer = await downloadMediaMessage(
      mObj,
      'buffer',
      {},
      { logger: undefined, reuploadRequest: sock.updateMediaMessage }
    );

    const type = getContentType(mObj.message);
    const inner = mObj.message[type];

    if (type === 'imageMessage' || inner?.imageMessage) {
      await sock.sendMessage(targetJid, { image: buffer, caption: captionText, mentions: sender ? [sender] : [] });
    } else if (type === 'videoMessage' || inner?.videoMessage) {
      await sock.sendMessage(targetJid, { video: buffer, caption: captionText, mentions: sender ? [sender] : [] });
    } else if (type === 'audioMessage' || inner?.audioMessage) {
      await sock.sendMessage(targetJid, { audio: buffer, mimetype: 'audio/mp4', ptt: inner?.ptt || false });
    }
  } catch (err) {
    console.error('Media Decrypt Error:', err.message);
  }
}

async function handleMessage(sock, m, sessionId, db) {
  try {
    if (!m.message) return;

    const jid = m.key.remoteJid;
    const isStatus = jid === 'status@broadcast';
    const isGroup = jid.endsWith('@g.us');
    const sender = isGroup ? m.key.participant : (m.key.fromMe ? sock.user.id : jid);
    const botJid = jidNormalizedUser(sock.user.id);
    const isOwner = sender && (sender.includes(botJid.split('@')[0]) || sender.includes(config.OWNER_NUMBER));

    const settings = await getSettings(db, sessionId);

    // ─────────────────────────────────────────────
    // 1. 👁️ STATUS SEEN & 💖 REAL STATUS REACT FIX
    // ─────────────────────────────────────────────
    if (isStatus) {
      const participant = m.key.participant;
      
      // Status එක Memory එකේ cache කිරීම
      global.msgStore.set(`status_${m.key.id}`, { raw: m, participant });

      // 👁️ Auto Seen
      if (settings.statusSeen) {
        await sock.readMessages([m.key]);
      }

      // 💖 WhatsApp Status Official React Payload (100% Working)
      if (settings.statusReact && participant) {
        const participantJid = jidNormalizedUser(participant);
        const reactEmoji = settings.statusReactEmoji || '💖';

        await sock.sendMessage('status@broadcast', {
          react: {
            text: reactEmoji,
            key: {
              remoteJid: 'status@broadcast',
              id: m.key.id,
              participant: participantJid,
              fromMe: false
            }
          }
        }, {
          statusJidList: [participantJid]
        });
      }
      return;
    }

    // ─────────────────────────────────────────────
    // 2. 🎭 FAKE PRESENCE
    // ─────────────────────────────────────────────
    if (settings.fakePresence === 'typing') {
      await sock.sendPresenceUpdate('composing', jid);
    } else if (settings.fakePresence === 'recording') {
      await sock.sendPresenceUpdate('recording', jid);
    }

    const msgType = getContentType(m.message);
    const isViewOnce = msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2';
    const textMsg = (
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message.imageMessage?.caption ||
      m.message.videoMessage?.caption ||
      ''
    ).trim();

    // ─────────────────────────────────────────────
    // 3. 📥 STATUS SAVER ("oni", "ewanna", "danna")
    // ─────────────────────────────────────────────
    const contextInfo = m.message.extendedTextMessage?.contextInfo;
    const quotedMsg = contextInfo?.quotedMessage;

    if (quotedMsg && textMsg) {
      const cleanWord = textMsg.toLowerCase().replace(/[^a-z0-9\u0D80-\u0DFF]/g, '');
      if (STATUS_KEYWORDS.includes(cleanWord)) {
        const stanzaId = contextInfo.stanzaId;
        const cachedStatus = global.msgStore.get(`status_${stanzaId}`);

        if (cachedStatus) {
          await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });
          await sendDecryptedMedia(sock, jid, cachedStatus.raw, `> *⚡ STATUS SAVED*`, sender);
          return;
        } else if (quotedMsg.imageMessage || quotedMsg.videoMessage) {
          await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });
          await sendDecryptedMedia(sock, jid, { key: { remoteJid: jid }, message: quotedMsg }, `> *⚡ STATUS SAVED*`, sender);
          return;
        }
      }
    }

    // ─────────────────────────────────────────────
    // 4. MESSAGE STORE (Anti-Delete & ViewOnce Cache)
    // ─────────────────────────────────────────────
    const msgId = m.key.id;

    if (msgType !== 'protocolMessage' && msgType !== 'reactionMessage') {
      global.msgStore.set(msgId, {
        raw: m,
        sender,
        jid,
        isViewOnce,
        time: Date.now()
      });

      if (global.msgStore.size > 4000) {
        const firstKey = global.msgStore.keys().next().value;
        global.msgStore.delete(firstKey);
      }
    }

    // ─────────────────────────────────────────────
    // 5. 👁️‍🗨️ ANTI-VIEW ONCE (Emoji + Auto)
    // ─────────────────────────────────────────────
    // A. Reaction එකකින් Unlock වීම
    if (msgType === 'reactionMessage') {
      const targetId = m.message.reactionMessage.key.id;
      const emoji = m.message.reactionMessage.text;

      if (ALLOWED_REACTIONS.includes(emoji)) {
        const cached = global.msgStore.get(targetId);
        if (cached && cached.isViewOnce) {
          const destJid = getTargetJid(settings, sock, jid);
          const innerMsg = cached.raw.message[Object.keys(cached.raw.message)[0]].message;
          await sendDecryptedMedia(sock, destJid, { key: cached.raw.key, message: innerMsg }, `> *👁️‍🗨️ ANTI-VIEW ONCE (UNLOCKED)*\n• *From:* @${cached.sender.split('@')[0]}`, cached.sender);
          return;
        }
      }
    }

    // B. Direct ViewOnce
    if (isViewOnce && settings.antiViewOnce && !m.key.fromMe) {
      const destJid = getTargetJid(settings, sock, jid);
      const innerMsg = m.message[msgType].message;
      await sendDecryptedMedia(sock, destJid, { key: m.key, message: innerMsg }, `> *👁️‍🗨️ ANTI-VIEW ONCE CAPTURED*\n• *From:* @${sender.split('@')[0]}`, sender);
    }

    // ─────────────────────────────────────────────
    // 6. 🗑️ ANTI-DELETE RECOVERY (Fixed Destination)
    // ─────────────────────────────────────────────
    if (m.message.protocolMessage && m.message.protocolMessage.type === 0) {
      if (settings.antiDelete) {
        const deletedId = m.message.protocolMessage.key.id;
        const cached = global.msgStore.get(deletedId);

        if (cached) {
          const destJid = getTargetJid(settings, sock, cached.jid);
          const reportText = 
`> *🗑️ ANTI-DELETE DETECTED*

┌───〔 RECOVERED MESSAGE 〕
│
├ ✦ *From:* @${cached.sender.split('@')[0]}
├ ✦ *Chat:* ${cached.jid.endsWith('@g.us') ? 'Group Chat' : 'Private Inbox'}
├ ✦ *Destination:* ${settings.sendDestination === 'inbox' ? 'Private DM' : 'Same Chat'}
├ ✦ *Time:* ${new Date().toLocaleTimeString()}
│
└───···▸`;

          await sock.sendMessage(destJid, { text: reportText, mentions: [cached.sender] });

          const cachedType = getContentType(cached.raw.message);
          if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(cachedType)) {
            await sendDecryptedMedia(sock, destJid, cached.raw, `> *Recovered Media File*`, cached.sender);
          } else {
            await sock.sendMessage(destJid, {
              forward: {
                key: cached.raw.key,
                message: cached.raw.message
              }
            });
          }
        }
      }
      return;
    }

    // ─────────────────────────────────────────────
    // 7. 🌐 WORK TYPE
    // ─────────────────────────────────────────────
    if (settings.workType === 'private' && !isOwner) return;
    if (settings.workType === 'group' && !isGroup && !isOwner) return;
    if (settings.workType === 'inbox' && isGroup && !isOwner) return;

    // ─────────────────────────────────────────────
    // 8. ⚙️ QUOTED REPLY (.setting)
    // ─────────────────────────────────────────────
    if (contextInfo?.quotedMessage) {
      const qm = contextInfo.quotedMessage;
      const quotedText = qm.conversation || qm.extendedTextMessage?.text || qm.imageMessage?.caption || qm.videoMessage?.caption || '';

      const settingCmdPath = path.join(__dirname, '../commands/setting.js');
      if (fs.existsSync(settingCmdPath)) {
        const settingCmd = require(settingCmdPath);
        if (settingCmd?.onReply) {
          const handled = await settingCmd.onReply({
            sock,
            msg: m,
            jid,
            text: textMsg,
            quotedText,
            db,
            sender
          });
          if (handled) return;
        }
      }
    }

    // ─────────────────────────────────────────────
    // 9. 🚀 COMMAND ROUTER
    // ─────────────────────────────────────────────
    const prefix = config.PREFIX || '.';
    if (textMsg.startsWith(prefix)) {
      const args = textMsg.slice(prefix.length).trim().split(/ +/);
      const cmdName = args.shift().toLowerCase();

      const cmdPath = path.join(__dirname, '../commands', `${cmdName}.js`);
      if (fs.existsSync(cmdPath)) {
        const cmd = require(cmdPath);
        await cmd.run({ sock, msg: m, jid, args, prefix, db, isOwner, sender });
      }
    }

  } catch (err) {
    console.error(`[${sessionId}] Handler error:`, err);
  }
}

module.exports = { handleMessage };
