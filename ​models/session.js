import mongoose from 'mongoose';

const groupSettingSchema = new mongoose.Schema({
    groupId: { type: String, required: true, unique: true },
    aiEnabled: { type: Boolean, default: false }
});

export const GroupSetting = mongoose.model('GroupSetting', groupSettingSchema);
