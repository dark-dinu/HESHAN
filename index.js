const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const path = require("path");
const axios = require("axios");
const config = require("./config");
const {
  connectDB,
  useMongoAuthState,
  clearSession,
  GroupSetting,
  Memory
} = require("./database");

// වෙනම වෙන් කරගත් Ping කමාන්ඩ් එක රික්වෙයාර් කරගැනීම
const pingCommand = require("./commands/ping");

const logger = pino({ level: process.env.LOG_LEVEL || "warn" });
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

let sock = null;          // දැනට active socket එක
let connected = false;    // WhatsApp open ද?
let registered = false;   // Link වී ඇත්ද?
let pending = null;       // pairing request එකක් පොරොත්තුවෙන්ද

// බොට් විසින්ම යවන මැසේජ් හඳුනාගෙන infinite loop වැළැක්වීමට
const sentMessages = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- AI ---------------- */
async function getHistory(jid) {
  const m = await Memory.findOne({ jid }).lean();
  return (m?.messages || [])
    .slice(-config.HISTORY_LIMIT)
    .map(({ role, content }) => ({ role, content }));
}

async function remember(jid, user, assistant) {
  await Memory.updateOne(
    { jid },
    {
      $push: {
        messages: {
          $each: [
            { role: "user", content: user },
            { role: "assistant", content: assistant }
          ],
          $slice: -30 } },$set: { updatedAt: new Date() }
    },
    { upsert: true }
  );
}

async function askNethuAI(jid, text) {
  const fallback = "අනේ මට මහන්සියි වගේ පැටියෝ.. පස්සෙ කතා කරමුද? 🥺❤️";
  if (!config.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY සකසා නැත!");
    return fallback;
  }
  const history = await getHistory(jid).catch(() => []);
  for (const model of config.MODELS) {
    try {
      const res = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          messages: [
            { role: "system", content: config.SYSTEM_PROMPT },
            ...history,
            { role: "user", content: text }
          ],
          max_tokens: 200,
          temperature: 0.85
        },
        {
          timeout: 30000,
          headers: {
            Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );
      const reply = res.data?.choices?.[0]?.message?.content?.trim();
      if (reply) {
        remember(jid, text, reply).catch(() => {});
        return reply;
      }
    } catch (err) {
      console.error(`AI error (${model}):`, err.response?.status || err.message);
    }
  }
  return fallback;
}

/* ---------------- Message handling ---------------- */
function extractText(message) {
  if (!message) return "";
  const m = normalizeMessageContent(message) || message;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.ephemeralMessage?.message?.extendedTextMessage?.text ||
    m.ephemeralMessage?.message?.conversation ||
    m.viewOnceMessage?.message?.imageMessage?.caption ||
    m.viewOnceMessage?.message?.videoMessage?.caption ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ""
  ).trim();
}

async function sendSafeMessage(socket, jid, content, options = {}) {
  const sent = await socket.sendMessage(jid, content, options);
  if (sent?.key?.id) {
    sentMessages.add(sent.key.id);
    setTimeout(() => sentMessages.delete(sent.key.id), 60000);
  }
  return sent;
}

function registerEvents(socket) {
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`📩 messages.upsert type=${type} count=${messages.length}`);
    if (type !== "notify" && type !== "append") return;
    for (const msg of messages) {
      try {
        await handleMessage(socket, msg);
      } catch (e) {
        console.error("Message handling error:", e && e.stack ? e.stack : e);
      }
    }
  });
}

async function handleMessage(socket, msg) {
  if (!msg || !msg.key) return;

  // බොට් විසින්ම යැවූ මැසේජ් එකක් නම් නොසලකා හරින්න
  if (sentMessages.has(msg.key.id)) return;

  if (!msg.message) {
    console.log(`⚠️ Message content හිස්! (Decryption අසාර්ථකයි හෝ System event එකක්): id=${msg.key.id} jid=${msg.key.remoteJid}`);
    return;
  }

  if (
    msg.message.protocolMessage ||
    msg.message.reactionMessage ||
    msg.message.senderKeyDistributionMessage
  ) {
    return;
  }

  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@newsletter")) return;

  const isGroup = jid.endsWith("@g.us");
  const clean = extractText(msg.message);
  if (!clean) {
    console.log(`ℹ️ Text එකක් නැති මැසේජ් එකක්: keys=${Object.keys(msg.message).join(",")}`);
    return;
  }

  const lower = clean.toLowerCase();
  console.log(`💬 msg jid=${jid} fromMe=${!!msg.key.fromMe} group=${isGroup} len=${clean.length} text="${clean}"`);

  // .ping කමාන්ඩ් එක commands/ping.js ෆයිල් එකෙන් ක්‍රියාත්මක වීම
  if (lower === pingCommand.name) {
    await pingCommand.execute(socket, msg, clean);
    return;
  }

  // Group commands
  if (isGroup && lower === ".group on ai") {
    await GroupSetting.updateOne({ groupId: jid }, { $set: { aiEnabled: true } }, { upsert: true });
    await sendSafeMessage(socket, jid, { text: "මෙන්න මං ආවා! දැන් මේ group එකේ මං ඉන්නවා.. 😘🙈" }, { quoted: msg });
    return;
  }
  if (isGroup && lower === ".group off ai") {
    await GroupSetting.updateOne({ groupId: jid }, { $set: { aiEnabled: false } }, { upsert: true });
    await sendSafeMessage(socket, jid, { text: "හා හා මං යන්නම් එහෙනම්.. බායි! 🥺💔" }, { quoted: msg });
    return;
  }

  const botNumber = socket.user?.id ? socket.user.id.split(":")[0] + "@s.whatsapp.net" : "";
  const botLid = socket.user?.lid ? socket.user.lid.split(":")[0] + "@lid" : "";
  const isSelfChat = jid === botNumber || (botLid && jid === botLid);

  if (msg.key.fromMe && !isSelfChat) return;

  if (isGroup) {
    const setting = await GroupSetting.findOne({ groupId: jid }).lean();
    if (!setting || !setting.aiEnabled) return;
  }

  await socket.sendMessage(jid, { react: { text: "❤️", key: msg.key } }).catch(() => {});
  await socket.sendPresenceUpdate("composing", jid).catch(() => {});
  const reply = await askNethuAI(jid, clean);
  await sendSafeMessage(socket, jid, { text: reply }, { quoted: msg });
  await socket.sendPresenceUpdate("paused", jid).catch(() => {});
}

