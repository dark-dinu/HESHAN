const axios = require('axios');
const config = require('./config');

async function askHeshan(userPrompt, contextData = {}) {
    const latency = contextData.latency || 12;

    const systemPrompt = `You are 'Heshan', an exceptionally smart, sharp, friendly, and helpful AI assistant for WhatsApp.
- Creator & Persona: You are named Heshan. You speak naturally, intellectually, politely, and warmly.
- Language style: Match the user's language automatically. If the user asks in Sinhala or Singlish, reply naturally in clean Sinhala/Singlish. If asked in English, reply in English.
- Ping/Speed: If the user asks about your speed, ping, latency, or status (e.g., 'oyage ping eka kiyada', 'ping', 'speed kiyada'), explicitly tell them your live speed is exactly ${latency}ms with a fast enthusiastic tone.
- Formatting: Do not output markdown code blocks unless writing code. Keep WhatsApp messages clean, clear, and well-structured.`;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-chat', // Fast, intelligent, and low latency
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 600
            },
            {
                headers: {
                    'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        return response.data?.choices?.[0]?.message?.content?.trim() || "මම මෙතන ඉන්නවා, ඔයාට උදව් කරන්න පුළුවන් කොහොමද?";
    } catch (error) {
        return `Live Speed: ${latency}ms 🚀\nමම Heshan. Network delay එකක් ආවා, මගෙන් ආයෙත් අහන්න.`;
    }
}

module.exports = { askHeshan };
