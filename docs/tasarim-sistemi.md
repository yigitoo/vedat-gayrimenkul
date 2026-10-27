# Vedat Gayrimenkul · Tasarım sistemi

Bu belge panelin (Next.js, `styles.css`), PDF raporlarının (`src/utils/pdfReport.js`) ve e-postaların (`src/utils/emailTemplate.js`) görsel dilini anlatır. Buradaki her değer koddan alındı. Kod ile bu belge çelişirse kod doğrudur; belgeyi aynı değişiklikte güncelle.

> **Katmanlama uyarısı.** `styles.css` tarihsel olarak üst üste yazılmış bir dosyadır. Bölüm **1. Tokenlar** ilk değerleri verir; dosyanın sonundaki **41. Modern kabuk** (ve 44–49) aynı tokenların bir kısmını **yeniden tanımlar**. Etkin değer, sonda yazılandır. Bir tokenı değiştirmeden önce dosyada `grep -n -- "--token-adı:" styles.css` ile tüm tanımlarını bul. Aşağıdaki tablolarda "etkin" sütunu son tanımı gösterir.

---

## 1. Marka

### Ad kullanımı
| Bağlam | Ad | Kaynak |
|---|---|---|
| Panel başlığı, sekme başlığı, PDF üst bandı, e-posta başlığı | **Vedat Gayrimenkul** | `app/layout.js` → `title: "Vedat Gayrimenkul · Kira takip paneli"`; `pdfReport.js` → `header()`; `emailTemplate.js` |
| PWA / ana ekran / iOS uygulama adı | **Kira Takip** | `app/manifest.webmanifest` (`name`, `short_name`), `layout.js` → `applicationName`, `appleWebApp.title` |
| `localStorage` anahtar öneki (görünmez, değiştirme) | `kira-akis-*` | `kira-akis-theme`, `kira-akis-accent`, `kira-akis-privacy`, `kira-akis-session` |

Ayraç olarak orta nokta kullanılır: `Vedat Gayrimenkul · aylık rapor`, `Vedat Gayrimenkul · Kira takip paneli`.

### Logo (`public/icons/vedat-mark.svg`)
- 512×512, köşe yarıçapı `rx="118"`. Zemin kobalt degrade: `#4571f2 → #2b54d4 → #1b3688`, üstünde beyaz parıltı (`vg-sheen`).
- İşaret: beyaz bir **V**; sol kol kalın (`stroke-width="54"`), sağ kol ince ve daha yüksek (`42`), sağ ucun üstünde sıcak nokta `#ffcf9b` (`r="21"`).
- PDF'te aynı geometri `drawMark()` ile vektör olarak çizilir (zemin düz `C.accent`, nokta `C.mark = #ffcf9b`). PNG gömülmez.
- PNG türevleri: `vedat-192.png`, `vedat-512.png`, `vedat-maskable-512.png`, `apple-touch-icon.png` (180), `favicon.png` (64).

**Kurallar**
- İşareti yeniden renklendirme, kolları/oranı değiştirme, nokta rengini vurgu paletine bağlama. Logo her palette **kobalt** kalır; kullanıcı paleti yalnız arayüz vurgusunu değiştirir.
- Etrafında en az işaret boyutunun ~%25'i kadar boşluk bırak; döndürme, gölge ekleme, cam efekti verme.
- Koyu zeminde (PDF bandı, e-posta başlığı) olduğu gibi kullan; açık zeminde de kendi kare zemini olduğu için ek çerçeve gerekmez.

### Ses ve dil tonu
Arayüz metni kısa, sade, gündelik Türkçedir; kullanıcıya **"sen"** diye hitap edilir.
- Örnekler (koddan): "İstediğin zaman arşivden geri alabilirsin.", "15 gün içinde geri getirebilirsin.", "Güne not düş, saatine kadar geri sayım işlesin."
- Düğme etiketleri fiil, tek ya da iki kelime: "Onayla", "Vazgeç", "Arşivle", "Sil", "Geri al", "Paneli aç".
- Onay başlığı soru kalıbıyla: `"<Ad> arşivlensin mi?"`, `"<Ad> silinsin mi?"`.
- Bildirimler geçmiş zaman, nokta ile biter: "Kiracı arşivlendi.", "<Ad> · Ocak ödendi."
- Hata metinleri suçlamaz: "İşlem tamamlanamadı.", "Dosya hazırlanamadı."
- Ünlem, emoji, büyük harfle bağırma yok. Eyebrow/grup başlıkları CSS ile büyük harfe çevrilir (`text-transform: uppercase`), metnin kendisi normal yazılır.
- Not: `layout.js` ve manifest açıklamaları "yönetin" (siz) kullanır; bu yalnız arama motoru/mağaza metnidir. Uygulama içinde "sen" kullan.

