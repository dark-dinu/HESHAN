// Multi-session manager: Reverted to Original Stable Baileys Engine
const pino = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
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

async function init(database) {
  db = database;
  try {
    const v = await fetchLatestBaileysVersion();
    waVersion = v.version;
  } catch {
    waVersion = undefined;
  }
}

async function startSession(id, opts = {}) {
  let s = sessions.get(id);
  if (!s) {
    s = { id, status: 'connecting', pairingCode: null, stopped: false, pairing: !!opts.pairing, welcomed: false };
    sessions.set(id, s);
  }
  s.stopped = false;

  const auth = await useMongoAuthState(db.auth, id);
  s.auth = auth;

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
    }, config.PAIR_TIMEOUT_SEC * 1000);
  }

  // ✅ ඔයාගේ මුල්ම 100% වැඩ කරපු Original Socket Setup එක
  const sock = makeWASocket({
    version: waVersion,
    logger,
    auth: auth.state,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  s.sock = sock;
  let codeRequested = false;

  sock.ev.on('creds.update', auth.saveCreds);

  sock.ev.on('connection.update', async (u) => {
    if (s.sock !== sock || s.stopped) return;
    const { connection, lastDisconnect, qr } = u;

    if (qr && !sock.authState.creds.registered && s.pairing && !codeRequested) {
      codeRequested = true;
      try {
        const code = await sock.requestPairingCode(id);
        s.pairingCode = code;
        s.status = 'waiting';
        console.log(`🔑 [${id}] Pairing code: ${code}`);
        s.waiter?.resolve(code);
        s.waiter = null;
      } catch (e) {
        console.error(`[${id}] pairing error:`, e.message);
        s.waiter?.reject(new Error('Pairing code එක ගන්න බැරි උනා. Number එක පරීක්ෂා කරලා ආයෙ try කරන්න.'));
        s.waiter = null;
        removeSession(id).catch(() => {});
      }
    }

    if (connection === 'open') {
      s.status = 'connected';
      s.pairingCode = null;
      clearTimeout(s.timer);
      s.timer = null;
      console.log(`✅ [${id}] connected`);
      await db.bots.updateOne({ _id: id }, { $set: { linkedAt: new Date() } }, { upsert: true });

      if (s.pairing && !s.welcomed) {
        s.welcomed = true;
        try {
          await sock.sendMessage(jidNormalizedUser(sock.user.id), {
            text: `✅ *${config.BOT_NAME}* සාර්ථකව සම්බන්ධ උනා!\n\n${config.PREFIX}ping කියලා type කරලා බලන්න 🏓`,
          });
        } catch {}
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log(`🚪 [${id}] logged out`);
        return removeSession(id);
      }
      if (code === DisconnectReason.connectionReplaced) {
        console.log(`⚠️  [${id}] connection replaced - stopping this instance`);
        s.status = 'replaced';
        s.stopped = true;
        return;
      }
      s.status = 'reconnecting';
      setTimeout(() => {
        if (!s.stopped && sessions.get(id) === s) {
          startSession(id).catch((e) => console.error(e.message));
        }
      }, 3000);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      handleMessage(sock, m, id).catch((e) => console.error(`[${id}] cmd error:`, e.message));
    }
  });

  return s;
}

async function removeSession(id) {
  const s = sessions.get(id);
  if (s) {
    s.stopped = true;
    clearTimeout(s.timer);
    s.waiter?.reject(new Error('Session එක නතර උනා'));
    try { s.sock?.end(undefined); } catch {}
    sessions.delete(id);
  }
  await db.bots.deleteOne({ _id: id });
  await db.auth.deleteMany({ _id: { $regex: `^${id}:` } });
}

async function pair(number) {
  const ex = sessions.get(number);
  if (ex && ex.status === 'connected') return { state: 'connected', number };
  if (ex) await removeSession(number);

  if (sessions.size >= config.MAX_SESSIONS) {
    throw new Error('මේ bot server එක පිරිලා. පස්සෙ try කරන්න.');
  }

  await db.auth.deleteMany({ _id: { $regex: `^${number}:` } });

  const code = await new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error('Pairing code එක එන්න ගියේ වැඩි වෙලාවක්. ආයෙ try කරන්න.'));
      removeSession(number).catch(() => {});
    }, 30000);

    startSession(number, { pairing: true }).then((s) => {
      s.waiter = {
        resolve: (c) => { clearTimeout(t); resolve(c); },
        reject: (e) => { clearTimeout(t); reject(e); },
      };
    }).catch((e) => { clearTimeout(t); reject(e); });
  });

  return { state: 'code', number, code, expiresIn: config.PAIR_TIMEOUT_SEC };
}

function getStatus(number) {
  const s = sessions.get(number);
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
  console.log(`♻️  Restoring ${ids.length} session(s)...`);
  for (const id of ids) {
    try {
      await startSession(id);
    } catch (e) {
      console.error(`[${id}] restore failed:`, e.message);
    }
    await sleep(1500);
  }
}

module.exports = { init, pair, getStatus, connectedCount, restoreAll };
