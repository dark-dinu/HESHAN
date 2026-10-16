# WhatsApp Bot + Pair Site (Baileys Multi-Device)

## Deploy
1. `config.js` එකේ `MONGODB_URL` එකට ඔයාගේ Mongo url එක paste කරන්න.
   (GitHub repo එක **Private** තියන්න, නැත්නම් url එක පේනවා!)
2. GitHub එකට දාලා Render → New → Web Service (Build: `npm install`, Start: `npm start`).
3. Deploy උනාම Render url එක open කරන්න → number එක දීලා pairing code එක ගන්න
   → WhatsApp → Linked Devices → Link with phone number.

## Session
Link උනාම session MongoDB එකේ auto save වෙනවා. Restart/redeploy උනාම
bots ඔක්කොම auto connect වෙනවා. Logout කලොත් auto clear වෙනවා.

## Bots ගොඩක්
Pair site එකෙන් ඕන තරම් numbers link කරන්න පුලුවන් (`MAX_SESSIONS`).
Free plan RAM 512MB නිසා instance එකකට ~10-15ක් විතර ආරක්ෂිතයි.
වැඩිවුනාම තව Render service එකක් (වෙන Mongo database/collection එකක් එක්ක) හදන්න.

## Commands
`commands/` folder එකට `.js` file එකක් දැම්මම auto load වෙනවා.
`commands/_example.js.txt` බලන්න.
