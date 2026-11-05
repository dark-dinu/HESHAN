// Session එක MongoDB එකේ auto save වෙනවා (Anti-corruption & High-speed bulk write)
const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

async function useMongoAuthState(col, sessionId) {
  const k = (id) => `${sessionId}:${id}`;

  const write = async (id, data) => {
    try {
      return await col.updateOne(
        { _id: k(id) },
        { $set: { data: JSON.stringify(data, BufferJSON.replacer) } },
        { upsert: true }
      );
    } catch (e) {
      console.error(`[MongoAuth] Write error (${id}):`, e.message);
    }
  };

  const read = async (id) => {
    try {
      const d = await col.findOne({ _id: k(id) });
      return d ? JSON.parse(d.data, BufferJSON.reviver) : null;
    } catch (e) {
      console.error(`[MongoAuth] Read error (${id}):`, e.message);
      return null;
    }
  };

  const remove = async (id) => {
    try {
      return await col.deleteOne({ _id: k(id) });
    } catch (e) {
      console.error(`[MongoAuth] Delete error (${id}):`, e.message);
    }
  };

  // Local Memory Cache for Creds to prevent desync
  const creds = (await read('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out = {};
          await Promise.all(
            ids.map(async (id) => {
              let v = await read(`${type}-${id}`);
              if (type === 'app-state-sync-key' && v) {
                try {
                  v = proto.Message.AppStateSyncKeyData.fromObject(v);
                } catch {}
              }
              out[id] = v;
            })
          );
          return out;
        },
        set: async (data) => {
          const operations = [];

          for (const cat in data) {
            for (const id in data[cat]) {
              const v = data[cat][id];
              const docId = k(`${cat}-${id}`);

              if (v) {
                operations.push({
                  updateOne: {
                    filter: { _id: docId },
                    update: { $set: { data: JSON.stringify(v, BufferJSON.replacer) } },
                    upsert: true,
                  },
                });
              } else {
                operations.push({
                  deleteOne: {
                    filter: { _id: docId },
                  },
                });
              }
            }
          }

          // Single atomic bulk operation to avoid connection spikes
          if (operations.length > 0) {
            try {
              await col.bulkWrite(operations, { ordered: false });
            } catch (err) {
              console.error('[MongoAuth] Bulk write error:', err.message);
            }
          }
        },
      },
    },
    saveCreds: () => write('creds', creds),
    clear: () => col.deleteMany({ _id: { $regex: `^${sessionId}:` } }),
  };
}

module.exports = { useMongoAuthState };
