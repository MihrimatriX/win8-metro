/**
 * Messages in the Mail app's inbox. They are written by AFU to the visitor and introduce the site.
 * Edit freely; `from` should stay a name visitors recognize.
 */
import type { L } from "@/lib/types";

export type Message = { id: string; from: string; subject: L; preview: L; body: L; date: string; unread?: boolean; app?: "projects" | "profile" | "reader" };

export const inbox: Message[] = [
  {
    id: "welcome",
    from: "AFU",
    subject: { tr: "Hoş geldin!", en: "Welcome!" },
    preview: { tr: "Bu bilgisayar benim portfolyom. Kutucuklar projelerim…", en: "This PC is my portfolio. The tiles are my projects…" },
    body: {
      tr: "Merhaba,\n\nBu bilgisayar benim portfolyom. Başlangıç ekranındaki her kutucuk bir projem ya da hakkımda bir bölüm. Projeler uygulamasında hepsinin ayrıntıları, Profil'de özgeçmişim, Okuyucu'da yazılarım var.\n\nSağ üst köşeye gidersen charm çubuğu açılır: oradan arayabilir, renkleri değiştirebilir ya da bilgisayarı kapatabilirsin.\n\nİyi gezintiler,\nAFU",
      en: "Hi,\n\nThis PC is my portfolio. Every tile on the Start screen is one of my projects or a part of my story. The Projects app has the details, Profile has my CV and Reader has my writing.\n\nMove to the top-right corner to open the charms bar: search, change the colors or shut the PC down from there.\n\nEnjoy the tour,\nAFU",
    },
    date: "2026-10-01",
    unread: true,
  },
  {
    id: "cv",
    from: "AFU",
    subject: { tr: "Özgeçmişim ekte", en: "My CV is attached" },
    preview: { tr: "Deneyim, yetenekler ve eğitim tek sayfada…", en: "Experience, skills and education on one page…" },
    body: {
      tr: "Özgeçmişimin tamamı Profil uygulamasında. Deneyimlerimi, yeteneklerimi ve eğitimimi orada bulabilirsin; PDF'i de oradan indirebilirsin.\n\nBir pozisyon için yazıyorsan doğrudan yanıtla, en kısa sürede dönerim.",
      en: "My full CV lives in the Profile app. You'll find my experience, skills and education there, and you can download the PDF too.\n\nIf you're writing about a role, just reply and I'll get back to you soon.",
    },
    date: "2026-09-30",
    unread: true,
    app: "profile",
  },
  {
    id: "projects",
    from: "AFU",
    subject: { tr: "Son projelerim", en: "My latest projects" },
    preview: { tr: "Blog, konsol vitrini ve şu an içinde olduğun Metro ekranı…", en: "The blog, the console showcase and the Metro screen you're in…" },
    body: {
      tr: "Son dönemde üç şeyle uğraşıyorum: 3D açılışlı kişisel blogum, projelerimi bir konsol ana ekranında sergileyen vitrin ve şu an içinde olduğun Metro Başlangıç ekranı.\n\nHepsinin ayrıntıları ve bağlantıları Projeler uygulamasında.",
      en: "Lately I've been working on three things: my personal blog with a 3D intro, a showcase that presents my projects on a console home screen, and the Metro Start screen you're in right now.\n\nDetails and links are in the Projects app.",
    },
    date: "2026-09-29",
    unread: true,
    app: "projects",
  },
  {
    id: "writing",
    from: "AFU",
    subject: { tr: "Yeni yazılar ve eğitimler", en: "New posts and tutorials" },
    preview: { tr: "React Three Fiber, hareket ve Web Audio üzerine…", en: "On React Three Fiber, motion and Web Audio…" },
    body: {
      tr: "Okuyucu uygulamasında yazılarım, eğitim serilerim ve konuşmalarım var. En yenisi Web Audio ile dosya kullanmadan arayüz sesleri üretmek üzerine.",
      en: "The Reader app has my posts, tutorial series and talks. The newest one is about making UI sounds with Web Audio, without any audio files.",
    },
    date: "2026-09-25",
    app: "reader",
  },
];