### Türkçe yazım kuralları
- **Para:** `formatCurrency(45000)` → `45.000 TL`. Binlik ayracı nokta, kuruş gösterilmez (`maximumFractionDigits: 0`), birim sonda ve boşlukla: `TL` (₺ simgesi kullanılmaz). Girdiyi `parseMoney` ile oku (`"45.000"` → 45000, `"12,50"` → 12.5; kural `src/utils/money.js`).
- **Yüzde:** işaret önde: `%12`, `%100` (`"%" + rate`).
- **Tarih:** `formatDate` → `27 Ekim 2026`; `formatShortDate` → `27 Eki`; `periodLabel` → `Ekim 2026`. Sunucu tarafı (`src/utils/format.js`) `DD MMM YYYY` ve `MMMM YYYY` verir. Boş tarih için `—`.
- **Gün ekleri:** `dayWithSuffix(day)` → `1'i`, `2'si`, `3'ü`, `6'sı`, `9'u`, `10'u`, `20'si`, `30'u`. Elle ek yazma, bu fonksiyonu kullan ("her ayın 1'inde" gibi sabit metinler hariç).
- **Büyük/küçük harf:** `toLocaleUpperCase("tr-TR")` / `toLocaleLowerCase("tr-TR")`; aramada `normalizeSearch`. Yalın `toUpperCase()` "i → I" hatası yapar.
- Font Inter `latin-ext` alt kümesiyle yüklenir; ğ, ş, İ bu kümededir. Alt kümeyi kaldırma.
- CSV: noktalı virgül ayraç + BOM (`downloadCsv`), Türkçe Excel için bilinçli.

---

## 2. Renk

Bileşen içine ham hex yazılmaz; her şey `:root` tokenlarından gelir. Tema `<html data-theme="light|dark">`, palet `<html data-accent="...">` ile seçilir.

### Anlamsal tokenlar (etkin değerler, varsayılan "mavi" palet)
| Token | Açık | Koyu | Not |
|---|---|---|---|
| `--bg` | `#f2f4f9` (§41) | `#0a0d15` (§41) | Sayfa zemini; palet hafifçe tonlar |
| `--bg-deep` | `#e8ecf4` | `#070910` | Ortam degradesinin alt ucu |
| `--solid` | `#ffffff` | `#141a27` (§41) | Opak kart/pencere yüzeyi |
| `--solid-2` | `#f6f8fc` | `#10151f` (§41) | İkincil opak yüzey, kbd, hücre |
| `--text` | `#0c1220` | `#e9edf7` | Birincil metin |
| `--text-2` | `#4a5771` | `#a4b0c7` | İkincil metin, etiket |
| `--text-3` | `#5d6a82` (§41) | `#8b97ad` (§41) | Üçüncül; CSS notu: beyazda ~5.4:1, koyuda ~6:1 (AA) |
| `--line` | `rgba(14,22,40,0.11)` | `rgba(255,255,255,0.09)` | Ayırıcı |
| `--line-strong` | `rgba(14,22,40,0.19)` | `rgba(255,255,255,0.17)` | Girdi kenarı, belirgin çerçeve |
| `--glass-border` | `rgba(14,22,40,0.09)` | `rgba(255,255,255,0.08)` | Kart kenarı (§41) |

Metin **üç kademedir**, dördüncü kademe eklenmez (§1 notu). §1'deki eski `--text-3` (`#7b8aa4` / `#6e7c95`) artık geçerli değil.

### Vurgu ailesi
| Token | Açık (mavi) | Koyu (mavi) | Kullanım |
|---|---|---|---|
| `--accent` | `#2b54d4` | `#7f9dff` | Birincil düğme, etkin sekme, odak halkası |
| `--accent-press` | `#22449f` | `#6684f0` | Basılı/hover |
| `--accent-on` | `#ffffff` | `#0a1024` | Vurgu üstündeki metin |
| `--accent-soft` | `rgba(43,84,212,0.11)` | `rgba(127,157,255,0.16)` | Seçili satır, hover zemini, `::selection` |
| `--accent-line` | `rgba(43,84,212,0.26)` | `rgba(127,157,255,0.34)` | Vurgulu kenar |

