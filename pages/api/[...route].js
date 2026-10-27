/* Tek yönlendirici. Vercel her API dosyasını ayrı bir fonksiyon sayıyor ve
   Hobby planında sınır 12; rotalar burada toplanınca tek fonksiyon kalıyor.
   İşleyiciler tembel yükleniyor, böylece bir istek yalnız ihtiyacı olan
   bağımlılığı (mongoose, telegraf, nodemailer) açıyor. */
const routes = {
  bus: () => require('../../src/api/bus'),
  cron: () => require('../../src/api/cron'),
  dashboard: () => require('../../src/api/dashboard'),
  deferments: () => require('../../src/api/deferments'),
  dues: () => require('../../src/api/dues'),
  expenses: () => require('../../src/api/expenses'),
  ledger: () => require('../../src/api/ledger'),
  notifications: () => require('../../src/api/notifications'),
  payments: () => require('../../src/api/payments'),
  recurrences: () => require('../../src/api/recurrences'),
  reports: () => require('../../src/api/reports'),
  'rent-increases': () => require('../../src/api/rent-increases'),
  session: () => require('../../src/api/session'),
  settings: () => require('../../src/api/settings'),
  'set-webhook': () => require('../../src/api/set-webhook'),
  tenants: () => require('../../src/api/tenants'),
  todos: () => require('../../src/api/todos'),
  webhook: () => require('../../src/api/webhook'),
};

module.exports = async (req, res) => {
  const segments = req.query.route;
  const name = Array.isArray(segments) ? segments[0] : segments;
  const load = routes[name];

  if (!load) return res.status(404).json({ error: 'Böyle bir uç nokta yok.' });

  try {
    return await load()(req, res);
  } catch (error) {
    console.error('API route error (' + name + '):', error);
    if (res.headersSent) return undefined;
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
};
