const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const path = require("path");
const axios = require("axios");
const config = require("./config");
const { connectDB, useMongoAuthState, GroupSetting } = require("./database");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

let sock = null;

// OpenRouter AI logic
async function askNethuAI(text) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          { role: "system", content: config.SYSTEM_PROMPT },
          { role: "user", content: text }
        ],
        max_tokens: 150,
        temperature: 0.85
      },
      {
        headers: {
          "Authorization": `Bearer ${config.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data.choices[0]?.message?.content?.trim();
  } catch (err) {
    return "අනේ මට මහන්සියි වගේ පැටියෝ.. පස්සෙ කතා කරමුද? 🥺❤️";
  }
}

// Bot listeners
function registerEvents(socket) {
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const clean = text.trim();
    if (!clean) return;

    if (isGroup && clean.toLowerCase() === ".group on ai") {
      await GroupSetting.findOneAndUpdate(
        { groupId: jid },
        { groupId: jid, aiEnabled: true },
        { upsert: true }
      );
      await socket.sendMessage(jid, {
        text: "මෙන්න මං ආවා! දැන් මේ group එකේ මං ඉන්නවා.. 😘🙈"
      }, { quoted: msg });
      return;
    }

    if (isGroup && clean.toLowerCase() === ".group off ai") {
      await GroupSetting.findOneAndUpdate(
        { groupId: jid },
        { groupId: jid, aiEnabled: false },
        { upsert: true }
      );
      await socket.sendMessage(jid, {
        text: "හා හා මං යන්නම් එහෙනම්.. බායි! 🥺💔"
      }, { quoted: msg });
      return;
    }

    if (isGroup) {
      const setting = await GroupSetting.findOne({ groupId: jid });
      if (!setting || !setting.aiEnabled) return;
    }

    try {
      await socket.sendMessage(jid, { react: { text: "❤️", key: msg.key } });
      await socket.sendPresenceUpdate("composing", jid);

      const reply = await askNethuAI(clean);

      await socket.sendMessage(jid, { text: reply }, { quoted: msg });
      await socket.sendPresenceUpdate("paused", jid);
    } catch (e) {
      console.error("Message handling error:", e);
    }
  });
}

// Main permanent bot loader
async function startNethuBot() {
  const { state, saveCreds } = await useMongoAuthState(config.SESSION_ID);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.macOS("Chrome"),
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("🌸 Nethu AI Bot Connected & Online!");
      registerEvents(sock);
    } else if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed: ${statusCode}. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(startNethuBot, 3000);
      }
    }
  });

  return sock;
}

// Pairing Endpoint
app.get("/pair", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "දුරකථන අංකය අවශ්‍යයි." });

  num = num.replace(/[^0-9]/g, "");

  const { state, saveCreds } = await useMongoAuthState(config.SESSION_ID);

  if (state.creds && state.creds.registered) {
    return res.status(400).json({ error: "බොට් දැනටමත් Link වී ඇත!" });
  }

  try {
    const { version } = await fetchLatestBaileysVersion();

    const pairSock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.macOS("Chrome")
    });

    pairSock.ev.on("creds.update", saveCreds);

    let codeSent = false;

    pairSock.ev.on("connection.update", async (update) => {
      const { connection, qr } = update;

      // QR string එක හැදුණු ගමන් ඒ කියන්නේ WhatsApp Server එක connection එකට 100% Ready!
      if (qr && !codeSent) {
        codeSent = true;
        try {
          const rawCode = await pairSock.requestPairingCode(num);
          const formatted = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;
          console.log(`Pairing code issued: ${formatted}`);
          return res.json({ code: formatted });
        } catch (err) {
          console.error("Pairing code generation failed:", err);
          return res.status(500).json({ error: "Code එක generate කරගත නොහැකි විය." });
        }
      }

      if (connection === "open") {
        console.log("🌸 Pairing complete! Connected to WhatsApp.");
        sock = pairSock;
        registerEvents(sock);
      }
    });

    // තත්පර 12ක් ඇතුළත code එක generate නොවුනහොත් response එක timeout වීමෙන් වලක්වාලීම
    setTimeout(() => {
      if (!codeSent && !res.headersSent) {
        return res.status(500).json({ error: "WhatsApp server delay. කරුණාකර නැවත ඔබන්න." });
      }
    }, 12000);

  } catch (err) {
    console.error("Endpoint crash:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Server Error!" });
    }
  }
});

// App Startup
async function startServer() {
  await connectDB(config.MONGODB_URI);

  app.listen(config.PORT, () => {
    console.log(`🌸 Server running on port ${config.PORT}`);
  });

  const { state } = await useMongoAuthState(config.SESSION_ID);
  if (state.creds && state.creds.registered) {
    console.log("Saved MongoDB session found. Auto-connecting...");
    await startNethuBot();
  } else {
    console.log("No active session found. Waiting for pairing request via web UI...");
  }
}

startServer().catch(console.error);
