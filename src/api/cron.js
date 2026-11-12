const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../db');
const { runDailyReminder, runDueReminders, runMonthlyReminder } = require('../services/notificationService');
const { materializeDue } = require('../services/recurrence');
const { purgeExpiredTenants } = require('../services/tenantTrash');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (mongoose.connection.readyState !== 1) await connectDB();

    /* Hafta içi borsa kapanışından sonra (BIST 18:00) yalnız kağıt fiyatları.
       vercel.json: '5 15 * * 1-5' UTC = 18:05 TR; Hobby planında saat içinde
       herhangi bir dakikada tetiklenebilir, kapanıştan sonraya denk gelir. */
    if (String(req.query?.task || '') === 'stocks') {
      const day = new Date().getUTCDay();
      if (day === 0 || day === 6) return res.status(200).json({ stocks: { skipped: 'hafta sonu' } });
      const stocks = await require('../services/stocks').refreshStockPrices();
      return res.status(200).json({ stocks });
    }

    // Önce düzenli kalemler gidere dönüşsün, özetler güncel rakamı görsün.
    const recurring = await materializeDue();
    // Kiracı bazlı uyarılar önce: "yarın ödemesi var" ve gecikme mesajları
    // günlük özetten bağımsız, dönem başına bir kez gider.
    const due = await runDueReminders();
    const [daily, monthly] = await Promise.all([
      runDailyReminder(),
      runMonthlyReminder(),
    ]);
    // Ayın 1'inde geçen ayın bütün raporu PDF ekiyle e-postaya gider.
    // Ay başı e-postası artık budur; Telegram'daki ay özeti yerinde duruyor.
    const fullReport = await require('../services/monthlyReport').runFullMonthlyReport();

    // Silinenler'de 15 günü dolan kiracılar ve kayıtları kalıcı olarak gider.
    const trash = await purgeExpiredTenants();

    const rentIncrease = await require('../services/rentIncreases').runRentIncreaseCheck();

    // Borsa: önceki günün kapanış fiyatları (her sabah). Hata kirayı durdurmasın.
    let stocks;
    try {
      stocks = await require('../services/stocks').refreshStockPrices();
    } catch (error) {
      console.error('Borsa fiyat güncellemesi başarısız:', error);
      stocks = { error: error.message };
    }
    return res.status(200).json({ recurring, due, daily, monthly, fullReport, trash, rentIncrease, stocks });
  } catch (error) {
    console.error('Cron error:', error);
    return res.status(500).json({ error: error.message });
  }
};
