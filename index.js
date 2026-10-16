const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
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
async function askNethuAI(userMessage) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          { role: "system", content: config.SYSTEM_PROMPT },
          { role: "user", content: userMessage }
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
  } catch (error) {
    console.error("OpenRouter API Error:", error?.response?.data || error.message);
    return "අනේ මට පොඩ්ඩක් මහන්සියි වගේ පැටියෝ.. පස්සෙ කතා කරමුද? 🥺❤️";
  }
}

// Bot Message & Event Listener setup
function setupBotEvents(socket) {
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

    const cleanText = text.trim();
    if (!cleanText) return;

    // Group commands
    if (isGroup && cleanText.toLowerCase() === ".group on ai") {
      await GroupSetting.findOneAndUpdate(
        { groupId: jid },
        { groupId: jid, aiEnabled: true },
        { upsert: true }
      );
      await socket.sendMessage(jid, {
        text: "මෙන්න මං ආවා! දැන් මේ group එකේ මං ඔයාලත් එක්ක ඉන්නවා.. 😘🙈"
      }, { quoted: msg });
      return;
    }

    if (isGroup && cleanText.toLowerCase() === ".group off ai") {
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

    // Reaction and AI Reply
    try {
      await socket.sendMessage(jid, { react: { text: "❤️", key: msg.key } });
      await socket.sendPresenceUpdate("composing", jid);

      const aiReply = await askNethuAI(cleanText);

      await socket.sendMessage(jid, { text: aiReply }, { quoted: msg });
      await socket.sendPresenceUpdate("paused", jid);
    } catch (err) {
      console.error("Message handling error:", err);
    }
  });
}

// WhatsApp Main Startup
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

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Status:", statusCode, "Reconnecting:", shouldReconnect);
      if (shouldReconnect) {
        setTimeout(startNethuBot, 3000);
      }
    } else if (connection === "open") {
      console.log("🌸 Nethu AI Bot Connected & Online!");
    }
  });

  setupBotEvents(sock);
  return sock;
}

// Dedicated Pairing Endpoint
app.get("/pair", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "දුරකථන අංකය අවශ්‍යයි." });

  num = num.replace(/[^0-9]/g, "");

  try {
    const { state, saveCreds } = await useMongoAuthState(config.SESSION_ID);

    // දැනටමත් Session එක link වී ඇත්නම්
    if (state.creds && state.creds.registered) {
      return res.status(400).json({ error: "බොට් දැනටමත් WhatsApp එකට Link වී ඇත!" });
    }

    const { version } = await fetchLatestBaileysVersion();

    // Pairing සඳහාම පමණක් Clean Socket එකක් open කිරීම
    const pairSock = makeWASocket({
      version,
      logger: pino({ level: "fatal" }),
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.macOS("Chrome")
    });

    pairSock.ev.on("creds.update", saveCreds);

    pairSock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "open") {
        console.log("🌸 Device Linked successfully via Web Portal!");
        sock = pairSock;
        setupBotEvents(sock);
      } else if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          startNethuBot();
        }
      }
    });

    // Baileys server එකට register වීමට තත්පර 2ක් ලබාදීම
    await delay(2000);

    const code = await pairSock.requestPairingCode(num);
    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
    return res.json({ code: formattedCode });
  } catch (err) {
    console.error("Pairing Error details:", err);
    return res.status(500).json({ error: "Pairing code එක ලබාගැනීමට නොහැකි විය. අංකය නැවත පරීක්ෂා කර බලන්න." });
  }
});

// App Startup
async function startServer() {
  await connectDB(config.MONGODB_URI);
  
  app.listen(config.PORT, () => {
    console.log(`🌸 Nethu AI Pairing Web Site is live on port ${config.PORT}`);
  });

  // DB එකේ creds තියෙනවද බලලා registered නම් පමණක් bot start කරන්න
  const { state } = await useMongoAuthState(config.SESSION_ID);
  if (state.creds && state.creds.registered) {
    console.log("Existing session found. Connecting WhatsApp...");
    await startNethuBot();
  } else {
    console.log("No active session found. Waiting for pairing via Web Portal...");
  }
}

startServer().catch(console.error);
