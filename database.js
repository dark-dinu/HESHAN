const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  sessionData: { type: String, required: true }
}, { versionKey: false });

const SessionModel = mongoose.model("Session", SessionSchema);

const GroupSettingSchema = new mongoose.Schema({
  groupId: { type: String, required: true, unique: true },
  aiEnabled: { type: Boolean, default: false }
});

const GroupSetting = mongoose.model("GroupSetting", GroupSettingSchema);

async function connectDB(uri) {
  if (!uri) throw new Error("MONGODB_URI is required!");
  await mongoose.connect(uri);
  console.log("Connected to MongoDB successfully.");
}

async function saveSessionToMongo(sessionId, base64Data) {
  await SessionModel.findOneAndUpdate(
    { sessionId },
    { sessionId, sessionData: base64Data },
    { upsert: true, new: true }
  );
}

async function getSessionFromMongo(sessionId) {
  const doc = await SessionModel.findOne({ sessionId });
  return doc ? doc.sessionData : null;
}

module.exports = { connectDB, saveSessionToMongo, getSessionFromMongo, GroupSetting };
