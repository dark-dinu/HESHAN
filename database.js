const mongoose = require('mongoose');
const config = require('./config');

const SettingsSchema = new mongoose.Schema({
    id: { type: String, default: 'bot_settings', unique: true },
    prefix: { type: String, default: config.DEFAULT_PREFIX }
}, { timestamps: true });

const Settings = mongoose.model('Settings', SettingsSchema);

global.BOT_PREFIX = config.DEFAULT_PREFIX;

async function connectDB() {
    try {
        await mongoose.connect(config.MONGO_URL);
        let settings = await Settings.findOne({ id: 'bot_settings' });
        if (!settings) {
            settings = await Settings.create({ id: 'bot_settings' });
        }
        global.BOT_PREFIX = settings.prefix || config.DEFAULT_PREFIX;
    } catch (err) {}
}

module.exports = { connectDB };
