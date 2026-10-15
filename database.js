const mongoose = require('mongoose');
const config = require('./config');

async function connectDB() {
    try {
        await mongoose.connect(config.MONGO_URL);
    } catch (err) {}
}

module.exports = { connectDB };
