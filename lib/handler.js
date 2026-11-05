const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config');
const path = require('path');
const fs = require('fs');

if (!global.msgStore) global.msgStore = new Map();

// අනුමත කරපු reaction emojis list එක
const ALLOWED_REACTIONS = [
  '😂','❤️','🌝','😭','😩','✔️','❤️‍🩹','😡','😏','👎',
  '🙏','🤗','🖕','👍','😍','🤮','🥵','😋','🫶','🤍',
  '🙂','🙄','☺️','😸','😗','🩶','👀'
];

async function getSettings(db, sessionId) {
  try {
    if (!db || !db.bots) return {};
    const data = await db.bots.findOne({ _id: sessionId });
    return Object.assign({
      antiDelete: true,
      antiViewOnce: true,
      sendDestination: 'inbox',
      workType: 'public',
      statusSeen: true,
      statusReact: true,
      fakePresence: 'off',
      antiSend: 'off',
      statusReactEmoji: '🥰',
      alwaysOnline: false
    }, data?.settings || {});
  } catch {
    return {};
  }
}

// ViewOnce Media එක Download කර යැවීමේ Function එක
async function handleViewOnceDownload(sock, targetJid, rawMsg, sender) {
  const msgType = Object.keys(rawMsg)[0];
  const innerMsg = rawMsg[msgType]?.message;
  if (!innerMsg) return;

  const mediaType = Object.keys(innerMsg)[0];
  try {
    const buffer = await downloadMediaMessage(
      { key: { remoteJid: targetJid }, message: innerMsg },
      'buffer',
      {},
      { logger: undefined, reuploadRequest: sock.updateMediaMessage }
    );

    const caption = `> *👁️‍🗨️ ANTI-VIEW ONCE RECOVERED*\n\n• *From:* @${sender.split('@')[0]}`;

    if (mediaType === 'imageMessage') {
      await sock.sendMessage(targetJid, { image: buffer, caption, mentions: [sender] });
    } else if (mediaType === 'videoMessage') {
      await sock.sendMessage(targetJid, { video: buffer, caption, mentions: [sender] });
    } else if (mediaType === 'audioMessage') {
      await sock.sendMessage(targetJid, { audio: buffer, mimetype: 'audio/mp4', ptt: innerMsg.audioMessage.ptt });
    }
  } catch (err) {
    console.error('ViewOnce download failed:', err.message);
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
    // 1. 👁️ STATUS AUTO-SEEN & 💖 STATUS AUTO-REACT (100% FIXED)
    // ─────────────────────────────────────────────
    if (isStatus) {
      const participant = m.key.participant;
      if (settings.statusSeen) {
        await sock.readMessages([m.key]);
      }
      if (settings.statusReact && participant) {
        const reactEmoji = settings.statusReactEmoji || '🥰';
        // WhatsApp Official Status React Format
        await sock.sendMessage('status@broadcast', {
          react: {
            text: reactEmoji,
            key: m.key
          }
        }, {
          statusJidList: [participant]
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

    // ─────────────────────────────────────────────
    // 3. 👁️‍🗨️ & 🗑️ MSG CACHING (ViewOnce සහ Anti-Delete දෙකටම)
    // ─────────────────────────────────────────────
    const msgId = m.key.id;
    const msgType = Object.keys(m.message)[0];
    const isViewOnce = msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2';

    if (!m.message.protocolMessage) {
      global.msgStore.set(msgId, {
        message: m.message,
        sender,
        jid,
        isViewOnce,
        pushName: m.pushName || 'User',
        timestamp: Date.now()
      });

      if (global.msgStore.size > 3000) {
        const firstKey = global.msgStore.keys().next().value;
        global.msgStore.delete(firstKey);
      }
    }

    // Reaction එකකින් ViewOnce එක Unlock කිරීම
    if (m.message.reactionMessage) {
      const targetMsgId = m.message.reactionMessage.key.id;
      const emoji = m.message.reactionMessage.text;

      if (ALLOWED_REACTIONS.includes(emoji)) {
        const cached = global.msgStore.get(targetMsgId);
        if (cached && cached.isViewOnce) {
          const destJid = settings.sendDestination === 'inbox' ? botJid : jid;
          await handleViewOnceDownload(sock, destJid, cached.message, cached.sender);
          return;
        }
      }
    }

    // Anti-ViewOnce: එසැනින් Auto Download වීම
    if (isViewOnce && settings.antiViewOnce) {
      const destJid = settings.sendDestination === 'inbox' ? botJid : jid;
      await handleViewOnceDownload(sock, destJid, m.message, sender);
    }

    // ─────────────────────────────────────────────
    // 4. 🗑️ ANTI-DELETE (100% WORKING RECOVERY)
    // ─────────────────────────────────────────────
    if (m.message.protocolMessage && m.message.protocolMessage.type === 0) {
      if (settings.antiDelete) {
        const deletedId = m.message.protocolMessage.key.id;
        const cached = global.msgStore.get(deletedId);

        if (cached) {
          const destJid = settings.sendDestination === 'inbox' ? botJid : cached.jid;
          const reportText = 
`> *🗑️ ANTI-DELETE DETECTED*

┌───〔 RECOVERED MESSAGE 〕
│
├ ✦ *From:* @${cached.sender.split('@')[0]}
├ ✦ *Chat:* ${cached.jid.endsWith('@g.us') ? 'Group Chat' : 'Private Inbox'}
├ ✦ *Time:* ${new Date().toLocaleTimeString()}
│
└───···▸`;

          await sock.sendMessage(destJid, {
            text: reportText,
            mentions: [cached.sender]
          });

          // Original Message Content එක Forward කිරීම
          await sock.sendMessage(destJid, {
            forward: {
              key: { remoteJid: cached.jid, id: deletedId },
              message: cached.message
            }
          });
        }
      }
      return;
    }

    // ─────────────────────────────────────────────
    // 5. 🌐 BOT WORK TYPE
    // ─────────────────────────────────────────────
    if (settings.workType === 'private' && !isOwner) return;
    if (settings.workType === 'group' && !isGroup && !isOwner) return;
    if (settings.workType === 'inbox' && isGroup && !isOwner) return;

    // ─────────────────────────────────────────────
    // 6. ⚙️ QUOTED REPLY HANDLER & COMMAND ROUTING
    // ─────────────────────────────────────────────
    const textMsg = 
      m.message.conversation || 
      m.message.extendedTextMessage?.text || 
      m.message.imageMessage?.caption || 
      '';

    const contextInfo = m.message.extendedTextMessage?.contextInfo;
    if (contextInfo?.quotedMessage) {
      const qm = contextInfo.quotedMessage;
      const quotedText = 
        qm.conversation || 
        qm.extendedTextMessage?.text || 
        qm.imageMessage?.caption || 
        qm.videoMessage?.caption || '';

      const settingCmdPath = path.join(__dirname, '../commands/setting.js');
      if (fs.existsSync(settingCmdPath)) {
        const settingCmd = require(settingCmdPath);
        if (settingCmd && settingCmd.onReply) {
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
