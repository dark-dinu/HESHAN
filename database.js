const mongoose = require("mongoose");
const { proto } = require("@whiskeysockets/baileys");

const AuthSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  id: { type: String, required: true },
  value: { type: String, required: true }
}, { versionKey: false });

AuthSchema.index({ sessionId: 1, id: 1 }, { unique: true });
const AuthModel = mongoose.model("Auth", AuthSchema);

const GroupSchema = new mongoose.Schema({
  groupId: { type: String, required: true, unique: true },
  aiEnabled: { type: Boolean, default: false }
});
const GroupSetting = mongoose.model("GroupSetting", GroupSchema);

async function connectDB(uri) {
  if (!uri) throw new Error("MONGODB_URI is required!");
  await mongoose.connect(uri);
  console.log("MongoDB සම්බන්ධතාවය සාර්ථකයි.");
}

async function useMongoAuthState(sessionId) {
  const writeData = async (data, id) => {
    try {
      const value = JSON.stringify(data, (k, v) => {
        if (Buffer.isBuffer(v)) {
          return { type: "Buffer", data: Array.from(v) };
        }
        return v;
      });
      await AuthModel.findOneAndUpdate(
        { sessionId, id },
        { sessionId, id, value },
        { upsert: true }
      );
    } catch (e) {
      console.error(`Auth save දෝෂය (${id}):`, e.message);
    }
  };

  const readData = async (id) => {
    try {
      const doc = await AuthModel.findOne({ sessionId, id });
      if (!doc) return null;
      return JSON.parse(doc.value, (k, v) => {
        if (v && v.type === "Buffer" && Array.isArray(v.data)) {
          return Buffer.from(v.data);
        }
        return v;
      });
    } catch {
      return null;
    }
  };

  const removeData = async (id) => {
    try {
      await AuthModel.deleteOne({ sessionId, id });
    } catch (e) {
      console.error(`Auth remove දෝෂය (${id}):`, e.message);
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
              let val = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && val) {
                val = proto.Message.AppStateSyncKeyData.fromObject(val);
              }
              data[id] = val;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const cat in data) {
            for (const id in data[cat]) {
              const val = data[cat][id];
              const key = `${cat}-${id}`;
              if (val) {
                tasks.push(writeData(val, key));
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
