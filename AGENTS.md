# Ajanlar için notlar · Vedat Gayrimenkul / Kira Takip

Tek kullanıcılı Türkçe kira takip paneli: Next.js (`app/`), düz CSS (`styles.css`), `@phosphor-icons/react`, Inter. Sunucu tarafı `src/` (Mongoose, Telegram botu, pdfkit PDF, HTML e-posta).

## Arayüz, PDF ya da e-posta değiştirmeden önce

**`docs/tasarim-sistemi.md` dosyasını oku.** Token değerleri, paletler, kırılımlar, hareket ve bileşen kuralları orada; kodla çelişirse kod doğrudur, belgeyi aynı değişiklikte güncelle.

Temel kurallar:

- **Arayüz metni Türkçe**, kısa ve "sen" hitaplı. Para `formatCurrency` ile (`45.000 TL`), gün ekleri `dayWithSuffix` ile, büyük/küçük harf `tr-TR` yerel ayarıyla.
- **Ham hex/rgba yazma, token kullan** (`--accent`, `--text-2`, `--ok`, `--a-4`, `--r-3`, `--fs-md`…). `styles.css` katmanlıdır: §41 ve sonrası §1'deki tokenların üstüne yazar; etkin değer en son tanımdır.
- **Yedi palet ve koyu tema** her zaman çalışmalı: yeni renk kuralının `[data-theme="dark"]` karşılığını yaz; durum renkleri (`--ok/--warn/--bad/--calm`) paletten bağımsızdır ve her zaman ikon + metinle kullanılır.
- **Gizlilik modu:** ekrana basılan her tutar `formatCurrency` / `formatMoneyShort` üzerinden geçer; türetilmiş tutarları `isPrivate()` ile gizle.
- **Hareket:** yalnız `transform`/`opacity`, 140–320ms, girişte `--ease-out`; her yeni animasyon `prefers-reduced-motion` altında kapanmalı.
- **Kırılımlar:** ≥1081 tam yan menü, 721–1080 ikonlu dar ray, ≤720 alt sekme çubuğu + alttan açılan pencereler + tam ekran ⌘K. Dokunmatikte hedefler ≥44px, mobilde girdiler 16px.
- Onay için `askConfirm`, pencere için `SheetFrame`, bildirim için `setFlash` (+ geri alınabilir işlemde `action`). `window.confirm`/`alert` yok.
- **Yeni npm paketi eklemeden önce sor.**
- **Testleri gerçek `MONGODB_URI` ile çalıştırma**; yerel/bellek içi bir Mongo kullan (bellek içi sunucu paketi şu an bağımlılıklarda yok, eklemek için de sor).
