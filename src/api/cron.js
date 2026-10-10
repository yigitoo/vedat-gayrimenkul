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

    // Önce düzenli kalemler gidere dönüşsün, özetler güncel rakamı görsün.
    const recurring = await materializeDue();
    // Kiracı bazlı uyarılar önce: "yarın ödemesi var" ve gecikme mesajları
    // günlük özetten bağımsız, dönem başına bir kez gider.
    const due = await runDueReminders();
    const [daily, monthly] = await Promise.all([
      runDailyReminder(),
      runMonthlyReminder(),
    ]);

    // Silinenler'de 15 günü dolan kiracılar ve kayıtları kalıcı olarak gider.
    const trash = await purgeExpiredTenants();

    return res.status(200).json({ recurring, due, daily, monthly, trash });
  } catch (error) {
    console.error('Cron error:', error);
    return res.status(500).json({ error: error.message });
  }
};
