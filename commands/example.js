// අලුත් command එකක් හදන්න: මේක copy කරලා නම වෙනස් කරලා .js කරන්න (උදා: hello.js)
module.exports = {
  name: 'hello',          // .hello
  alias: ['hi'],          // .hi
  desc: 'Say hello',
  run: async ({ sock, msg, jid, args, text, reply, sessionId }) => {
    await reply('Hello! 👋');
  },
};
