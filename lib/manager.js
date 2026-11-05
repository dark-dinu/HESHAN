// Multi-session manager: Anti-ban hardened with safe reconnection & browser masking
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
const sessions = new Map(); // id -> session state
let db; // { auth, bots }
let waVersion;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // පැරණි socket instance එකක් තිබේ නම් clean කර ඉවත් කිරීම
  if (s.sock) {
    try {
      s.sock.ev.removeAllListeners();
      s.sock.end(undefined);
    } catch {}
    s.sock = null;
  }

  const auth = await useMongoAuthState(db.auth, id);
  s.auth = auth;

  // DB එකේ link නොවුණු session තිබේ නම් ඉවත් කිරීම
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
    }, (config.PAIR_TIMEOUT_SEC || 60) * 1000);
  }

  // ✅ Anti-Ban Socket Settings & Real Chrome Mac OS Fingerprint
  const sock = makeWASocket({
    version: waVersion,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: auth.state.creds,
      keys: makeCacheableSignalKeyStore(auth.state.keys, logger)
    },
    // macOS Desktop Chrome footprint එකක් ලෙස WhatsApp servers වෙත පෙන්වීම
    browser: Browsers.macOS('Desktop'),
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    emitOwnEvents: false,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 3,
    // Bad MAC & Message Drop වැළැක්වීමේ Dummy Store Resolver
    getMessage: async (key) => {
      return { conversation: '' };
    }
  });

  s.sock = sock;
  let codeRequested = false;

  sock.ev.on('creds.update', auth.saveCreds);

  sock.ev.on('connection.update', async (u) => {
    if (s.sock !== sock || s.stopped) return;
    const { connection, lastDisconnect, qr } = u;

    // Pairing code ඉල්ලීමේ කොටස
    if (qr && !sock.authState.creds.registered && s.pairing && !codeRequested) {
      codeRequested = true;
      try {
        // WhatsApp rate limit මගහැරීමට සුළු delay එකක් තැබීම
        await sleep(2500);
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
      s.reconnectAttempts = 0; // Reset safe counter
      clearTimeout(s.timer);
      s.timer = null;
      console.log(`✅ [${id}] Connected successfully!`);

      await db.bots.updateOne({ _id: id }, { $set: { linkedAt: new Date() } }, { upsert: true });

      if (s.pairing && !s.welcomed) {
        s.welcomed = true;
        try {
          await sock.sendMessage(jidNormalizedUser(sock.user.id), {
            text: `> *⚡ HESHAN OFC MD CONNECTED*\n\n✅ *Status:* Online & Anti-Ban Active\n• Prefix: [ ${config.PREFIX || '.'} ]\n• Type *${config.PREFIX || '.'}alive* to check dashboard.`,
          });
        } catch {}
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isReplaced = statusCode === DisconnectReason.connectionReplaced;

      console.warn(`⚠️ [${id}] Connection closed. Reason code: ${statusCode || 'unknown'}`);

      if (isLoggedOut) {
        console.log(`🚪 [${id}] Session logged out by WhatsApp.`);
        return removeSession(id);
      }

      if (isReplaced) {
        console.log(`⚠️ [${id}] Session replaced by another deployment.`);
        s.status = 'replaced';
        s.stopped = true;
        return;
      }

      // Safe Reconnect Logic: Exponential Backoff (Device Lock වැළැක්වීම)
      s.status = 'reconnecting';
      s.reconnectAttempts = (s.reconnectAttempts || 0) + 1;

      // උත්සාහයන් 10කට වඩා අසාර්ථක වුවහොත් rate-limit එකෙන් බේරීමට විනාඩි 2ක් pause කිරීම
      let delay = Math.min(s.reconnectAttempts * 4000, 30000);
      if (s.reconnectAttempts > 8) delay = 120000;

      console.log(`⏳ [${id}] Reconnecting in ${delay / 1000}s (Attempt ${s.reconnectAttempts})...`);

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
      handleMessage(sock, m, id).catch((e) => {
        // Socket flood වැළැක්වීම
        if (!e.message?.includes('rate-overlimit')) {
          console.error(`[${id}] cmd error:`, e.message);
        }
      });
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
  console.log(`🗑️ [${id}] Cleaned from memory & database.`);
}

async function pair(number) {
  const cleanNumber = number.replace(/[^0-9]/g, '');
  const ex = sessions.get(cleanNumber);
  if (ex && ex.status === 'connected') return { state: 'connected', number: cleanNumber };
  if (ex) await removeSession(cleanNumber);

  if (sessions.size >= (config.MAX_SESSIONS || 10)) {
    throw new Error('Server capacity reached. Please try again later.');
  }

  await db.auth.deleteMany({ _id: { $regex: `^${cleanNumber}:` } });

  const code = await new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error('Pairing timed out. WhatsApp server delayed response. Please retry.'));
      removeSession(cleanNumber).catch(() => {});
    }, 45000);

    startSession(cleanNumber, { pairing: true }).then((s) => {
      s.waiter = {
        resolve: (c) => { clearTimeout(t); resolve(c); },
        reject: (e) => { clearTimeout(t); reject(e); },
      };
    }).catch((e) => { clearTimeout(t); reject(e); });
  });

  return { state: 'code', number: cleanNumber, code, expiresIn: config.PAIR_TIMEOUT_SEC || 60 };
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
  console.log(`♻️ Restoring ${ids.length} session(s) safely...`);
  for (const id of ids) {
    try {
      await startSession(id);
    } catch (e) {
      console.error(`[${id}] Restore failed:`, e.message);
    }
    // WhatsApp server එකට එකවර socket requests යාම වළක්වා 4s delay තැබීම
    await sleep(4000);
  }
}

module.exports = { init, pair, getStatus, connectedCount, restoreAll };
