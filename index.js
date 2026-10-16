const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const path = require("path");
const fs = require("fs");
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
    console.error("OpenRouter Error:", error?.response?.data || error.message);
    return "අනේ මට පොඩ්ඩක් මහන්සියි වගේ පැටියෝ.. පස්සෙ කතා කරමුද? 🥺❤️";
  }
}

// Bot Message & Command Listeners
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

    // Checking inbox/group permissions
    if (isGroup) {
      const setting = await GroupSetting.findOne({ groupId: jid });
      if (!setting || !setting.aiEnabled) return;
    }

    // Reaction & AI Reply
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

// Start Main Bot Engine with MongoDB Auth
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

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed (${statusCode}). Reconnecting: ${shouldReconnect}`);
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

// Pairing Endpoint
app.get("/pair", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "දුරකථන අංකය ඇතුළත් කරන්න." });

  num = num.replace(/[^0-9]/g, "");

  // Fast temp auth folder for instant pairing
  const tempDir = path.join(__dirname, "temp_" + Date.now());
  const { state, saveCreds } = await useMultiFileAuthState(tempDir);
  const { version } = await fetchLatestBaileysVersion();

  try {
    const pairSock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    pairSock.ev.on("creds.update", saveCreds);

    pairSock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        console.log("🌸 WhatsApp linked successfully! Migrating to MongoDB...");
        // Temp folder එකෙන් creds අරන් MongoDB වලට save කිරීම
        const mongoAuth = await useMongoAuthState(config.SESSION_ID);
        const credsData = JSON.parse(fs.readFileSync(path.join(tempDir, "creds.json"), "utf-8"));
        
        // MongoDB එකේ save කරන්න
        const mongoose = require("mongoose");
        const AuthModel = mongoose.model("Auth");
        await AuthModel.findOneAndUpdate(
          { sessionId: config.SESSION_ID, id: "creds" },
          { sessionId: config.SESSION_ID, id: "creds", value: JSON.stringify(credsData) },
          { upsert: true }
        );

        // Temp folder cleanup
        fs.rmSync(tempDir, { recursive: true, force: true });

        // Start permanent bot session
        await pairSock.end();
        setTimeout(startNethuBot, 2000);
      } else if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });

    // Wait 2.5 seconds for socket connection before requesting pairing code
    await delay(2500);

    const rawCode = await pairSock.requestPairingCode(num);
    const code = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;
    console.log(`Pairing Code created: ${code}`);
    return res.json({ code });
  } catch (err) {
    console.error("Pairing failure:", err);
    fs.rmSync(tempDir, { recursive: true, force: true });
    return res.status(500).json({ error: "කේතය ලබාගැනීමට නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න." });
  }
});

// App Startup
async function startServer() {
  await connectDB(config.MONGODB_URI);

  app.listen(config.PORT, () => {
    console.log(`🌸 Nethu AI Pairing Web Site is live on port ${config.PORT}`);
  });

  const { state } = await useMongoAuthState(config.SESSION_ID);
  if (state.creds && state.creds.registered) {
    console.log("Existing session found. Connecting...");
    await startNethuBot();
  } else {
    console.log("Waiting for pairing via Web Portal...");
  }
}

startServer().catch(console.error);
