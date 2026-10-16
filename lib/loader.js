// commands folder එකේ ඇති සියලු .js files auto load කරනවා
const fs = require('fs');
const path = require('path');

function loadCommands() {
  const dir = path.join(__dirname, '..', 'commands');
  const map = new Map();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    try {
      const cmd = require(path.join(dir, file));
      if (!cmd.name || typeof cmd.run !== 'function') continue;
      map.set(cmd.name, cmd);
      (cmd.alias || []).forEach((a) => map.set(a, cmd));
      console.log(`✅ Loaded command: ${cmd.name}`);
    } catch (e) {
      console.error(`❌ Failed to load ${file}:`, e.message);
    }
  }
  return map;
}

module.exports = { loadCommands };
