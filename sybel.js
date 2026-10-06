// Sybel — dkc.com.tr görüntülü asistan denetleyicisi.
//
// Görünümden bağımsızdır; tasarımdaki öğelere data-sybel-* nitelikleriyle bağlanır:
//
//   [data-sybel-ac]            Pencereyi açan öğe(ler) (kart, düğme)
//   [data-sybel-pencere]       Pencere kabı; açıkken hidden kalkar
//   [data-sybel-durum="ad"]    Durum bölümleri: onay | baglaniyor | gorusme | bitti | hata
//   [data-sybel-onay]          Onay kutusu (checkbox); işaretlenmeden başlatılamaz
//   [data-sybel-baslat]        Görüşmeyi başlat
//   [data-sybel-bitir]         Görüşmeyi bitir
//   [data-sybel-kapat]         Vazgeç / Kapat (birden çok olabilir)
//   [data-sybel-cerceve]       Tavus iframe'inin yerleşeceği kap
//   [data-sybel-sure]          Kalan süre metni (ör. 2:41)
//   [data-sybel-uyari]         Son 30 saniyede görünür olan öğe
//   [data-sybel-hata-metni]    Hata durumunun metni
//
// Pencerenin açık olduğu, <html> üzerindeki data-sybel="acik" niteliğinden okunabilir
// (arka sayfanın kaymasını CSS ile durdurmak için).

(() => {
  const API = 'https://api.dkc.click/public/video-assistant';
  const HATALAR = {
    video_assistant_busy: 'Sybel şu an başka görüşmelerde. Birkaç dakika sonra tekrar deneyin ya da WhatsApp\'tan yazın.',
    video_assistant_ip_limit: 'Bugünlük görüşme hakkınız doldu. Sorunuzu WhatsApp\'tan yazabilirsiniz.',
    video_assistant_daily_limit: 'Sybel bugün çok yoğundu. Yarın tekrar deneyin ya da WhatsApp\'tan yazın.',
    mikrofon: 'Sybel\'in sizi duyabilmesi için mikrofon izni gerekiyor. Adres çubuğundaki izin simgesinden açıp tekrar deneyin.',
    genel: 'Şu an Sybel\'e bağlanamadık. Biraz sonra tekrar deneyin ya da WhatsApp\'tan yazın.'
  };

  const pencere = document.querySelector('[data-sybel-pencere]');
  if (!pencere) return;
  const $ = (secici) => pencere.querySelector(secici);
  const onay = $('[data-sybel-onay]'), baslat = $('[data-sybel-baslat]'), cerceve = $('[data-sybel-cerceve]');
  const sureMetni = $('[data-sybel-sure]'), uyari = $('[data-sybel-uyari]'), hataMetni = $('[data-sybel-hata-metni]');

  let gorusme = null, sayac = null, oncekiOdak = null;

  function durum(ad) {
    pencere.querySelectorAll('[data-sybel-durum]').forEach((bolum) => { bolum.hidden = bolum.dataset.sybelDurum !== ad; });
    pencere.dataset.durum = ad;
    const odak = pencere.querySelector(`[data-sybel-durum="${ad}"] [autofocus], [data-sybel-durum="${ad}"] button:not([disabled])`);
    odak?.focus();
  }

  function ac() {
    oncekiOdak = document.activeElement;
    if (onay) onay.checked = false;
    if (baslat) baslat.disabled = Boolean(onay);
    pencere.hidden = false;
    document.documentElement.dataset.sybel = 'acik';
    durum('onay');
  }

  function kapat() {
    if (gorusme) void bitir({ sessiz: true });
    pencere.hidden = true;
    delete document.documentElement.dataset.sybel;
    oncekiOdak?.focus?.();
  }

  function hata(kod) {
    temizle();
    if (hataMetni) hataMetni.textContent = HATALAR[kod] || HATALAR.genel;
    durum('hata');
  }

  function temizle() {
    clearInterval(sayac); sayac = null;
    cerceve?.replaceChildren();
    if (uyari) uyari.hidden = true;
  }

  // Safari dahil, izin penceresini görüşme odası açılmadan önce burada çıkarıyoruz;
  // reddedilirse ziyaretçiye ne yapacağını söyleyebilelim.
  async function mikrofonIzni() {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const akis = await navigator.mediaDevices.getUserMedia({ audio: true });
      akis.getTracks().forEach((iz) => iz.stop());
      return true;
    } catch {
      return false;
    }
  }

  async function basla() {
    if (onay && !onay.checked) return;
    durum('baglaniyor');
    if (!await mikrofonIzni()) return hata('mikrofon');

    let yanit;
    try {
      const r = await fetch(`${API}/conversations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      yanit = await r.json().catch(() => ({}));
      if (!r.ok) return hata(yanit.error);
    } catch {
      return hata('genel');
    }
    gorusme = yanit;

    const iframe = document.createElement('iframe');
    const adres = new URL(yanit.conversationUrl);
    if (yanit.meetingToken) adres.searchParams.set('t', yanit.meetingToken);
    iframe.src = adres.toString();
    iframe.allow = 'camera; microphone; autoplay; fullscreen; display-capture';
    iframe.title = 'Sybel ile görüntülü görüşme';
    iframe.setAttribute('allowfullscreen', '');
    cerceve?.replaceChildren(iframe);
    durum('gorusme');
    geriSay(yanit.maxDurationSeconds || 180);
  }

  function geriSay(saniye) {
    const bitis = Date.now() + saniye * 1000;
    const yaz = () => {
      const kalan = Math.max(0, Math.round((bitis - Date.now()) / 1000));
      if (sureMetni) sureMetni.textContent = `${Math.floor(kalan / 60)}:${String(kalan % 60).padStart(2, '0')}`;
      if (uyari) uyari.hidden = kalan > 30;
      // Tavus odayı kendisi kapatır; biz de ekranı bitti durumuna alırız.
      if (kalan === 0) void bitir();
    };
    yaz();
    sayac = setInterval(yaz, 1000);
  }

  async function bitir({ sessiz = false } = {}) {
    const g = gorusme;
    gorusme = null;
    temizle();
    if (!sessiz) durum('bitti');
    if (!g) return;
    try {
      await fetch(`${API}/conversations/end`, {
        method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: g.conversationId, endToken: g.endToken })
      });
    } catch {
      // Ziyaretçi ayrılınca Tavus odayı 10 saniye içinde kendisi kapatıyor.
    }
  }

  document.querySelectorAll('[data-sybel-ac]').forEach((oge) => oge.addEventListener('click', (e) => { e.preventDefault(); ac(); }));
  pencere.querySelectorAll('[data-sybel-kapat]').forEach((oge) => oge.addEventListener('click', kapat));
  onay?.addEventListener('change', () => { if (baslat) baslat.disabled = !onay.checked; });
  baslat?.addEventListener('click', () => void basla());
  $('[data-sybel-bitir]')?.addEventListener('click', () => void bitir());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pencere.hidden) kapat(); });
})();
