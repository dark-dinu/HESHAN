// Session එක MongoDB එකේ auto save වෙනවා (restart / redeploy උනත් නොනැසී තියෙනවා)
const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

async function useMongoAuthState(col, sessionId) {
  const k = (id) => `${sessionId}:${id}`;
  const write = (id, data) =>
    col.replaceOne({ _id: k(id) }, { _id: k(id), data: JSON.stringify(data, BufferJSON.replacer) }, { upsert: true });
  const read = async (id) => {
    const d = await col.findOne({ _id: k(id) });
    return d ? JSON.parse(d.data, BufferJSON.reviver) : null;
  };
  const remove = (id) => col.deleteOne({ _id: k(id) });

  const creds = (await read('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out = {};
          await Promise.all(ids.map(async (id) => {
            let v = await read(`${type}-${id}`);
            if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            out[id] = v;
          }));
          return out;
        },
        set: async (data) => {
          const tasks = [];
          for (const cat in data)
            for (const id in data[cat]) {
              const v = data[cat][id];
              tasks.push(v ? write(`${cat}-${id}`, v) : remove(`${cat}-${id}`));
            }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => write('creds', creds),
    clear: () => col.deleteMany({ _id: { $regex: `^${sessionId}:` } }),
  };
}

module.exports = { useMongoAuthState };
