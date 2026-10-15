const mongoose = require('mongoose');
const config = require('./config');

const SettingsSchema = new mongoose.Schema({
    id: { type: String, default: 'bot_settings', unique: true },
    prefix: { type: String, default: config.DEFAULT_PREFIX },
    workType: { type: String, default: 'public' }
}, { timestamps: true });

const Settings = mongoose.model('Settings', SettingsSchema);

async function connectDB() {
    try {
        await mongoose.connect(config.MONGO_URL);
        let settings = await Settings.findOne({ id: 'bot_settings' });
        if (!settings) {
            await Settings.create({ id: 'bot_settings' });
        }
    } catch (err) {
        console.error('Database connection failed.');
    }
}

async function getSettings() {
    let settings = await Settings.findOne({ id: 'bot_settings' });
    if (!settings) {
        settings = await Settings.create({ id: 'bot_settings' });
    }
    return settings;
}

module.exports = { connectDB, Settings, getSettings };
