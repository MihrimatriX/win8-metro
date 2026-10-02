# Windows 8.1 · tarayıcıda

Tarayıcıda çalışan bir Windows 8.1 klonu ve aynı zamanda AFU'nun portfolyosu. Next.js + TypeScript, iki dilli (TR/EN).
Masaüstü ve tablette Windows 8.1, telefonda Windows Phone 8.1 düzeni açılır.

![Başlangıç ekranı](docs/screenshots/start.png)

| Charm çubuğu | Masaüstü |
| --- | --- |
| ![Charm çubuğu](docs/screenshots/charms.png) | ![Masaüstü](docs/screenshots/desktop.png) |

![Metro uygulama simgeleri](docs/screenshots/icons.png)

## Neler var

- **Gerçek masaüstü:** Windows 8 pencere çerçevesi (ortalanmış başlık, küçült / büyüt / kırmızı kapat), Aero Snap, kenarlardan boyutlandırma,
  görev çubuğu (Başlat düğmesi, sabitlenmiş ve çalışan programlar, önizleme, saat/takvim, ses, dil, İşlem Merkezi, Ağlar paneli, Masaüstünü göster),
  Win+X menüsü, masaüstü simgeleri (sürükle-bırak, seçim dikdörtgeni, yeniden adlandırma, Geri Dönüşüm Kutusu), sağ tık menüleri, Özellikler penceresi.
- **Sanal dosya sistemi** (`lib/fs.ts`): `C:\Users\AFU\Belgeler`, Resimler, Müzik… localStorage'da kalıcı; Aç / Farklı Kaydet iletişim kutuları, pano (kes/kopyala/yapıştır).
- **Pencere yöneticisi** (`lib/wm.ts`): odak, z-sırası, modal iletişim kutuları, "değişiklikleri kaydet?" kapatma koruması. Pencereler Başlangıç'a gidip gelince kaybolmaz.
- **Windows 8 görünümü:** Windows logosu, Segoe UI Symbol tarzında yeniden çizilmiş Metro glifleri, Selawik yazı tipi (Segoe UI yoksa), Windows 8.1 varsayılan Başlangıç düzeni,
  çalışan kutucuk sürükleme, grup adlandırma, masaüstü arka planını Başlangıç'ta gösterme, kategoriye göre Uygulamalar görünümü, dosya ve program arayan Ara charm'ı.
- Programlar: Not Defteri, Çalıştır, Windows Hakkında ve Hesap Makinesi'nin ilk sürümleri var ama yarım kaldı ve henüz test edilmedi.
  Diğer masaüstü ve Metro uygulamaları (Dosya Gezgini, Paint, Komut İstemi, IE, Hava Durumu, Haritalar…) kayıtlı ve açılıyor, şimdilik içleri boş.

Derin bağlantı: `?boot=1&open=notepad` açılışı, kilit ve oturum açmayı atlayıp doğrudan bir uygulamayı açar.

> Hayran yapımıdır, Microsoft ile bağlantılı değildir. Windows adı ve logosu Microsoft'un ticari markasıdır; tüm simgeler sıfırdan SVG olarak çizildi.
> Selawik yazı tipi Microsoft tarafından SIL Open Font License ile yayımlanmıştır (`public/fonts/Selawik-OFL.txt`).

## Bölümler ve karşılıkları