Sayfada **tek** vurgu rengi vardır; ikinci bir "marka rengi" ekleme.

### Durum renkleri
| Token | Açık | Koyu | Anlam (`statusView`) |
|---|---|---|---|
| `--ok` / `--ok-soft` | `#0f7a55` | `#45cd97` | Ödendi, tahsil edildi, pozitif net |
| `--warn` / `--warn-soft` | `#a2660f` | `#e0a54a` | Eksik ödeme, kalan bakiye, dikkat |
| `--bad` / `--bad-soft` | `#bd3a2c` | `#f0776a` | Gecikti, negatif net, silme |
| `--calm` / `--calm-soft` | `#3d5a80` | `#90a8ce` | Yaklaşıyor, ödenecek (nötr bekleme) |

**Durum renkleri paletten bağımsızdır**: hiçbir `[data-accent]` kuralı onlara dokunmaz, "ödendi" her palette yeşildir. Durum **asla yalnız renkle** anlatılmaz; her zaman ikon + metinle birlikte (`.pill-ok` + "Ödendi", toast'ta `CheckCircle` / `WarningCircle`). Yardımcı sınıflar: `.tone-ok|warn|bad|calm|accent` (metin rengi), `.pill-*` (rozet), `.state-paid|partial|unpaid|future|outside` (ödeme tablosu).

### Yedi palet (`ACCENTS` in `app/lib/client.js`, kurallar §45)
| id | Etiket | Açık `--accent` | Koyu `--accent` |
|---|---|---|---|
| `mavi` (varsayılan) | Mavi | `#2b54d4` | `#7f9dff` |
| `adacayi` | Adaçayı | `#4f7a63` | `#8fc3a5` |
| `lavanta` | Lavanta | `#6b5fb5` | `#b3a8f0` |
| `okyanus` | Okyanus | `#1f7a8c` | `#7cc8d6` |
| `seftali` | Şeftali | `#b8653d` | `#f0a882` |
| `gul` | Gül | `#b0506d` | `#f09ab4` |
| `grafit` | Grafit | `#3d4655` | `#c3cad6` |

Nasıl çalışır:
- `layout.js` içindeki `themeBoot` betiği ilk boyamadan **önce** `localStorage`'dan tema, palet ve gizlilik bayrağını okuyup `<html>`'e `data-theme`, `data-accent`, `data-privacy` yazar (beyaz parlama olmasın diye). Tema kayıtlı değilse `prefers-color-scheme` kullanılır.
- `mavi` için ayrı kural yoktur; `:root` / `:root[data-theme="dark"]` varsayılanlarıdır.
- Her palet kuralı yalnız `--accent`, `--accent-press`, `--accent-soft`, `--accent-line`, `--glow-a`, `--bg`, `--bg-deep` (koyuda ayrıca `--accent-on`) değiştirir. Yeni palet eklerken: `ACCENTS`'a satır + §45'e açık **ve** koyu kural; ikisini de yaz.
- `AccentPicker` (page.js) üst şeritte açılır; içinde Açık/Koyu seçimi de vardır. Telefonda alttan sabit panel olur.
- Palet geçişi yalnız renk özelliklerini canlandırır (§45 `transition-property`).

### Gizlilik modu
- Bayrak: `<html data-privacy="on|off">`, anahtar `kira-akis-privacy`. Kısayol ⌘⇧H / Ctrl+Shift+H; yan menüde "Tutarları gizle" anahtarı (`.switch`), palette de bir düğme.
- Maske **CSS ile değil biçimlendiricilerle** yapılır: `formatCurrency` → `•••• TL`, `formatMoneyShort` → `••••`. Bu yüzden ekrana basılan **her** tutar bu fonksiyonlardan geçmelidir; `toLocaleString` ile kendi tutarını basma. Tutardan türetilen bir değer (ör. fark, yeni kira önizlemesi) gösteriyorsan `isPrivate()` ile gizle (bkz. `Raises.js`).
- Girdi alanları maskelenmez.

---

## 3. Tipografi

- Font: **Inter** (`next/font/google`, `subsets: ["latin","latin-ext"]`, `weight: ["400","500","600","700"]`, `display: "swap"`, değişken `--font-inter`). Yığın: `--font-sans`.
- Yalnız 400/500/600/700 yüklüdür; CSS'te de yalnız bu ağırlıklar kullanılır.
- Gövde: `body { font-size: 15px; line-height: 1.55 }`, telefonda (≤720) `14px` (§46). Gövde 14px'in altına inmez.
- Başlıklar `h1–h4` Inter **700**, `text-wrap: balance`; boyuta göre negatif tracking (`h1 -0.032em`, `h2 -0.021em`, `h3 -0.012em`). Üst şerit başlığı `.topbar-title h1` = `--fs-lg`, telefonda 21px.
- Eyebrow: `.eyebrow` 11px, 600, `letter-spacing: 0.09em`, büyük harf, `--text-3` (telefonda 10.5px).

### Yazı ölçeği (§41)
| Token | Değer |
|---|---|
| `--fs-xs` | 12px |
| `--fs-sm` | 13px |
| `--fs-md` | 14px |
| `--fs-base` | 15px |
| `--fs-lg` | 18px |
| `--fs-xl` | 22px |
| `--fs-2xl` | 28px |

Ölçek geç eklendiği için eski bölümlerde çıplak px (12.5px, 13.5px, 14.5px…) çoktur. Yeni kodda tokenı kullan.

### Sayılar
Tutar, tarih, sayaç içeren her öğeye `.num` ver (`font-variant-numeric: tabular-nums`, `"tnum"`, `"cv05"`). Sütunlar böylece hizalanır, sayılar değişirken titremez.

### Mobil
- Girdiler mobilde **16px** (§23 içindeki `@media (max-width: 820px)`): iOS daha küçük yazılı alana odaklanınca sayfayı yakınlaştırır.
- Viewport `maximumScale: 5`; yakınlaştırmayı kapatma.

---

## 4. Aralık, yarıçap, gölge, yüzey

### Aralık (4'ün katları)
`--a-1: 4px` · `--a-2: 8px` · `--a-3: 12px` · `--a-4: 16px` · `--a-5: 20px` · `--a-6: 24px` · `--a-7: 32px` · `--a-8: 48px`

### Yarıçap (adımlı, ara değer yazılmaz)
| Token | Değer | Kullanım |
|---|---|---|
| `--r-1` | 10px | rozet, küçük çip, `.btn-sm` |
| `--r-2` | 14px | düğme, girdi |
| `--r-3` | 20px | kart |
| `--r-4` | 28px | panel, pencere, palet |
| `--r-full` | 999px | hap, toast, anahtar |

Telefonda kartlar 18px, satırlar 16px yarıçapa iner (§46, çıplak değer).

### Gölge (yalnız yükseklik için; ayrım için ton/çizgi kullan)
| Token | Açık (etkin) | Kullanım |
|---|---|---|
| `--sh-1` | `0 1px 2px rgba(12,18,32,.04), 0 6px 18px -12px rgba(12,18,32,.16)` (§41) | kart, etkin menü satırı |
| `--sh-2` | `0 2px 6px rgba(12,18,32,.05), 0 18px 40px -24px rgba(12,18,32,.26)` (§41) | hover'da kalkan kart, panel |
| `--sh-3` | `0 40px 90px -34px rgba(12,18,32,.48)` (§1) | pencere, palet, toast, açılır menü |
| `--sh-inset` | `inset 0 1px 0 rgba(255,255,255,.75)` | cam üst ışığı |

Koyu temada `--sh-1/2/3` §1'deki koyu değerlerdir (§41 koyu için gölgeyi yeniden tanımlamaz).

### Yüzey: cam mı opak mı?
- **Cam** (`.glass`, `.glass--panel`, `.glass--quiet`, `.glass--chip`): `--glass-bg` + `backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat))`. §41 sonrası cam neredeyse opaktır (açıkta `rgba(255,255,255,0.94→0.86)`, blur 14px). Kartlar, satırlar (`.row.glass`), özet karoları için.
- **Opak** (`--solid`): okunurluğun kritik olduğu her yer — pencereler (`.sheet.glass--panel` §41'de opak yapılır), toast, arama paleti, açılır menüler (`.accent-pop`), düğmeler (`.btn-glass` artık opak), telefondaki alt menü ve üst şerit (§40 "Midas düzeni").
- Kural: **üst üste binen geçici katman = opak**, sayfaya gömülü içerik = cam. Cam içinde cam kart yapma.
- `prefers-reduced-transparency: reduce` ve `prefers-contrast: more` camı `--solid`'e çevirir (§3); yeni cam yüzey eklersen `.glass` sınıfını kullan ki bu davranışı devralsın.

### Katmanlar (z-index)
| z | Öğe |
|---|---|
| 0 | `.ambient` (sabit ortam zemini) |
| 1 | `.boot`, giriş ekranı içeriği, yerel üst katmanlar |
| 30 | `.topbar` (yapışkan) |
| 45 | `.drp.is-open` (tarih aralığı seçici) |
| 50 | `.tabbar` (alt menü) |
| 60 | `.scrim` (pencereler), `.accent-pop` |
| 64–65 | tarih seçicinin telefon paneli ve perdesi |
| 70 | `.toast`, `.actions-screen` |
| 75 | `.accent-pop` (telefon) |
| 80 | `.palette-scrim` (⌘K) |
| 90 | `.loadbar` |

Yeni katman eklerken bu tabloya yerleştir; rastgele 999 yazma.

---

## 5. Kırılımlar

| Genişlik | Düzen | Kaynak |
|---|---|---|
| **≥ 1081px** | Tam yan menü (`--rail-w: 252px`), grup başlıkları, etiketler, ⌘K arama kutusu | §41 |
| **721–1080px** | İkonlu dar ray (`--rail-w-compact: 76px`), etiket/grup başlığı gizli, sayaçlar ikon köşesinde; alt menü **yok**; üst şeritte arama düğmesi | §44 |
| **≤ 720px** | Yan menü yok; alttaki **tab bar** (`PRIMARY_VIEWS`: Özet, Takvim, Ödemeler, Kiracılar) + "Daha" ile tam ekran **Tüm işlemler** (`.actions-screen`); pencereler **alttan çıkan sheet**; ⌘K paleti **tam ekran**; gövde 14px | §40, §44, §46 |

Ek ince ayar sorguları: 400px, 360px (sütun sayısı azaltma), 820px (girdiler 16px). Bölüm/sekme yapısı `VIEWS` ve `NAV_GROUPS` (`app/page.js`) ile tanımlıdır: gruplar **Genel, Kira, İşletme, Planlama**; Ayarlar ayrı (`SETTINGS_VIEW`). Yeni ekran eklerken `VIEWS`'a `id, label, icon, lead, group` (ve gerekiyorsa `primary`) ver, `SCREEN_SLUGS`'a Türkçe adres adı ekle.

Safe area: alt öğelerde `env(safe-area-inset-bottom)`, telefonda yan boşluk `max(12px, env(safe-area-inset-left/right))`.

---

## 6. Hareket

### Tokenlar
| Token | Değer | Kullanım |
|---|---|---|
| `--t-fast` | 140ms | basma, hover, renk |
| `--t-mid` | 260ms | açılır menü, anahtar, sekme işareti |
| `--t-slow` | 420ms | ilerleme çubuğu genişliği, giriş kartı |
| `--t-enter` | 320ms (§41) | ekran, pencere, palet girişi |
| `--t-exit` | 180ms (§41) | çıkış (tanımlı, henüz kullanılmıyor) |
| `--ease` | `cubic-bezier(0.32, 0.72, 0, 1)` | genel, kritik sönümlü |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` (§41) | **girişler** |
| `--ease-in` | `cubic-bezier(0.55, 0, 1, 0.45)` (§41) | çıkışlar (henüz kullanılmıyor) |
| `--ease-spring` | `cubic-bezier(0.34, 1.32, 0.5, 1)` | yalnız momentumlu küçük şeyler: anahtar topu, palet örneği, aktif sekme ikonu |

### Kurallar
- Yalnız `transform` ve `opacity` canlandır (renk geçişleri hariç). Süreler 140–320ms; 420ms yalnız ölçülü dolum için.
- Giriş `--ease-out` ile yavaşlayarak gelir; çıkış giriştekinden kısa olmalı (`--t-exit`).
- Basma geri bildirimi: `.btn:active { scale(0.97) }`, `.icon-btn:active { scale(0.94) }`.
- Masaüstünde (`hover: hover` ve `pointer: fine`) kart ve satırlar hover'da `translateY(-2px)` + `--sh-2`.

### Desenler
- **Ekran girişi** (`@keyframes screen-in`: `opacity 0, translateY(8px)` → yerinde): `.screen > *` ve `.screen > .view > *` sırayla 40ms arayla (`nth-child(2..5)`, 6. ve sonrası 200ms'de sabit). Karolar `--i` ile 45ms, satırlar `min(--i, 10) * 30ms`. Listeye `style={{ "--i": index }}` ver.
- **Pencere:** masaüstünde `sheet-in` (`translateY(14px) scale(0.98)` → yerinde), telefonda `sheet-up` (`translateY(100%)` → yerinde), üstte tutamak çizgisi (`.sheet::after`).
- **Palet:** `palette-in` (`translateY(-8px) scale(0.97)`, `transform-origin: top center`); telefonda `sheet-up`.
- **Açılır menü:** `pop-in` (`translateY(-4px) scale(0.96)`).
- **Yükleme:** içerik yerinde kalır, üstte 2px `.loadbar` akar; 150ms gecikmeyle görünür (hızlı isteklerde hiç görünmez). İskelet ekranı/döndürücü ile içerik silme.
- **Düğme yükleniyor:** `.btn.is-busy` metni saydam yapar, üstüne döndürücü koyar; düğme genişliği değişmez.

### Hareket azaltma
- §20: `prefers-reduced-motion: reduce` → `--t-fast/mid/slow: 1ms`, tüm animasyon/geçiş süreleri `1ms !important` (0 değil: `transitionend`'e bağlı kod kırılmasın).
- §44: sıralı girişler (`.screen > *`, `.tile`, `.row.glass`, `.raise-list li`) tamamen kapanır; §48 nabız öğeleri, §40 `.actions-screen` da kapanır.
- Yeni bir `@keyframes` eklediğinde ilgili seçiciyi bu bloklardan birine ekle.

---

## 7. Bileşen kuralları

### Düğmeler (`.btn` + çeşit)
| Sınıf | Görünüm | Ne zaman |
|---|---|---|
| `.btn-primary` | dolu vurgu, `--accent-on` metin | ekrandaki tek ana eylem (Kaydet, Onayla) |
| `.btn-glass` | opak `--solid`, `--line-strong` kenar | ikincil eylem |
| `.btn-quiet` | çerçevesiz, `--text-2` | Vazgeç, düşük öncelik |
| `.btn-danger` | dolu `--bad`, beyaz metin | onay penceresindeki yıkıcı eylem |
| `.btn.is-danger` | çerçevesiz kırmızı metin | listede satır içi "Sil" |
| `.btn-sm` | 36px yükseklik, `--r-1` | sıkışık alanlar |
| `.btn-wide` | tam genişlik | form altı |
| `.is-busy` | döndürücü | istek sürerken (ayrıca `disabled`) |

Yükseklik: 40px (`.btn`), dokunmatikte 44px. İkon 18px, metinden önce.

### İkon düğmesi
`.icon-btn` 40×40 (dokunmatikte 44×44), `--r-2`, hover `--accent-soft`. **Mutlaka `aria-label`** (ve masaüstü için `title`). İkonlar `@phosphor-icons/react`; ağırlık: arayüzde `weight="bold"`, durum ikonunda `fill`, boş durumda `duotone`.

### Bildirim (Toast)
- `setFlash({ tone: "ok" | "bad", message })` → `Toast` (`app/components/Feedback.js`). `ok` = `CheckCircle`, `bad` = `WarningCircle`, `role="alert"` yalnız `bad`'de.
- Süre 4.2 sn; `action` varsa 7 sn. Üstüne gelince/odaklanınca durur.
- **Geri alınabilir işlem** (ödeme işaretleme vb.) toast'a `action: { label: "Geri al", run: async () => {...} }` ekler. Geri alınabilen bir işlemi ayrıca onay penceresiyle sorma.
- Telefonda alt menünün üstünde, ekran genişliğinde.

### Onay penceresi
`window.confirm` **kullanma**. `await askConfirm({ title, message, confirmLabel, cancelLabel, tone: "danger", eyebrow })` → `Promise<boolean>`. Sayfada tek `ConfirmHost` çizer. Yıkıcı işlemlerde `tone: "danger"` (düğme `.btn-danger`) ve metinde sonucu açıkla ("15 gün Silinenler'de bekler…").

### SheetFrame (`app/components/Sheets.js`)
Tüm pencereler `SheetFrame({ eyebrow, title, wide, size, onClose })` ile açılır: odak tuzağı, Esc ile kapanma, perdeye tıklayınca kapanma, sayfa kaydırma kilidi, kapanınca odağı geri verme, `role="dialog"` + `aria-labelledby`. Kendi modalını yazma. Boyut: varsayılan 560px, `wide`, `size="compact"` (440px). Alt düğmeler `.sheet-actions` içinde; telefonda yapışkan ve eşit genişlikte.

### Arama paleti (CommandPalette, ⌘K)
- Açılış: ⌘K / Ctrl+K, yazma alanında değilken `/`, menüdeki arama kutusu. ⌘⇧H tutarları gizler.
- Boşken hızlı işlemler ve bölümler; yazınca kiracılar, bölümler, işlemler, ayarlar tek listede. Ok tuşlarıyla gezinilir, etkin öğe `data-active="true"`.
- Yeni bir eylem/ekran eklediğinde palette de bulunur olmasını sağla (`views`, `actions` dizileri). Arama için `normalizeSearch` / `matchesSearch` kullan.
- Telefonda tam ekran, `.palette-close` görünür, klavye ipuçları gizlenir.

### Rozet ve durum
`.pill .pill-ok|warn|bad|calm` + ikon + metin. Etiketler `statusView`'dan gelir: "Ödendi", "Eksik ödeme", "Gecikti", "Yaklaşıyor", "Ödenecek". Ayrıntı metni `statusDetail` ("3 gün gecikti", "Son gün bugün").

### Boş durum
`<Empty icon={...} title="..." hint="..." />` → `.empty`: duotone ikon (26px, soluk), kısa başlık (`--text-2`), bir cümlelik ipucu (en fazla 34ch). Boş durum ne yapılacağını söyler.

### Dokunma hedefleri
`@media (pointer: coarse)`: `.btn`, `.btn-sm` ≥ 44px, `.icon-btn` 44×44, `.filter` 40px. Takvimdeki `.cal-add` dokunmatikte (`hover: none`) hep görünür. Hover'a bağlı gizli kontrol yapma.

### Diğer
- Odak: `:focus-visible` 2px `--accent` çerçeve, 2px ofset. `outline: none` yazıp yerine bir şey koymamak yasak.
- Klavye kısayolu gösterimi: `<kbd>`.

---

## 8. PDF ve e-posta

İkisi de panelin **açık tema + mavi palet** karşılığıdır; kullanıcının paleti/teması bunlara yansımaz.

### PDF (`src/utils/pdfReport.js`, pdfkit)
- Fontlar: `assets/fonts/Inter-400.ttf`, `Inter-600.ttf`, `Inter-700.ttf` → `registerFont('body' | 'semi' | 'bold')`. Başka font ekleme; Türkçe karakter için gömülü TTF şart.
- Palet `C`: `ink #0c1220`, `ink2 #4a5771`, `ink3 #5d6a82`, `line #dfe4ee`, `lineSoft #eef1f7`, `panel #f5f7fb`, `white #ffffff`, `accent #2b54d4`, `accentSoft #eaeffc`, `ok #0f7a55`/`okSoft #e2f2eb`, `warn #a2660f`/`warnSoft #faf0dd`, `bad #bd3a2c`/`badSoft #fae8e6`, `calm #3d5a80`/`calmSoft #eaeff6`, `mark #ffcf9b`.
- Saydamlık yok: ekrandaki `-soft` rgba tonları burada düz açık renklerdir (baskıda saydamlık okunurluğu düşürür).
- Üst bant 112pt: mürekkep degrade `#16224a → #0c1220 → #1d2f6b`, altında 3pt `C.accent` çizgi, solda vektör logo (54pt), "Vedat Gayrimenkul" 18pt bold beyaz, başlık büyük harf (`toLocaleUpperCase('tr-TR')`) `#93a8e8`.

### E-posta (`src/utils/emailTemplate.js`)
- Palet `C`: `ink #0c1220`, `ink2 #4a5771`, `ink3 #5d6a82`, `line #e4e8f0`, `lineSoft #eef1f7`, `page #eceff6`, `card #ffffff`, `panel #f7f9fc`, `accent #2b54d4`, `accentSoft #edf1fd`, durum renkleri panel ile aynı, soft tonlar düz hex.
- Font yığını: `'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif` (Inter yüklenmez; istemcide varsa kullanılır).
- Başlık PDF ile aynı mürekkep degrade (`linear-gradient(135deg,#16224a 0%,#0c1220 52%,#1d2f6b 100%)`, `background: C.ink` yedeğiyle).
- **E-postada yasak:** `display: flex`, `display: grid`, `backdrop-filter`, `color-mix()`, CSS değişkenleri, harici stil dosyası. Düzen **tablo**, stil **satır içi**, renk **sabit hex**. `inline-block` kullanılabilir. Her dinamik metni `escapeHtml` ile kaçır.
- Para ve tarih sunucu biçimlendiricileriyle (`src/utils/format.js`): `45.000 TL`.

---

## 9. Yapma listesi

- Bileşen CSS'ine ham hex/rgba yazma (`#fff`, `#05070c` gibi mevcut istisnaları çoğaltma); token kullan, yoksa §1/§41'e token ekle.
- Durumu yalnız renkle anlatma; ödendi/gecikti rengini paletle değiştirme.
- Yalnız açık temada test edip bırakma; her yeni renk kuralının koyu karşılığını yaz.
- Tutarı `formatCurrency` / `formatMoneyShort` dışında biçimlendirme (gizlilik modu kırılır).
- `window.confirm`, `alert`, kendi modal bileşenin, tarayıcı `title` tooltip'ine bilgi gömmek.
- `width`, `height`, `top`, `filter: blur` canlandırmak; 400ms üstü UI animasyonu; hareket azaltmayı unutmak.
- Hover'a bağlı tek erişim yolu; 44px altı dokunma hedefi.
- Mobilde 16px altı girdi yazısı; yakınlaştırmayı kapatmak.
- Medya sorgusunu dosyanın ortasına, eski bileşen kuralının yanına koymak (aynı özgüllükte sonra gelen kazanır; §23 notu). Yeni kırılım kuralını ilgili yeni bölümün sonuna, bölüm sırasına dikkat ederek ekle.
- `--fs-*` varken yeni çıplak px yazı boyutu; `--a-*`/`--r-*` dışında ara değer.
- İngilizce ya da "siz" hitaplı arayüz metni; `toUpperCase()`; ₺ simgesi; ondalıklı kira tutarı.
- Yeni npm paketi (ikon, animasyon, UI kütüphanesi) eklemek; ikonlar yalnız `@phosphor-icons/react`.
- E-postada flex/grid/backdrop-filter; PDF'e saydam dolgu.
- Logoyu yeniden renklendirmek ya da vurgu paletine bağlamak.

## 10. Göndermeden önce kontrol listesi

1. Açık **ve** koyu temada, en az iki palette (ör. `mavi`, `seftali`) baktın mı?
2. 1280px, 900px ve 390px genişlikte düzen bozulmuyor mu? Telefonda pencere alttan çıkıyor mu?
3. Gizlilik modu açıkken (⌘⇧H) hiçbir tutar görünmüyor mu?
4. Yeni renkler token mı? `grep -n "#[0-9a-f]\{3,6\}"` ile diff'ini tara.
5. Yeni animasyonlar yalnız transform/opacity mi, `prefers-reduced-motion` ile kapanıyor mu?
6. Her ikon düğmesinin `aria-label`'ı, her pencerenin `SheetFrame`'i var mı? Klavyeyle (Tab, Esc, ⌘K) kullanılabiliyor mu?
7. Metinler kısa, Türkçe, "sen" hitaplı; para `45.000 TL`, gün ekleri `dayWithSuffix` ile mi?
8. Geri alınabilir işlemde toast "Geri al" var mı; yıkıcı işlemde `askConfirm({ tone: "danger" })` var mı?
9. PDF/e-posta değiştiyse kendi `C` paletleri ve kısıtlarıyla mı yazıldı?
10. Testler gerçek `MONGODB_URI` ile değil, yerel bellek içi Mongo ile mi çalıştı?
