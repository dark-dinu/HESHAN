import mongoose from 'mongoose';
import pkg from '@whiskeysockets/baileys';

const { proto, initAuthCreds, BufferJSON } = pkg;

// MongoDB Session Collection Schema
const authSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    data: { type: String, required: true }
});

const AuthModel = mongoose.models.AuthSession || mongoose.model('AuthSession', authSchema);

export const useMongoDBAuthState = async () => {
    const writeData = async (data, id) => {
        try {
            await AuthModel.updateOne(
                { id },
                { data: JSON.stringify(data, BufferJSON.replacer) },
                { upsert: true }
            );
        } catch (error) {
            console.error(`[AUTH DB] Error writing ${id}:`, error.message);
        }
    };

    const readData = async (id) => {
        try {
            const result = await AuthModel.findOne({ id });
            if (!result || !result.data) return null;
            return JSON.parse(result.data, BufferJSON.reviver);
        } catch (error) {
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            await AuthModel.deleteOne({ id });
        } catch (error) {
            console.error(`[AUTH DB] Error removing ${id}:`, error.message);
        }
    };

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
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
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
};
