const mongoose = require("mongoose");
const { proto } = require("@whiskeysockets/baileys");

const AuthSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  id: { type: String, required: true },
  value: { type: String, required: true }
}, { versionKey: false });

AuthSchema.index({ sessionId: 1, id: 1 }, { unique: true });
const AuthModel = mongoose.model("Auth", AuthSchema);

// Groups where AI is explicitly enabled
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

// MongoDB Auth Adapter for Baileys Multi-Device
async function useMongoAuthState(sessionId) {
  const writeData = async (data, id) => {
    try {
      const value = JSON.stringify(data, (key, val) => {
        if (Buffer.isBuffer(val)) {
          return { type: "Buffer", data: Array.from(val) };
        }
        return val;
      });
      await AuthModel.findOneAndUpdate(
        { sessionId, id },
        { sessionId, id, value },
        { upsert: true, new: true }
      );
    } catch (e) {
      console.error(`Auth write error for ${id}:`, e);
    }
  };

  const readData = async (id) => {
    try {
      const doc = await AuthModel.findOne({ sessionId, id });
      if (!doc) return null;
      return JSON.parse(doc.value, (key, val) => {
        if (val && val.type === "Buffer" && Array.isArray(val.data)) {
          return Buffer.from(val.data);
        }
        return val;
      });
    } catch {
      return null;
    }
  };

  const removeData = async (id) => {
    try {
      await AuthModel.deleteOne({ sessionId, id });
    } catch (e) {
      console.error(`Auth remove error for ${id}:`, e);
    }
  };

  const creds = (await readData("creds")) || {};

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                tasks.push(writeData(value, key));
              } else {
                tasks.push(removeData(key));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, "creds")
  };
}

module.exports = { connectDB, useMongoAuthState, GroupSetting };
