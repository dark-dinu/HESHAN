module.exports = {
  name: ".ping",
  description: "Bot online ද බලන්න",
  async execute(socket, msg, text) {
    const jid = msg.key.remoteJid;
    await socket.sendMessage(jid, { text: "pong 🏓 Nethu online ❤️" }, { quoted: msg });
  }
};