/* ---------------- WhatsApp connection ---------------- */
async function getVersion() {
  try {
    const { version } = await fetchLatestBaileysVersion();
    return version;
  } catch {
    return undefined;
  }
}

async function startSocket({ pairNumber, onCode, onError } = {}) {
  const { state, saveCreds } = await useMongoAuthState(config.SESSION_ID);
  registered = !!state.creds.registered;
  const version = await getVersion();

  if (sock) {
    const old = sock;
    sock = null;
    try { old.ev.removeAllListeners(); old.end(undefined); } catch {}
  }

  const s = makeWASocket({
    ...(version ? { version } : {}),
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: false,
    markOnlineOnConnect: true,
    getMessage: async () => undefined
  });
  sock = s;
  connected = false;

  s.ev.on("creds.update", async () => {
    await saveCreds();
    registered = !!state.creds.registered;
  });
  registerEvents(s);

  let codeRequested = false;
  s.ev.on("connection.update", async (update) => {
    if (s !== sock) return;
    const { connection, lastDisconnect, qr } = update;

    if (pairNumber && qr && !codeRequested && !state.creds.registered) {
      codeRequested = true;
      try {
        const raw = await s.requestPairingCode(pairNumber);
        const code = raw?.match(/.{1,4}/g)?.join("-") || raw;
        console.log(`Pairing code issued: ${code}`);
        onCode && onCode(code);
      } catch (err) {
        console.error("Pairing code generation failed:", err.message);
        onError && onError(err);
      }
    }

    if (connection === "open") {
      connected = true;
      registered = true;
      pending = null;
      console.log("🌸 Nethu AI Bot Connected & Online!");
    }

    if (connection === "close") {
      connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`Connection closed: ${code}`);

      if (code === DisconnectReason.loggedOut) {
        console.log("Logged out. Session clear කරනවා...");
        sock = null;
        registered = false;
        await clearSession(config.SESSION_ID).catch(() => {});
        return;
      }

      if (code === DisconnectReason.restartRequired) {
        await sleep(1000);
        return startSocket().catch((e) => console.error("Restart failed:", e.message));
      }

      if (!state.creds.registered) {
        sock = null;
        return;
      }

      await sleep(3000);
      startSocket().catch((e) => console.error("Reconnect failed:", e.message));
    }
  });

  return s;
}

/* ---------------- HTTP endpoints ---------------- */
function checkKey(req, res) {
  if (config.PAIR_KEY && req.query.key !== config.PAIR_KEY) {
    res.status(401).json({ error: "Access key වැරදියි." });
    return false;
  }
  return true;
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/status", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ connected, registered, needsKey: !!config.PAIR_KEY });
});

app.get("/pair", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!checkKey(req, res)) return;

  const num = String(req.query.number || "").replace(/[^0-9]/g, "");
  if (num.length < 9 || num.length > 15) {
    return res.status(400).json({ error: "රටේ කේතය සමඟ නිවැරදි අංකයක් ඇතුළත් කරන්න (උදා: 94771234567)." });
  }
  if (registered) {
    return res.status(400).json({ error: "බොට් දැනටමත් Link වී ඇත! (Auto connect වෙමින් පවතී)" });
  }

  try {
    await clearSession(config.SESSION_ID);

    let done = false;
    const finish = (fn) => (arg) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(arg);
    };
    const timer = setTimeout(
      finish(() => res.status(504).json({ error: "WhatsApp server delay. නැවත උත්සාහ කරන්න." })),
      25000
    );

    pending = { number: num, at: Date.now() };
    await startSocket({
      pairNumber: num,
      onCode: finish((code) => res.json({ code })),
      onError: finish(() => res.status(500).json({ error: "Code එක generate කරගත නොහැකි විය. අංකය පරීක්ෂා කරන්න." }))
    });
  } catch (err) {
    console.error("Pair endpoint error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Server Error!" });
  }
});

/* ---------------- Startup ---------------- */
async function startServer() {
  await connectDB(config.MONGODB_URI);

  app.listen(config.PORT, () => console.log(`🌸 Server running on port ${config.PORT}`));

  const { state } = await useMongoAuthState(config.SESSION_ID);
  if (state.creds.registered) {
    console.log("Saved MongoDB session found. Auto-connecting...");
    await startSocket();
  } else {
    console.log("No active session found. Waiting for pairing request via web UI...");
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(() => {
      axios.get(`${process.env.RENDER_EXTERNAL_URL}/health`).catch(() => {});
    }, 10 * 60 * 1000);
  }
}

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));

startServer().catch((e) => {
  console.error(e);
  process.exit(1);
});
