const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config');
const path = require('path');
const fs = require('fs');

// Anti-Delete Cache (Messages 3000ක් memory එකේ hold කර තබා ගනී)
if (!global.msgStore) global.msgStore = new Map();

// Helper: Database එකෙන් Settings කියවීම
async function getSettings(db, sessionId) {
  try {
    if (!db || !db.bots) return {};
    const data = await db.bots.findOne({ _id: sessionId });
    return Object.assign({
      antiDelete: true,
      antiViewOnce: true,
      sendDestination: 'inbox',
      workType: 'public',
      statusSeen: false,
      statusReact: true,
      fakePresence: 'off',
      antiSend: 'off',
      statusReactEmoji: '💖',
      alwaysOnline: false
    }, data?.settings || {});
  } catch {
    return {};
  }
}

async function handleMessage(sock, m, sessionId, db) {
  try {
    if (!m.message) return;

    const jid = m.key.remoteJid;
    const isStatus = jid === 'status@broadcast';
    const isGroup = jid.endsWith('@g.us');
    const sender = isGroup ? m.key.participant : jid;
    const botJid = jidNormalizedUser(sock.user.id);
    const isOwner = sender && (sender.includes(botJid.split('@')[0]) || sender.includes(config.OWNER_NUMBER));

    const settings = await getSettings(db, sessionId);

    // ─────────────────────────────────────────────
    // 6 & 7 & 10. 👁️ STATUS AUTO-SEEN & 💖 STATUS AUTO-REACT (WITH CUSTOM EMOJI)
    // ─────────────────────────────────────────────
    if (isStatus) {
      if (settings.statusSeen) {
        await sock.readMessages([m.key]);
      }
      if (settings.statusReact) {
        const reactEmoji = settings.statusReactEmoji || '💖';
        await sock.sendMessage('status@broadcast', {
          react: { text: reactEmoji, key: m.key }
        }, { statusJidList: [m.key.participant] });
      }
      return;
    }

    // ─────────────────────────────────────────────
    // 8. 🎭 FAKE PRESENCE (Auto Typing / Recording)
    // ─────────────────────────────────────────────
    if (settings.fakePresence === 'typing') {
      await sock.sendPresenceUpdate('composing', jid);
    } else if (settings.fakePresence === 'recording') {
      await sock.sendPresenceUpdate('recording', jid);
    }

    // ─────────────────────────────────────────────
    // 9. 🚫 ANTI-SEND ERASER (Auto Delete Live Messages)
    // ─────────────────────────────────────────────
    if (settings.antiSend && settings.antiSend !== 'off' && !m.key.fromMe) {
      let shouldDelete = false;
      if (settings.antiSend === 'all') shouldDelete = true;
      else if (settings.antiSend === 'me' && isOwner) shouldDelete = true;
      else if (settings.antiSend === 'others' && !isOwner) shouldDelete = true;

      if (shouldDelete) {
        try {
          await sock.sendMessage(jid, { delete: m.key });
          return; // Message එක delete කර process එක නවත්වයි
        } catch (e) {}
      }
    }

    // ─────────────────────────────────────────────
    // 3. 🗑️ ANTI-DELETE (Cache Memory & Live Recovery)
    // ─────────────────────────────────────────────
    const msgId = m.key.id;

    // Protocol Message එකක් නොවන සාමාන්‍ය Message Cache කිරීම
    if (!m.message.protocolMessage) {
      global.msgStore.set(msgId, {
        message: m.message,
        sender,
        jid,
        pushName: m.pushName || 'User',
        timestamp: Date.now()
      });

      if (global.msgStore.size > 3000) {
        const firstKey = global.msgStore.keys().next().value;
        global.msgStore.delete(firstKey);
      }
    }

    // යමෙකු Delete For Everyone කළ විට (ProtocolMessage Type 0)
    if (m.message.protocolMessage && m.message.protocolMessage.type === 0) {
      if (settings.antiDelete) {
        const deletedId = m.message.protocolMessage.key.id;
        const cached = global.msgStore.get(deletedId);

        if (cached) {
          // 3. 🎯 Send Destination Logic (Inbox vs Current Chat)
          const targetJid = settings.sendDestination === 'inbox' ? botJid : cached.jid;

          const reportText = 
`> *🗑️ ANTI-DELETE DETECTED*

┌───〔 RECOVERED MESSAGE 〕
│
├ ✦ *From:* @${cached.sender.split('@')[0]}
├ ✦ *Chat:* ${cached.jid.endsWith('@g.us') ? 'Group Chat' : 'Private Inbox'}
├ ✦ *Time:* ${new Date().toLocaleTimeString()}
│
└───···▸`;

          await sock.sendMessage(targetJid, {
            text: reportText,
            mentions: [cached.sender]
          });

          // Forward the exact deleted message back
          await sock.sendMessage(targetJid, {
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
    // 2. 👁️‍🗨️ ANTI-VIEW ONCE (Instant Auto Download)
    // ─────────────────────────────────────────────
    const msgType = Object.keys(m.message)[0];
    const isViewOnce = msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2';

    if (isViewOnce && settings.antiViewOnce) {
      const targetJid = settings.sendDestination === 'inbox' ? botJid : jid;
      const innerMsg = m.message[msgType].message;
      const mediaType = Object.keys(innerMsg)[0];

      try {
        const buffer = await downloadMediaMessage(
          { key: m.key, message: innerMsg },
          'buffer',
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );

        const caption = `> *👁️‍🗨️ ANTI-VIEW ONCE CAPTURED*\n\n• *Sender:* @${sender.split('@')[0]}`;

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

    // ─────────────────────────────────────────────
    // 4. 🌐 BOT WORK TYPE (Public / Private / Group / Inbox)
    // ─────────────────────────────────────────────
    if (settings.workType === 'private' && !isOwner) return;
    if (settings.workType === 'group' && !isGroup && !isOwner) return;
    if (settings.workType === 'inbox' && isGroup && !isOwner) return;

    // ─────────────────────────────────────────────
    // ⚙️ QUOTED REPLY HANDLER (Image & Text Config Cards)
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
        qm.videoMessage?.caption || 
        '';

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

    // ─────────────────────────────────────────────
    // 🚀 COMMANDS ROUTER
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
