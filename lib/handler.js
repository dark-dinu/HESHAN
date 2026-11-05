const { proto, downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config');
const path = require('path');
const fs = require('fs');

// In-Memory Message Cache (Anti-Delete සඳහා තාවකාලිකව මැසේජ් 2000ක් memory එකේ තබා ගැනීම)
if (!global.msgStore) global.msgStore = new Map();

// Helper: DB එකෙන් Settings ලබා ගැනීම
async function getSettings(db, sessionId) {
  try {
    const data = await db.bots.findOne({ _id: sessionId });
    return Object.assign({
      antiDelete: true,
      antiViewOnce: true,
      sendDestination: 'inbox',
      workType: 'public',
      statusSeen: false,
      statusReact: true,
      fakePresence: 'off',
      statusReactEmoji: '💖'
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
    // 1. 👁️ STATUS AUTO-SEEN & 💖 STATUS AUTO-REACT
    // ─────────────────────────────────────────────
    if (isStatus) {
      if (settings.statusSeen) {
        await sock.readMessages([m.key]);
      }
      if (settings.statusReact) {
        await sock.sendMessage('status@broadcast', {
          react: { text: settings.statusReactEmoji || '💖', key: m.key }
        }, { statusJidList: [m.key.participant] });
      }
      return;
    }

    // ─────────────────────────────────────────────
    // 2. 🎭 FAKE PRESENCE (Auto Typing / Recording)
    // ─────────────────────────────────────────────
    if (settings.fakePresence === 'typing') {
      await sock.sendPresenceUpdate('composing', jid);
    } else if (settings.fakePresence === 'recording') {
      await sock.sendPresenceUpdate('recording', jid);
    }

    // ─────────────────────────────────────────────
    // 3. 🗑️ ANTI-DELETE (මැසේජ් Store කිරීම සහ Recovery)
    // ─────────────────────────────────────────────
    // Regular මැසේජ් cache එකට දැමීම
    const msgId = m.key.id;
    if (!m.message.protocolMessage) {
      global.msgStore.set(msgId, {
        message: m.message,
        sender,
        jid,
        pushName: m.pushName || 'User'
      });
      // Cache එක ලොකු වීම වැළැක්වීම (Max 2000 messages)
      if (global.msgStore.size > 2000) {
        const firstKey = global.msgStore.keys().next().value;
        global.msgStore.delete(firstKey);
      }
    }

    // යමෙකු මැසේජ් එකක් Revoke/Delete කළ විට
    if (m.message.protocolMessage && m.message.protocolMessage.type === 0) {
      if (settings.antiDelete) {
        const deletedId = m.message.protocolMessage.key.id;
        const cached = global.msgStore.get(deletedId);

        if (cached) {
          const targetJid = settings.sendDestination === 'inbox' ? botJid : cached.jid;
          const reportText = `> *🗑️ ANTI-DELETE DETECTED*\n\n` +
            `• *From:* @${cached.sender.split('@')[0]}\n` +
            `• *Chat:* ${cached.jid.endsWith('@g.us') ? 'Group Chat' : 'Inbox'}\n` +
            `• *Time:* ${new Date().toLocaleTimeString()}`;

          await sock.sendMessage(targetJid, {
            text: reportText,
            mentions: [cached.sender]
          });

          // මැකූ Original Message එක නැවත යැවීම
          await sock.sendMessage(targetJid, { forward: { key: { remoteJid: cached.jid, id: deletedId }, message: cached.message } });
        }
      }
      return;
    }

    // ─────────────────────────────────────────────
    // 4. 👁️‍🗨️ ANTI-VIEW ONCE (ViewOnce Media Recovery)
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

        const caption = `> *👁️‍🗨️ ANTI-VIEW ONCE CAPTURED*\n\n• *From:* @${sender.split('@')[0]}`;

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
    // 5. 🌐 BOT WORK TYPE (Public / Private Filtering)
    // ─────────────────────────────────────────────
    if (settings.workType === 'private' && !isOwner) return;
    if (settings.workType === 'group' && !isGroup && !isOwner) return;
    if (settings.workType === 'inbox' && isGroup && !isOwner) return;

    // ─────────────────────────────────────────────
    // 6. ⚙️ COMMANDS & ONREPLY EXECUTION
    // ─────────────────────────────────────────────
    const textMsg = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const prefix = config.PREFIX || '.';

    // Reply Handler (Settings Card එකට 1.1, 11.1 ආදී වශයෙන් අංක Reply කරන විට)
    if (m.message.extendedTextMessage?.contextInfo?.quotedMessage) {
      const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
      const quotedText = quoted.conversation || quoted.extendedTextMessage?.text || '';

      const settingCmd = require('../commands/setting');
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

    // Normal Command Execution
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
    console.error('Handler runtime error:', err);
  }
}

module.exports = { handleMessage };
