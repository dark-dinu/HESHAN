module.exports = {
  name: 'ping',
  alias: ['p'],
  desc: 'Bot speed check',
  run: async ({ sock, msg, jid }) => {
    const start = Date.now();
    const sent = await sock.sendMessage(jid, { text: '🏓 Pinging...' }, { quoted: msg });
    const ms = Date.now() - start;
    await sock.sendMessage(jid, { text: `🏓 *Pong!* ${ms}ms`, edit: sent.key });
  },
};
