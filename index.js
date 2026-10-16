const { MongoClient } = require('mongodb');
const config = require('./config');
const manager = require('./lib/manager');
const { createServer } = require('./lib/server');

if (!config.MONGODB_URL || config.MONGODB_URL.includes('PASTE_YOUR')) {
  console.error('❌ config.js එකේ MONGODB_URL එක දාන්න!');
  process.exit(1);
}

// Render port එක ඉක්මනට bind කරනවා
createServer(manager).listen(config.PORT, () => console.log(`🌐 Pair site running on port ${config.PORT}`));

// Render free plan නිදා නොගන්න self-ping
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => fetch(process.env.RENDER_EXTERNAL_URL + '/health').catch(() => {}), 4 * 60 * 1000);
}

(async () => {
  const client = new MongoClient(config.MONGODB_URL, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const database = client.db('whatsapp_bot');
  console.log('🗄️  MongoDB connected');

  await manager.init({ auth: database.collection('auth'), bots: database.collection('bots') });
  await manager.restoreAll();
})().catch((e) => {
  console.error('❌ Startup error:', e.message);
  process.exit(1);
});

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
process.on('uncaughtException', (e) => console.error('Uncaught:', e));
