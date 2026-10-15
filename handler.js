const fs = require('fs');
const path = require('path');
const { getSettings } = require('./database');

const commands = new Map();

function loadCommands() {
    commands.clear();
    const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const cmd = require(`./commands/${file}`);
        if (cmd.name) {
            commands.set(cmd.name.toLowerCase(), cmd);
        }
    }
}

async function handleMessage(sock, msgUpdate) {
    try {
        const msg = msgUpdate.messages?.[0];
        if (!msg || !msg.message || msg.key.fromMe) return;

        const body = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text ||
                     msg.message.imageMessage?.caption ||
                     msg.message.videoMessage?.caption || '';

        if (!body) return;

        const settings = await getSettings();
        const prefix = settings.prefix || '.';

        if (!body.startsWith(prefix)) return;

        const args = body.slice(prefix.length).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        const command = commands.get(commandName);
        if (!command) return;

        await command.execute(sock, msg, args);
    } catch (err) {
        // silent error handling
    }
}

module.exports = { loadCommands, handleMessage, commands };
