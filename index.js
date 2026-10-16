const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
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

// OpenRouter AI Call
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

// Bot Messages & Commands
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

    // Group commands
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
      console.error("Message Error:", e);
    }
  });
}

// Core WhatsApp Connection
async function startNethuBot() {
  const { state, saveCreds } = await useMongoAuthState(config.SESSION_ID);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("🌸 Nethu AI Bot සම්පූර්ණයෙන් Auto-Connect වී සක්‍රීයයි!");
    } else if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`සම්බන්ධතාව විසන්ධි විය (${statusCode}). නැවත සම්බන්ධ වෙමින්: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(startNethuBot, 3000);
      }
    }
  });

  registerEvents(sock);
  return sock;
}

// Pairing Endpoint
app.get("/pair", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "දුරකථන අංකය අවශ්‍යයි." });

  num = num.replace(/[^0-9]/g, "");

  try {
    const { state, saveCreds } = await useMongoAuthState(config.SESSION_ID);

    if (state.creds && state.creds.registered) {
      return res.status(400).json({ error: "බොට් දැනටමත් Link වී ඇත!" });
    }

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "open") {
        console.log("🌸 WhatsApp Pair වීම සාර්ථකයි! Session එක MongoDB හි Save විය.");
        registerEvents(sock);
      } else if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          startNethuBot();
        }
      }
    });

    // WebSocket handshake එක සඳහා ප්‍රමාණවත් කාලයක් ලබා දීම
    await delay(5000);

    const rawCode = await sock.requestPairingCode(num);
    const code = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;
    console.log(`Pairing code එක ලබාදුන්නා: ${code}`);

    return res.json({ code });
  } catch (err) {
    console.error("Pairing failure:", err);
    return res.status(500).json({ error: "කේතය ලබාගැනීමට නොහැකි විය. කරුණාකර තත්පර 10කින් නැවත උත්සාහ කරන්න." });
  }
});

// App Startup
async function startServer() {
  await connectDB(config.MONGODB_URI);

  app.listen(config.PORT, () => {
    console.log(`🌸 Nethu AI Server එක Port ${config.PORT} හි ක්‍රියාත්මකයි.`);
  });

  const { state } = await useMongoAuthState(config.SESSION_ID);
  if (state.creds && state.creds.registered) {
    console.log("පවතින Session එක හමු විය. Auto Connecting...");
    await startNethuBot();
  } else {
    console.log("නව Session එකක් නොමැත. Pairing Site එක මඟින් Link කරන්න.");
  }
}

startServer().catch(console.error);
