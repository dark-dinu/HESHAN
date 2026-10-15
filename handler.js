const fs = require('fs');
const path = require('path');
const { getSettings } = require('./database');

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

async function handleMessage(sock, msgUpdate) {
    try {
        const msg = msgUpdate.messages?.[0];
        if (!msg || !msg.message) return;

        // WhatsApp message wrapper unpacking
        let message = msg.message;
        if (message.ephemeralMessage) {
            message = message.ephemeralMessage.message;
        }
        if (message.viewOnceMessageV2) {
            message = message.viewOnceMessageV2.message;
        }

        // Text extraction across all message types
        const body = message.conversation ||
                     message.extendedTextMessage?.text ||
                     message.imageMessage?.caption ||
                     message.videoMessage?.caption ||
                     '';

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
