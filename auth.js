const mongoose = require('mongoose');
const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const AuthSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    data: { type: Object, required: true }
});

const AuthModel = mongoose.model('SessionData', AuthSchema);

async function useMongoDBAuthState() {
    let creds;
    try {
        const credsDoc = await AuthModel.findOne({ id: 'creds' });
        creds = credsDoc ? JSON.parse(JSON.stringify(credsDoc.data), BufferJSON.reviver) : initAuthCreds();
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
                                if (doc && doc.data) {
                                    let value = JSON.parse(JSON.stringify(doc.data), BufferJSON.reviver);
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
                                const cleanValue = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
                                tasks.push(
                                    AuthModel.updateOne(
                                        { id: key },
                                        { $set: { data: cleanValue } },
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
                const cleanCreds = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
                await AuthModel.updateOne(
                    { id: 'creds' },
                    { $set: { data: cleanCreds } },
                    { upsert: true }
                );
            } catch (e) {}
        }
    };
}

module.exports = { useMongoDBAuthState };
