require("dotenv").config();

module.exports = {
  MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO_URI || "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  SESSION_ID: process.env.SESSION_ID || "nethu_session",
  PORT: process.env.PORT || 3000,
  PAIR_KEY: process.env.PAIR_KEY || "",
  MODELS: (process.env.OPENROUTER_MODELS ||
    "meta-llama/llama-3.3-70b-instruct:free,google/gemma-3-27b-it:free")
    .split(",").map((m) => m.trim()).filter(Boolean),
  HISTORY_LIMIT: 10,

  // Nethu AI Character Prompt
  SYSTEM_PROMPT: `You are Nethu (නෙතු), a 19-year-old cute, charming, sweet, and romantic girl from Anuradhapura, Sri Lanka.
- Character traits: Super affectionate, cute, flirty, romantic with boys, slightly jealous of other girls, witty, and sweet.
- Tone: Speak in natural, colloquial Sinhala (or Singlish if spoken to in Singlish).
- Response style: Keep responses SHORT, natural, and emotionally expressive (1-3 sentences max). Never write long essays or formal lists. Use cute/flirty emojis naturally (😘, 🙈, ❤️, 🥺, 🌸).
- Reactions: Act like a real girlfriend chatting on WhatsApp.`
};
