    if (connection === 'open') {
      s.status = 'connected';
      s.pairingCode = null;
      clearTimeout(s.timer);
      s.timer = null;
      console.log(`✅ [${id}] connected`);
      await db.bots.updateOne({ _id: id }, { $set: { linkedAt: new Date() } }, { upsert: true });

      // 🟢 🔴 ALWAYS ONLINE / OFFLINE ENFORCER (Offline Lock Fix)
      if (s.presenceInterval) clearInterval(s.presenceInterval);

      // Connect වූ සැනින් මුල්ම Presence එක Set කිරීම
      try {
        const botData = await db.bots.findOne({ _id: id });
        const isAlwaysOnline = botData?.settings?.alwaysOnline ?? false;
        await sock.sendPresenceUpdate(isAlwaysOnline ? 'available' : 'unavailable');
      } catch {}

      // තත්පර 45න් 45ට Background එකෙන් Status එක Lock කර තබා ගැනීම
      s.presenceInterval = setInterval(async () => {
        try {
          const botData = await db.bots.findOne({ _id: id });
          const isAlwaysOnline = botData?.settings?.alwaysOnline ?? false;
          await sock.sendPresenceUpdate(isAlwaysOnline ? 'available' : 'unavailable');
        } catch {}
      }, 45000);

      // ⚡ Connecting Card Message එක යැවීම
      if (s.pairing && !s.welcomed) {
        s.welcomed = true;
        try {
          const logoBuffer = getLogoBuffer();
          const targetJid = jidNormalizedUser(sock.user.id);

          const welcomeCaption = 
`> *⚡ H E S H A N   O F C   M D*

┌───〔 BOT CONNECTED 〕
│
├ ✦ *Status:* Online & Active 🟢
├ ✦ *Prefix:* [ ${config.PREFIX || '.'} ]
├ ✦ *Engine:* Multi-Device Operational
│
└───〔 QUICK START 〕
│
├▸ *${config.PREFIX || '.'}menu*    ➯ Command Dashboard
├▸ *${config.PREFIX || '.'}setting* ➯ Bot Control Panel
├▸ *${config.PREFIX || '.'}ping*    ➯ Response Latency
│
└────────────···▸

\`\`\`➥ Ready to automate chats & media streams!\`\`\`

> *🕊️ ʜᴇꜱʜᴀɴ ᴏꜰᴄ : ᴍᴜʟᴛɪ-ᴅᴇᴠɪᴄᴇ ʙᴏᴛ*`;

          if (logoBuffer) {
            await sock.sendMessage(targetJid, {
              image: logoBuffer,
              caption: welcomeCaption
            });
          } else {
            await sock.sendMessage(targetJid, {
              text: welcomeCaption
            });
          }
        } catch (e) {
          console.error(`[${id}] welcome message error:`, e.message);
        }
      }
    }
