module.exports = {
  // 👇 Deploy කරන්න කලින් මෙතනට ඔයාගේ MongoDB url එක paste කරන්න
  MONGODB_URL: process.env.MONGODB_URL || 'mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0
',

  BOT_NAME: 'My WhatsApp Bot',
  PREFIX: '.',                 // command prefix
  MODE: 'public',              // 'public' = හැමෝටම, 'self' = ඔයාට විතරයි
  DEFAULT_COUNTRY_CODE: '94',  // 0771234567 ගැහුවොත් 94771234567 කරනවා
  MAX_SESSIONS: 100,           // එක deploy එකක link කරන්න පුලුවන් උපරිම numbers
  PAIR_TIMEOUT_SEC: 180,       // pairing code එකට දෙන කාලය
  PORT: process.env.PORT || 3000,
};
