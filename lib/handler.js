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
  if (!text.startsWith(config.PREFIX)) return;

  const [name, ...args] = text.slice(config.PREFIX.length).split(/\s+/);
  const cmd = commands.get(name.toLowerCase());
  if (!cmd) return;

  const jid = msg.key.remoteJid;
  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
  await cmd.run({ sock, msg, jid, args, text: args.join(' '), reply, prefix: config.PREFIX, commands, sessionId });
}

module.exports = { handleMessage };
