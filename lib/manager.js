    if (connection === 'open') {
      s.status = 'connected';
      s.pairingCode = null;
      clearTimeout(s.timer);
      s.timer = null;
      console.log(`✅ [${id}] connected`);
      await db.bots.updateOne({ _id: id }, { $set: { linkedAt: new Date() } }, { upsert: true });

      // 🔴 OFFLINE LOCK LOOP (කිසිම වෙලාවක Online නොපෙන්වීම)
      if (s.presenceInterval) clearInterval(s.presenceInterval);

      const syncPresence = async () => {
        try {
          const botData = await db.bots.findOne({ _id: id });
          const isAlwaysOnline = botData?.settings?.alwaysOnline ?? false;
          if (isAlwaysOnline) {
            await sock.sendPresenceUpdate('available');
          } else {
            await sock.sendPresenceUpdate('unavailable');
          }
        } catch {}
      };

      await syncPresence();
      s.presenceInterval = setInterval(syncPresence, 10000); // තත්පර 10න් 10ට Offline තහවුරු කරයි

      // (Connecting Card message එක මෙතනින් ඉදිරියට සාමාන්‍ය ලෙසම තියෙන්න දෙන්න...)
