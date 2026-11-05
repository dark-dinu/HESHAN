// Multi-session manager: 100% Stable Official Windows Chrome Pairing
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const config = require('../config');
const { useMongoAuthState } = require('./mongoAuth');
const { handleMessage } = require('./handler');

const logger = pino({ level: 'silent' });
const sessions = new Map();
let db;
let waVersion;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getLogoBuffer() {
  const possiblePaths = [
    path.join(__dirname, '../img.png'),
    path.join(__dirname, '../../img.png'),
    path.join(process.cwd(), 'img.png')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return null;
}

async function init(database) {
  db = database;
  try {
    const v = await fetchLatestBaileysVersion();
    waVersion = v.version;
  } catch {
    waVersion = [2, 3000, 1017531287];
  }
}

async function startSession(id, opts = {}) {
  let s = sessions.get(id);
  if (!s) {
    s = {
      id,
      status: 'connecting',
      pairingCode: null,
      stopped: false,
      pairing: !!opts.pairing,
      welcomed: false,
      reconnectAttempts: 0,
      activeTimer: null
    };
    sessions.set(id, s);
  }
  s.stopped = false;

  // පැරණි socket instance එකක් තිබේ නම් සම්පූර්ණයෙන්ම ඉවත් කිරීම
  if (s.sock) {
    try {
      s.sock.ev.removeAllListeners();
      s.sock.end(undefined);
    } catch {}
    s.sock = null;
  }

  const auth = await useMongoAuthState(db.auth, id);
  s.auth = auth;

  // ලින්ක් නොවූ session එකක් නම් ඉවත් කිරීම
  if (!auth.state.creds.registered && !s.pairing) {
    await removeSession(id);
    return null;
  }

  if (s.pairing && !s.timer) {
    s.timer = setTimeout(() => {
      const cur = sessions.get(id);
      if (cur === s && s.status !== 'connected') {
        console.log(`⌛ [${id}] Pairing expired`);
        removeSession(id).catch(() => {});
      }
    }, (config.PAIR_TIMEOUT_SEC || 120) * 1000);
  }

  // Official Windows Chrome Web Handshake (Couldn't link device error එක වළක්වන setup එක)
  const sock = makeWASocket({
    version: waVersion || [2, 3000, 1017531287],
    logger,
    printQRInTerminal: false,
    auth: {
      creds: auth.state.creds,
      keys: makeCacheableSignalKeyStore(auth.state.keys, logger)
    },
    browser: Browsers.windows('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    emitOwnEvents: false,
    defaultQueryTimeoutMs: 60000,
    getMessage: async () => ({ conversation: '' })
  });

  s.sock = sock;
  let codeRequested = false;

  sock.ev.on('creds.update', auth.saveCreds);

  sock.ev.on('connection.update', async (u) => {
    if (s.sock !== sock || s.stopped) return;
    const { connection, lastDisconnect, qr } = u;

    // Pairing Code Request Logic
    if (!sock.authState.creds.registered && s.pairing && !codeRequested) {
      codeRequested = true;
      try {
        await sleep(1500);
        const code = await sock.requestPairingCode(id);
        s.pairingCode = code;
        s.status = 'waiting';
        console.log(`🔑 [${id}] Pairing code generated: ${code}`);
        s.waiter?.resolve(code);
        s.waiter = null;
      } catch (e) {
        console.error(`❌ [${id}] Pairing request failed:`, e.message);
        s.waiter?.reject(new Error('Pairing code generation failed. Rate limited by WhatsApp.'));
        s.waiter = null;
        removeSession(id).catch(() => {});
      }
    }

    if (connection === 'open') {
      s.status = 'connected';
      s.pairingCode = null;
      s.reconnectAttempts = 0;
      clearTimeout(s.timer);
      s.timer = null;
      console.log(`✅ [${id}] Connected successfully!`);

      await db.bots.updateOne({ _id: id }, { $set: { linkedAt: new Date() } }, { upsert: true });

      if (s.pairing && !s.welcomed) {
        s.welcomed = true;
        try {
          const logoBuffer = getLogoBuffer();
          const targetJid = jidNormalizedUser(sock.user.id);

          const welcomeCaption = 
`> *⚡ H E S H A N   O F C   M D*

┌───〔 BOT CONNECTED 〕
│
├ ✦ *Status:* Online & Active 🟢
├ ✦ *Security:* Shield Active 🛡️
├ ✦ *Engine:* Baileys Multi-Device
├ ✦ *Prefix:* [ ${config.PREFIX || '.'} ]
│
└───〔 QUICK START 〕
│
├▸ *${config.PREFIX || '.'}menu*  ➯ Command Dashboard
├▸ *${config.PREFIX || '.'}alive* ➯ System Diagnostics
│
└────────────···▸

\`\`\`➥ Ready to automate chats & media streams!\`\`\`

> *Media Automation Engine*`;

          if (logoBuffer) {
            await sock.sendMessage(targetJid, {
              image: logoBuffer,
              caption: welcomeCaption
            });
          } else {
            await sock.sendMessage(targetJid, {
              text: welcomeCaption
            });
          }
        } catch (e) {
          console.error(`[${id}] Welcome error:`, e.message);
        }
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isReplaced = statusCode === DisconnectReason.connectionReplaced;

      console.warn(`⚠️ [${id}] Connection closed. Code: ${statusCode || 'unknown'}`);

      if (isLoggedOut) {
        console.log(`🚪 [${id}] Session logged out.`);
        return removeSession(id);
      }

      if (isReplaced) {
        s.status = 'replaced';
        s.stopped = true;
        return;
      }

      s.status = 'reconnecting';
      s.reconnectAttempts = (s.reconnectAttempts || 0) + 1;

      let delay = Math.min(s.reconnectAttempts * 3000, 20000);

      clearTimeout(s.activeTimer);
      s.activeTimer = setTimeout(() => {
        if (!s.stopped && sessions.get(id) === s) {
          startSession(id).catch((e) => console.error(`[${id}] Restart error:`, e.message));
        }
      }, delay);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      handleMessage(sock, m, id).catch((e) => {});
    }
  });

  return s;
}

async function removeSession(id) {
  const s = sessions.get(id);
  if (s) {
    s.stopped = true;
    clearTimeout(s.timer);
    clearTimeout(s.activeTimer);
    s.waiter?.reject(new Error('Session stopped'));
    try {
      s.sock?.ev?.removeAllListeners();
      s.sock?.end(undefined);
    } catch {}
    sessions.delete(id);
  }
  await db.bots.deleteOne({ _id: id });
  await db.auth.deleteMany({ _id: { $regex: `^${id}:` } });
}

async function pair(number) {
  const cleanNumber = number.replace(/[^0-9]/g, '');
  const ex = sessions.get(cleanNumber);
  if (ex) await removeSession(cleanNumber);

  // Database එකේ ඇති පැරණි incomplete records ඉවත් කිරීම
  await db.bots.deleteOne({ _id: cleanNumber });
  await db.auth.deleteMany({ _id: { $regex: `^${cleanNumber}:` } });

  const code = await new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error('Pairing timed out. Please retry.'));
      removeSession(cleanNumber).catch(() => {});
    }, 45000);

    startSession(cleanNumber, { pairing: true }).then((s) => {
      s.waiter = {
        resolve: (c) => { clearTimeout(t); resolve(c); },
        reject: (e) => { clearTimeout(t); reject(e); },
      };
    }).catch((e) => { clearTimeout(t); reject(e); });
  });

  return { state: 'code', number: cleanNumber, code, expiresIn: config.PAIR_TIMEOUT_SEC || 120 };
}

function getStatus(number) {
  const cleanNumber = number.replace(/[^0-9]/g, '');
  const s = sessions.get(cleanNumber);
  if (!s) return { status: 'none' };
  return { status: s.status, code: s.pairingCode };
}

function connectedCount() {
  let n = 0;
  for (const s of sessions.values()) if (s.status === 'connected') n++;
  return n;
}

async function restoreAll() {
  const ids = (await db.bots.find({}).project({ _id: 1 }).toArray()).map((d) => d._id);
  console.log(`♻️ Restoring ${ids.length} session(s)...`);
  for (const id of ids) {
    try {
      await startSession(id);
    } catch (e) {
      console.error(`[${id}] Restore error:`, e.message);
    }
    await sleep(3000);
  }
}

module.exports = { init, pair, getStatus, connectedCount, restoreAll };