| Windows'ta | Portfolyoda |
| --- | --- |
| Kilit ekranı | Saat, tarih, bildirim sayıları; yukarı sürükleyerek açılır. Resmi Fotoğraflar'dan ya da ayarlardan seçilir |
| Oturum açma | AFU, Misafir ve İşe alım (doğrudan Profil'e gider) hesapları; dil (TUR/ENG) ve güç düğmesi |
| İlk açılış ("Merhaba") | Renk değiştiren kurulum ekranı ve köşeleri anlatan kısa tanıtım |
| Başlangıç ekranı | Gruplar halinde canlı kutucuklar: Ben, Projeler, Okuma köşesi, Bağlantılar |
| Projeler (Mağaza) | Tüm projeler; her proje kendi mağaza sayfasında: genel bakış, ekran görüntüleri, özellikler, ayrıntılar, kilometre taşları |
| Profil (Kişiler) | Özgeçmiş: deneyim, yetenekler, eğitim, diller, sertifikalar, bağlantılar |
| Posta | Ziyaretçiye yazılmış tanıtım iletileri; "Yeni" ile AFU'ya e-posta yazılır |
| Okuyucu (Haberler) | Blog yazıları, eğitimler ve konuşmalar |
| Fotoğraflar | Tüm proje ve yazı görselleri, slayt gösterisi, kilit ekranı yapma |
| Müzik | Tarayıcıda anlık sentezlenen üç parça ve canlı spektrum |
| Başarılar | Sertifikalar ve ödüller + ziyaretçinin gezerken kazandığı başarılar |
| Takvim | Yazılar ve sertifikalar ay görünümünde, deneyim zaman çizelgesinde |
| Masaüstü | Görev çubuğu, sürüklenebilir pencereler: Dosya Gezgini (her proje bir klasör), Not Defteri, resim görüntüleyici |
| Charm çubuğu | Ara, Paylaş, Başlangıç, Cihazlar, Ayarlar (kişiselleştir, ses, animasyon, dil, güç) |
| Bilgisayar ayarları | Kilit ekranı resmi, renkler, desen, hesap, dil, erişim kolaylığı, başarıları sıfırlama, bilgisayar bilgisi |

## Kontroller

| | Fare / klavye | Dokunmatik |
| --- | --- | --- |
| Charm çubuğu | Sağ üst ya da sağ alt köşe | Sağ kenardan içeri kaydır |
| Önceki uygulama | Sol üst köşe | Sol kenardan içeri kaydır |
| Başlangıç'a dön | Sol alt köşe, Windows tuşu | Charm çubuğundaki Başlangıç |
| Kutucuk menüsü | Sağ tık (yeniden boyutlandır, kaldır, canlı kutucuk) | Basılı tut |
| Kutucuğu taşı | Tıkla ve sürükle | Kutucuğu aşağı/yukarı çek |
| Uygulamayı kapat | Üst kenara gel → X; ya da üst kenardan aşağı sürükle | Üst kenardan aşağı sürükle |
| Win+X menüsü | Sol alt köşeye ya da görev çubuğundaki Başlat'a sağ tık | |
| Masaüstü pencereleri | Kenara sürükle: yarım ekran / tam ekran (Aero Snap); kenarlardan boyutlandır; masaüstüne sağ tık | |
| Uzaklaştır | Sağ alttaki "−" ya da Ctrl + tekerlek | Sağ alttaki "−" |
| Ara | Başlangıç'ta yazmaya başla | Charm'daki Ara |
| Geri | Esc / Backspace / yuvarlak geri oku | Geri oku |

Telefonda: alttaki gezinme çubuğu (geri, Başlangıç, ara), sola kaydırınca uygulama listesi, üst çubuktan aşağı çekince işlem merkezi.

## İçeriği değiştirmek

- `content/portfolio.ts`: profil (CV), projeler, yazılar, sertifikalar, bağlantılar. `ps5-showcase/content/portfolio.ts` ile aynı yapıda;
  gerçek bilgiler birine girildiğinde diğerine kopyalanabilir.
- `content/mailbox.ts`: Posta uygulamasındaki tanıtım iletileri.
- `lib/model.ts`: Başlangıç ekranının varsayılan kutucuk düzeni, renkler ve ziyaretçi başarıları.

`sample: true` işaretli girdiler örnek içeriktir ve "Örnek içerik" rozetiyle görünür; kendi bilginle değiştirince bayrağı sil.
`#` olan bağlantılar açılmaz, "Bu bağlantı henüz eklenmedi" der.

## Çalıştırma

```bash
cd win8-metro
npm install
npm run dev        # http://localhost:3200
npm run build
npm run preview    # preview/index.html: kurulum gerektirmeyen tek dosyalık sürüm
```

Bu klasör kökteki blogdan ve `ps5-showcase`'ten bağımsızdır. Vercel'de ayrı bir proje olarak yayınlamak için "Root Directory" olarak
`win8-metro` seçilir.
