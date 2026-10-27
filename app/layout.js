import { Inter } from "next/font/google";
import "../styles.css";

// latin-ext şart: "ğ ş İ" bu alt kümede. Yalnız latin alınırsa Türkçe metin
// görünür biçimde bozulur ve "ç ö ü" Latin-1'de olduğu için hata gizlenir.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

const siteUrl = process.env.PUBLIC_APP_URL || "https://rent-track-bot.vercel.app";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: "Vedat Gayrimenkul · Kira takip paneli",
  description: "Kiracı, ödeme ve Telegram bildirimlerini tek akışta yönet.",
  applicationName: "Kira Takip",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Vedat Gayrimenkul · Kira takip paneli",
    description: "Kiracı, ödeme ve Telegram bildirimlerini tek akışta yönet.",
    url: siteUrl,
    siteName: "Vedat Gayrimenkul",
    locale: "tr_TR",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Vedat Gayrimenkul — Kira operasyonu",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vedat Gayrimenkul · Kira takip paneli",
    description: "Kiracı, ödeme ve Telegram bildirimlerini tek akışta yönet.",
    images: ["/opengraph-image"],
  },
  icons: {
    icon: [
      { url: "/icons/vedat-mark.svg", type: "image/svg+xml" },
      { url: "/icons/favicon.png", sizes: "64x64", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // iPhone'da ana ekrana eklendiğinde tam uygulama gibi açılsın
  appleWebApp: {
    capable: true,
    title: "Kira Takip",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d15" },
  ],
  width: "device-width",
  initialScale: 1,
  // Kullanıcı yakınlaştırmayı kapatmıyoruz; erişilebilirlik için açık kalmalı
  maximumScale: 5,
  viewportFit: "cover",
};

// Tema ilk boyamadan önce yerleşir; yoksa açık tema bir kare görünür.
const themeBoot = `(function(){try{var s=localStorage.getItem("kira-akis-theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=(s==="dark"||s==="light")?s:(d?"dark":"light");var a=localStorage.getItem("kira-akis-accent");if(a)document.documentElement.dataset.accent=a;var p=localStorage.getItem("kira-akis-privacy");if(p==="on")document.documentElement.dataset.privacy="on";}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
