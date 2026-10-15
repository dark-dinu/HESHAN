const mongoose = require('mongoose');
const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const AuthSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    data: { type: String, required: true }
});

const AuthModel = mongoose.model('SessionData', AuthSchema);

async function useMongoDBAuthState() {
    let creds;
    try {
        const credsDoc = await AuthModel.findOne({ id: 'creds' });
        creds = credsDoc ? JSON.parse(credsDoc.data, BufferJSON.reviver) : initAuthCreds();
    } catch (e) {
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
                            try {
                                const doc = await AuthModel.findOne({ id: `${type}-${id}` });
                                if (doc) {
                                    let value = JSON.parse(doc.data, BufferJSON.reviver);
                                    if (type === 'app-state-sync-key' && value) {
                                        value = proto.Message.AppStateSyncKeyData.fromObject(value);
                                    }
                                    data[id] = value;
                                }
                            } catch (e) {}
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
            try {
                await AuthModel.updateOne(
                    { id: 'creds' },
                    { $set: { data: JSON.stringify(creds, BufferJSON.replacer) } },
                    { upsert: true }
                );
            } catch (e) {}
        }
    };
}

module.exports = { useMongoDBAuthState };
