const fs = require('fs');
const path = require('path');
const process = require('process');

// Default configurations helper
const DEFAULT_SETTINGS = {
  antiDelete: true,
  antiViewOnce: true,
  sendDestination: 'inbox', // 'inbox' or 'chat'
  workType: 'public',       // 'public', 'private', 'group', 'inbox'
  antiCall: false,
  statusSeen: false,
  statusReact: true,
  fakePresence: 'off',      // 'typing', 'recording', 'off'
  antiSend: 'off',          // 'all', 'me', 'others', 'off'
  statusReactEmoji: '💖'
};

// In-memory / Global settings store (Per Bot Session ID)
if (!global.botSettingsMap) {
  global.botSettingsMap = new Map();
}

function getSettings(sessionId) {
  if (!global.botSettingsMap.has(sessionId)) {
    global.botSettingsMap.set(sessionId, { ...DEFAULT_SETTINGS });
  }
  return global.botSettingsMap.get(sessionId);
}

function getBotLogo() {
  const possiblePaths = [
    path.join(__dirname, '../img.png'),
    path.join(__dirname, '../../img.png'),
    path.join(process.cwd(), 'img.png')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return null;
}

function buildSettingCard(sessionId, cfg) {
  const ad = cfg.antiDelete ? '🟢 ON' : '🔴 OFF';
  const av = cfg.antiViewOnce ? '🟢 ON' : '🔴 OFF';
  const dest = cfg.sendDestination === 'inbox' ? '📥 INBOX (DM ONLY)' : '💬 CURRENT CHAT';
  const wt = cfg.workType.toUpperCase();
  const ac = cfg.antiCall ? '🟢 ON' : '🔴 OFF';
  const ss = cfg.statusSeen ? '🟢 ON' : '🔴 OFF';
  const sr = cfg.statusReact ? '🟢 ON' : '🔴 OFF';
  
  let fp = '🔴 OFF';
  if (cfg.fakePresence === 'typing') fp = '✍️ ALWAYS TYPING';
  if (cfg.fakePresence === 'recording') fp = '🎙️ ALWAYS RECORDING';

  let as = '🔴 OFF';
  if (cfg.antiSend === 'all') as = '💥 ALL MESSAGES';
  if (cfg.antiSend === 'me') as = '👤 MY MESSAGES ONLY';
  if (cfg.antiSend === 'others') as = '👥 OTHERS MESSAGES';

  return `╔═════════════════════════════╗
   🚀 𝐇𝐄𝐒𝐇𝐀𝐍 𝐎𝐅𝐂 -  𝐂 𝐎 𝐍 𝐅 𝐈 𝐆
╚═════════════════════════════╝

📱 *Session ID:* \`+${sessionId}\`
⚡ *Core Engine:* \`24/7 Multi-Device v3.5\`

╭───〔 1. 🗑️ 𝐀𝐍𝐓𝐈 - 𝐃𝐄𝐋𝐄𝐓𝐄 〕
├ 📌 *Status:* ${ad}
│
│ [ 1.1 ] 🟢 Anti-Delete ON
│ [ 1.2 ] 🔴 Anti-Delete OFF
╰─────────────────────────────

╭───〔 2. 👁️‍🗨️ 𝐀𝐍𝐓𝐈 - 𝐕𝐈𝐄𝐖 𝐎𝐍𝐂𝐄 〕
├ 📌 *Status:* ${av}
│
│ [ 2.1 ] 🟢 Anti-ViewOnce ON
│ [ 2.2 ] 🔴 Anti-ViewOnce OFF
╰─────────────────────────────

╭───〔 3. 🎯 𝐒𝐄𝐍𝐃 𝐃𝐄𝐒𝐓𝐈𝐍𝐀𝐓𝐈𝐎𝐍 〕
├ 📌 *Target:* \`${dest}\`
│
│ [ 3.1 ] 📥 Send to Owner Inbox (Secret DM)
│ [ 3.2 ] 💬 Send to Current Chat (Same Group)
╰─────────────────────────────

╭───〔 4. 🌐 𝐁𝐎𝐓 𝐖𝐎𝐑𝐊 𝐓𝐘𝐏𝐄 〕
├ 📌 *Current:* \`${wt}\`
│
│ [ 4.1 ] 🌐 Public Mode (Everyone)
│ [ 4.2 ] 🔒 Private Mode (Owner Only)
│ [ 4.3 ] 👥 Group Chats Only
│ [ 4.4 ] 💬 Inbox Chats Only
╰─────────────────────────────

╭───〔 5. 📵 𝐀𝐍𝐓𝐈 - 𝐂𝐀𝐋𝐋 〕
├ 📌 *Status:* ${ac}
│
│ [ 5.1 ] 🟢 Auto-Reject Calls ON
│ [ 5.2 ] 🔴 Auto-Reject Calls OFF
╰─────────────────────────────

╭───〔 6. 👁️ 𝐒𝐓𝐀𝐓𝐔𝐒 𝐒𝐄𝐄𝐍 〕
├ 📌 *Status:* ${ss}
│
│ [ 6.1 ] 🟢 Status Auto-Seen ON
│ [ 6.2 ] 🔴 Status Auto-Seen OFF
╰─────────────────────────────

╭───〔 7. 💖 𝐒𝐓𝐀𝐓𝐔𝐒 𝐑𝐄𝐀𝐂𝐓 〕
├ 📌 *Status:* ${sr}
│
│ [ 7.1 ] 🟢 Status Auto-React ON
│ [ 7.2 ] 🔴 Status Auto-React OFF
╰─────────────────────────────

╭───〔 8. 🎭 𝐅𝐀𝐊𝐄 𝐏𝐑𝐄𝐒𝐄𝐍𝐂𝐄 〕
├ 📌 *Current:* \`${fp}\`
│
│ [ 8.1 ] ✍️ Always Typing ON
│ [ 8.2 ] 🎙️ Always Recording ON
│ [ 8.3 ] 🛑 Presence OFF
╰─────────────────────────────

╭───〔 9. 🚫 𝐀𝐍𝐓𝐈 - 𝐒𝐄𝐍𝐃 𝐄𝐑𝐀𝐒𝐄𝐑 〕
├ 📌 *Current:* \`${as}\`
│
│ [ 9.1 ] 💥 Delete All Messages
│ [ 9.2 ] 👤 Delete My Messages Only
│ [ 9.3 ] 👥 Delete Others' Messages
│ [ 9.4 ] 🛑 Anti-Send OFF
╰─────────────────────────────

╭───〔 10. 💖 𝐒𝐓𝐀𝐓𝐔𝐒 𝐑𝐄𝐀𝐂𝐓 𝐄𝐌𝐎𝐉𝐈 〕
├ 📌 *Current:* [ ${cfg.statusReactEmoji} ]
│
│ [ 10.1 ] 💖 Pink Heart
│ [ 10.2 ] ✨ Sparkles
│ [ 10.3 ] 🔥 Fire
│ [ 10.4 ] ⚡ Lightning
│ [ 10.5 ] 🥀 Rose
│ [ 10.6 ] ➕ Custom (Reply \`10.6 <emoji>\`)
╰─────────────────────────────

> 💡 *Reply with the option number to update setting.*
> *(Example: 1.1 or 3.1 or 4.2)*`;
}

module.exports = {
  name: 'setting',
  alias: ['settings', 'config', 'cfg', 'set'],
  desc: 'Comprehensive interactive bot control dashboard',
  category: 'system',

  // Interactive Reply Handler
  onReply: async ({ sock, msg, jid, text, quotedText }) => {
    const isConfigCard = quotedText.includes('𝐃 𝐀 𝐑 𝐊 - 𝐃 𝐈 𝐍 𝐔  𝐂 𝐎 𝐍 𝐅 𝐈 𝐆');
    if (!isConfigCard) return false;

    const input = text.trim();
    const sessionId = (sock.user?.id || jid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const cfg = getSettings(sessionId);

    let changed = false;
    let messageText = '';

    // 1. Anti-Delete
    if (input === '1.1') { cfg.antiDelete = true; changed = true; messageText = '🗑️ *Anti-Delete:* \`ENABLED 🟢\`'; }
    else if (input === '1.2') { cfg.antiDelete = false; changed = true; messageText = '🗑️ *Anti-Delete:* \`DISABLED 🔴\`'; }

    // 2. Anti-ViewOnce
    else if (input === '2.1') { cfg.antiViewOnce = true; changed = true; messageText = '👁️‍🗨️ *Anti-ViewOnce:* \`ENABLED 🟢\`'; }
    else if (input === '2.2') { cfg.antiViewOnce = false; changed = true; messageText = '👁️‍🗨️ *Anti-ViewOnce:* \`DISABLED 🔴\`'; }

    // 3. Send Destination
    else if (input === '3.1') { cfg.sendDestination = 'inbox'; changed = true; messageText = '🎯 *Destination Target:* \`📥 INBOX (DM ONLY)\`'; }
    else if (input === '3.2') { cfg.sendDestination = 'chat'; changed = true; messageText = '🎯 *Destination Target:* \`💬 CURRENT CHAT\`'; }

    // 4. Work Type
    else if (input === '4.1') { cfg.workType = 'public'; changed = true; messageText = '🌐 *Work Type:* \`PUBLIC (Everyone)\`'; }
    else if (input === '4.2') { cfg.workType = 'private'; changed = true; messageText = '🔒 *Work Type:* \`PRIVATE (Owner Only)\`'; }
    else if (input === '4.3') { cfg.workType = 'group'; changed = true; messageText = '👥 *Work Type:* \`GROUPS ONLY\`'; }
    else if (input === '4.4') { cfg.workType = 'inbox'; changed = true; messageText = '💬 *Work Type:* \`INBOX ONLY\`'; }

    // 5. Anti-Call
    else if (input === '5.1') { cfg.antiCall = true; changed = true; messageText = '📵 *Auto-Reject Calls:* \`ENABLED 🟢\`'; }
    else if (input === '5.2') { cfg.antiCall = false; changed = true; messageText = '📵 *Auto-Reject Calls:* \`DISABLED 🔴\`'; }

    // 6. Status Seen
    else if (input === '6.1') { cfg.statusSeen = true; changed = true; messageText = '👁️ *Status Auto-Seen:* \`ENABLED 🟢\`'; }
    else if (input === '6.2') { cfg.statusSeen = false; changed = true; messageText = '👁️ *Status Auto-Seen:* \`DISABLED 🔴\`'; }

    // 7. Status React
    else if (input === '7.1') { cfg.statusReact = true; changed = true; messageText = '💖 *Status Auto-React:* \`ENABLED 🟢\`'; }
    else if (input === '7.2') { cfg.statusReact = false; changed = true; messageText = '💖 *Status Auto-React:* \`DISABLED 🔴\`'; }

    // 8. Fake Presence
    else if (input === '8.1') {
      cfg.fakePresence = 'typing';
      changed = true;
      messageText = '🎭 *Fake Presence:* \`✍️ ALWAYS TYPING\`';
      try { await sock.sendPresenceUpdate('composing'); } catch {}
    } else if (input === '8.2') {
      cfg.fakePresence = 'recording';
      changed = true;
      messageText = '🎭 *Fake Presence:* \`🎙️ ALWAYS RECORDING\`';
      try { await sock.sendPresenceUpdate('recording'); } catch {}
    } else if (input === '8.3') {
      cfg.fakePresence = 'off';
      changed = true;
      messageText = '🎭 *Fake Presence:* \`🛑 STOPPED (OFF)\`';
      try { await sock.sendPresenceUpdate('paused'); } catch {}
    }

    // 9. Anti-Send Eraser
    else if (input === '9.1') { cfg.antiSend = 'all'; changed = true; messageText = '🚫 *Anti-Send:* \`💥 ALL MESSAGES ERASED\`'; }
    else if (input === '9.2') { cfg.antiSend = 'me'; changed = true; messageText = '🚫 *Anti-Send:* \`👤 ERASE MY MESSAGES ONLY\`'; }
    else if (input === '9.3') { cfg.antiSend = 'others'; changed = true; messageText = '🚫 *Anti-Send:* \`👥 ERASE OTHERS MESSAGES\`'; }
    else if (input === '9.4') { cfg.antiSend = 'off'; changed = true; messageText = '🚫 *Anti-Send:* \`🛑 DISABLED (OFF)\`'; }

    // 10. Status React Emoji
    else if (input === '10.1') { cfg.statusReactEmoji = '💖'; changed = true; messageText = '💖 *Status Reaction Emoji:* \`💖\`'; }
    else if (input === '10.2') { cfg.statusReactEmoji = '✨'; changed = true; messageText = '💖 *Status Reaction Emoji:* \`✨\`'; }
    else if (input === '10.3') { cfg.statusReactEmoji = '🔥'; changed = true; messageText = '💖 *Status Reaction Emoji:* \`🔥\`'; }
    else if (input === '10.4') { cfg.statusReactEmoji = '⚡'; changed = true; messageText = '💖 *Status Reaction Emoji:* \`⚡\`'; }
    else if (input === '10.5') { cfg.statusReactEmoji = '🥀'; changed = true; messageText = '💖 *Status Reaction Emoji:* \`🥀\`'; }
    else if (input.startsWith('10.6')) {
      const customEmoji = input.replace('10.6', '').trim();
      if (customEmoji) {
        cfg.statusReactEmoji = customEmoji;
        changed = true;
        messageText = `💖 *Status Reaction Emoji:* \`${customEmoji}\``;
      }
    }

    if (!changed) return false;

    await sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } });

    // Send confirmation
    await sock.sendMessage(jid, {
      text: `> *⚡ 𝐇 𝐄 𝐒 𝐇 𝐀 𝐍 - 𝐎𝐅𝐂  𝐂 𝐎 𝐍 𝐅 𝐈 𝐆*\n\n✅ *Successfully Updated:*\n${messageText}\n\n\`\`\`Type .setting to view dashboard.\`\`\``
    }, { quoted: msg });

    return true;
  },

  // .setting Command Execution
  run: async ({ sock, msg, jid }) => {
    try {
      await sock.sendMessage(jid, { react: { text: '⚙️', key: msg.key } });

      const sessionId = (sock.user?.id || jid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      const cfg = getSettings(sessionId);

      const logoBuffer = getBotLogo();
      const cardCaption = buildSettingCard(sessionId, cfg);

      if (logoBuffer) {
        await sock.sendMessage(jid, {
          image: logoBuffer,
          caption: cardCaption
        }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, {
          text: cardCaption
        }, { quoted: msg });
      }

    } catch (err) {
      console.error('Settings Menu Error:', err);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    }
  }
};
