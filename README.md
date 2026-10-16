# Nethu AI – WhatsApp Bot (v4)

1. `.env.example` → `.env` (or Render Environment) හි values දාන්න: `MONGODB_URI`, `OPENROUTER_API_KEY`.
2. `npm install && npm start`
3. Browser එකේ සයිට් එක open කරලා අංකය (94771234567) ගහලා Pairing Code එක ගන්න.
4. WhatsApp → Settings → Linked Devices → Link a device → **Link with phone number instead** → code එක ගහන්න.
5. Link වුණාම page එකේ "Connected ✅" පෙන්නනවා. Session එක MongoDB එකේ save වෙන නිසා restart වුණත් ආයෙ link කරන්න ඕන නෑ.

Group commands: `.group on ai` / `.group off ai`
Endpoints: `/pair?number=94...`, `/status`, `/health`
