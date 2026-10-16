const mongoose = require("mongoose");
const {
  proto,
  initAuthCreds,
  BufferJSON
} = require("@whiskeysockets/baileys");

const AuthSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    id: { type: String, required: true },
    value: { type: String, required: true }
  },
  { versionKey: false }
);
AuthSchema.index({ sessionId: 1, id: 1 }, { unique: true });
const AuthModel = mongoose.models.Auth || mongoose.model("Auth", AuthSchema);

const GroupSetting =
  mongoose.models.GroupSetting ||
  mongoose.model(
    "GroupSetting",
    new mongoose.Schema({
      groupId: { type: String, required: true, unique: true },
      aiEnabled: { type: Boolean, default: false }
    })
  );

const Memory =
  mongoose.models.Memory ||
  mongoose.model(
    "Memory",
    new mongoose.Schema({
      jid: { type: String, required: true, unique: true },
      messages: [
        {
          _id: false,
          role: { type: String, enum: ["user", "assistant"] },
          content: { type: String, required: true },
          timestamp: { type: Date, default: Date.now }
        }
      ],
      updatedAt: { type: Date, default: Date.now }
    })
  );

async function connectDB(uri) {
  if (!uri) throw new Error("MONGODB_URI (හෝ MONGO_URI) සකසා නැත!");
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log("MongoDB සම්බන්ධතාවය සාර්ථකයි.");
}

async function clearSession(sessionId) {
  await AuthModel.deleteMany({ sessionId });
}

async function useMongoAuthState(sessionId) {
  const writeData = async (data, id) => {
    try {
      const value = JSON.stringify(data, BufferJSON.replacer);
      await AuthModel.updateOne({ sessionId, id }, { $set: { value } }, { upsert: true });
    } catch (e) {
      console.error(`Auth save දෝෂය (${id}):`, e.message);
    }
  };

  const readData = async (id) => {
    try {
      const doc = await AuthModel.findOne({ sessionId, id }).lean();
      return doc ? JSON.parse(doc.value, BufferJSON.reviver) : null;
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

  // IMPORTANT: creds නැත්නම් සම්පූර්ණ අලුත් creds හදන්න ඕන ({} නෙවෙයි)
  const creds = (await readData("creds")) || initAuthCreds();

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
              tasks.push(val ? writeData(val, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, "creds")
  };
}

module.exports = { connectDB, useMongoAuthState, clearSession, GroupSetting, Memory };
