const config = require('../config');
const { loadCommands } = require('./loader');

const commands = loadCommands();

function getText(m) {
  const x = m.message;
  if (!x) return '';
  return x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || x.videoMessage?.caption || '';
}

async function handleMessage(sock, msg, sessionId) {
  if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
  if (config.MODE === 'self' && !msg.key.fromMe) return;

  const text = getText(msg).trim();
  const jid = msg.key.remoteJid;
  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

  // ==========================================
  // ⚡ UNIVERSAL ON-REPLY ROUTER (තනි Logic එක)
  // ==========================================
  const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quotedMsg && text) {
    const quotedText = quotedMsg?.imageMessage?.caption || 
                       quotedMsg?.conversation || 
                       quotedMsg?.extendedTextMessage?.text || '';

    // plugins වල onReply function එකක් තියෙනවද කියලා scan කර pass කිරීම
    for (const [, cmd] of commands) {
      if (typeof cmd.onReply === 'function') {
        const isHandled = await cmd.onReply({
          sock,
          msg,
          jid,
          text,
          quotedText,
          reply,
          prefix: config.PREFIX
        });
        if (isHandled) return; // Command එක handle වුණා නම් එතනින් නවත්වයි
      }
    }
  }

  // ==========================================
  // 🔘 NORMAL PREFIX COMMANDS HANDLER
  // ==========================================
  if (!text.startsWith(config.PREFIX)) return;

  const [name, ...args] = text.slice(config.PREFIX.length).split(/\s+/);
  const cmd = commands.get(name.toLowerCase());
  if (!cmd) return;

  await cmd.run({ 
    sock, 
    msg, 
    jid, 
    args, 
    text: args.join(' '), 
    reply, 
    prefix: config.PREFIX, 
    commands, 
    sessionId,
    command: name.toLowerCase()
  });
}

module.exports = { handleMessage };
