const fs = require('fs');
const path = require('path');

const commands = new Map();

function loadCommands() {
    commands.clear();
    const cmdDir = path.join(__dirname, 'commands');
    if (!fs.existsSync(cmdDir)) return;

    const commandFiles = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const cmd = require(`./commands/${file}`);
            if (cmd.name) {
                commands.set(cmd.name.toLowerCase(), cmd);
            }
        } catch (e) {}
    }
}

function handleMessage(sock, msgUpdate) {
    try {
        const msg = msgUpdate.messages?.[0];
        if (!msg || !msg.message) return;

        // Status updates සම්පූර්ණයෙන්ම skip කිරීම (Max Speed)
        const jid = msg.key.remoteJid;
        if (jid === 'status@broadcast') return;

        // Fastest direct text extraction without deep loops
        const m = msg.message;
        const text = m.conversation || 
                     m.extendedTextMessage?.text || 
                     m.imageMessage?.caption || 
                     m.videoMessage?.caption || 
                     (m.ephemeralMessage?.message?.conversation || m.ephemeralMessage?.message?.extendedTextMessage?.text) || '';

        if (!text) return;

        const prefix = global.BOT_PREFIX || '.';
        if (text[0] !== prefix) return;

        const clean = text.slice(prefix.length).trim();
        const spaceIdx = clean.indexOf(' ');
        const commandName = (spaceIdx === -1 ? clean : clean.slice(0, spaceIdx)).toLowerCase();
        const args = spaceIdx === -1 ? [] : clean.slice(spaceIdx + 1).split(/\s+/);

        const command = commands.get(commandName);
        if (command) {
            // Execution with internal timing
            command.execute(sock, msg, args);
        }
    } catch (err) {}
}

module.exports = { loadCommands, handleMessage, commands };
