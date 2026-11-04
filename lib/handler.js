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
  // 🎵 ON-REPLY HANDLER (Prefix නැතුව 1, 2, 3 අල්ලන කොටස)
  // ==========================================
  const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = quotedMsg?.imageMessage?.caption || 
                     quotedMsg?.conversation || 
                     quotedMsg?.extendedTextMessage?.text || '';

  const isSongMenuReply = quotedText.includes('H E S H A N   O F C   M U S I C') || quotedText.includes('SELECT FORMAT');

  if (isSongMenuReply && ['1', '2', '3'].includes(text)) {
    const songCmd = commands.get('song') || commands.get('play');
    if (songCmd) {
      return await songCmd.run({ 
        sock, 
        msg, 
        jid, 
        args: [text], 
        text, 
        reply, 
        prefix: config.PREFIX, 
        commands, 
        sessionId,
        command: text 
      });
    }
  }

  // ==========================================
  // NORMAL PREFIX COMMANDS HANDLER
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
