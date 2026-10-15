const mongoose = require('mongoose');
const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const AuthSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    data: { type: String, required: true }
});

const AuthModel = mongoose.model('SessionData', AuthSchema);

async function useMongoDBAuthState() {
    const credsDoc = await AuthModel.findOne({ id: 'creds' });
    let creds;

    if (credsDoc) {
        creds = JSON.parse(credsDoc.data, BufferJSON.reviver);
    } else {
        creds = initAuthCreds();
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            const doc = await AuthModel.findOne({ id: `${type}-${id}` });
                            if (doc) {
                                let value = JSON.parse(doc.data, BufferJSON.reviver);
                                if (type === 'app-state-sync-key' && value) {
                                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                                }
                                data[id] = value;
                            }
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
                                tasks.push(
                                    AuthModel.updateOne(
                                        { id: key },
                                        { $set: { data: JSON.stringify(value, BufferJSON.replacer) } },
                                        { upsert: true }
                                    )
                                );
                            } else {
                                tasks.push(AuthModel.deleteOne({ id: key }));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await AuthModel.updateOne(
                { id: 'creds' },
                { $set: { data: JSON.stringify(creds, BufferJSON.replacer) } },
                { upsert: true }
            );
        }
    };
}

module.exports = { useMongoDBAuthState };
