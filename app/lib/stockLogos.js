/* Kağıt kodu → şirketin web adresi. Logo bu adresten (sitenin kendi
   simgesi) çekilir; anahtar ya da ücretli servis gerekmez. Listede olmayan
   kağıt için kullanıcı web adresini ya da logo bağlantısını kendisi girer. */
export const TICKER_DOMAINS = {
  // BIST
  AEFES: "anadoluefes.com",
  AGHOL: "anadolugrubu.com.tr",
  AKBNK: "akbank.com",
  AKSA: "aksa.com",
  AKSEN: "aksenerji.com.tr",
  ALARK: "alarko.com.tr",
  ARCLK: "arcelikglobal.com",
  ASELS: "aselsan.com",
  ASTOR: "astorenerji.com.tr",
  BIMAS: "bim.com.tr",
  BRSAN: "borusan.com",
  CCOLA: "cci.com.tr",
  CIMSA: "cimsa.com.tr",
  DOAS: "dogusotomotiv.com.tr",
  DOHOL: "doganholding.com.tr",
  EKGYO: "emlakkonut.com.tr",
  ENJSA: "enerjisa.com.tr",
  ENKAI: "enka.com",
  EREGL: "erdemir.com.tr",
  FROTO: "fordotosan.com.tr",
  GARAN: "garantibbva.com.tr",
  GUBRF: "gubretas.com.tr",
  HALKB: "halkbank.com.tr",
  HEKTS: "hektas.com.tr",
  ISCTR: "isbank.com.tr",
  ISMEN: "isyatirim.com.tr",
  KCHOL: "koc.com.tr",
  KONTR: "kontrolmatik.com",
  KOZAL: "kozaaltin.com.tr",
  KRDMD: "kardemir.com",
  LOGO: "logo.com.tr",
  MAVI: "mavi.com",
  MGROS: "migros.com.tr",
  ODAS: "odasenerji.com",
  OTKAR: "otokar.com.tr",
  OYAKC: "oyakcimento.com",
  PETKM: "petkim.com.tr",
  PGSUS: "flypgs.com",
  SAHOL: "sabanci.com",
  SASA: "sasa.com.tr",
  SISE: "sisecam.com.tr",
  SOKM: "sokmarket.com.tr",
  TAVHL: "tavhavalimanlari.com.tr",
  TCELL: "turkcell.com.tr",
  THYAO: "turkishairlines.com",
  TKFEN: "tekfen.com.tr",
  TOASO: "tofas.com.tr",
  TSKB: "tskb.com.tr",
  TTKOM: "turktelekom.com.tr",
  TTRAK: "turktraktor.com.tr",
  TUPRS: "tupras.com.tr",
  ULKER: "ulker.com.tr",
  VAKBN: "vakifbank.com.tr",
  VESTL: "vestel.com.tr",
  YKBNK: "yapikredi.com.tr",
  // ABD
  AAPL: "apple.com",
  AMZN: "amazon.com",
  GOOGL: "google.com",
  META: "meta.com",
  MSFT: "microsoft.com",
  NFLX: "netflix.com",
  NVDA: "nvidia.com",
  TSLA: "tesla.com",
};

export function stockDomain(stock) {
  return (stock.website || TICKER_DOMAINS[String(stock.symbol || "").toLocaleUpperCase("tr-TR")] || "").trim();
}

/* Sırayla denenecek logo adresleri: elle girilen bağlantı, sonra web
   adresinden iki ayrı simge servisi. Hepsi düşerse kodun harfleri görünür. */
export function logoSources(stock) {
  const list = [];
  if (stock.logoUrl) list.push(stock.logoUrl);
  const domain = stockDomain(stock);
  if (domain) {
    list.push("https://www.google.com/s2/favicons?domain=" + encodeURIComponent(domain) + "&sz=128");
    list.push("https://icons.duckduckgo.com/ip3/" + encodeURIComponent(domain) + ".ico");
  }
  return list;
}
