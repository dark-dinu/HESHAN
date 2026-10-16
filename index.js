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
const { connectDB, saveSessionToMongo, getSessionFromMongo, GroupSetting } = require("./database");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const SESSION_DIR = path.join(__dirname, "auth_info_baileys");
let sock = null;

// AI Chat function
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

// Bot listeners
function setupBotEvents(client) {
  client.ev.on("messages.upsert", async ({ messages, type }) => {
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

    if (isGroup && cleanText.toLowerCase() === ".group on ai") {
      await GroupSetting.findOneAndUpdate(
        { groupId: jid },
        { groupId: jid, aiEnabled: true },
        { upsert: true }
      );
      await client.sendMessage(jid, {
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
      await client.sendMessage(jid, {
        text: "හා හා මං යන්නම් එහෙනම්.. බායි! 🥺💔"
      }, { quoted: msg });
      return;
    }

    if (isGroup) {
      const setting = await GroupSetting.findOne({ groupId: jid });
      if (!setting || !setting.aiEnabled) return;
    }

    try {
      await client.sendMessage(jid, { react: { text: "❤️", key: msg.key } });
      await client.sendPresenceUpdate("composing", jid);

      const aiReply = await askNethuAI(cleanText);

      await client.sendMessage(jid, { text: aiReply }, { quoted: msg });
      await client.sendPresenceUpdate("paused", jid);
    } catch (err) {
      console.error("Message handling error:", err);
    }
  });
}

// Backup session directory to single string in MongoDB
async function backupSession() {
  try {
    if (!fs.existsSync(SESSION_DIR)) return;
    const files = fs.readdirSync(SESSION_DIR);
    const sessionObj = {};
    for (const file of files) {
      sessionObj[file] = fs.readFileSync(path.join(SESSION_DIR, file), "base64");
    }
    await saveSessionToMongo(config.SESSION_ID, JSON.stringify(sessionObj));
    console.log("Session successfully backed up to MongoDB.");
  } catch (e) {
    console.error("Backup error:", e);
  }
}

// Restore session from MongoDB to local directory
async function restoreSession() {
  try {
    const rawData = await getSessionFromMongo(config.SESSION_ID);
    if (!rawData) return false;
    const sessionObj = JSON.parse(rawData);
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
    for (const [file, b64] of Object.entries(sessionObj)) {
      fs.writeFileSync(path.join(SESSION_DIR, file), Buffer.from(b64, "base64"));
    }
    return true;
  } catch (e) {
    console.error("Restore error:", e);
    return false;
  }
}

// Start WhatsApp Client
async function startNethuBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: ["Chrome (Linux)", "", ""]
  });

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    await backupSession();
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("🌸 Nethu AI Bot Connected & Logged in successfully!");
      await backupSession();
      setupBotEvents(sock);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed: ${statusCode}. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(startNethuBot, 3000);
      } else {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      }
    }
  });

  return sock;
}

// Web Pairing Endpoint
app.get("/pair", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "අංකය අවශ්‍යයි." });

  num = num.replace(/[^0-9]/g, "");

  // Clean old session folder if not registered
  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  try {
    sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      browser: ["Chrome (Linux)", "", ""]
    });

    sock.ev.on("creds.update", async () => {
      await saveCreds();
      await backupSession();
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection } = update;
      if (connection === "open") {
        console.log("🌸 WhatsApp Pair Completed and Logged in!");
        await backupSession();
        setupBotEvents(sock);
      }
    });

    // Handshake delay for Baileys socket
    await delay(3000);

    const code = await sock.requestPairingCode(num);
    const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
    console.log(`Pairing Code Created: ${formatted}`);
    return res.json({ code: formatted });
  } catch (err) {
    console.error("Pairing API error:", err);
    return res.status(500).json({ error: "කේතය ලබාගැනීමට නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න." });
  }
});

// App Startup
async function startServer() {
  await connectDB(config.MONGODB_URI);

  app.listen(config.PORT, () => {
    console.log(`🌸 Nethu AI Linker is running on port ${config.PORT}`);
  });

  const hasSession = await restoreSession();
  if (hasSession && fs.existsSync(path.join(SESSION_DIR, "creds.json"))) {
    console.log("Restored previous session from MongoDB. Connecting...");
    await startNethuBot();
  } else {
    console.log("No valid session found. Waiting for pairing code request...");
  }
}

startServer().catch(console.error);
