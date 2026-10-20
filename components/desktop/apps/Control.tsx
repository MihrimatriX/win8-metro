"use client";
/**
 * Control Panel (Denetim Masası) as in Windows 8.1: Explorer-style address bar with back / forward / up,
 * breadcrumbs and search, the category home with its green headings, All Control Panel Items in large or small
 * icons, and the applets that matter here — System, Personalization (theme, desktop background, window color),
 * Programs and Features, Date and Time, Sound, User Accounts, Display, Region and the Ease of Access Center —
 * wired to the real OS preferences. Things Windows 8.1 hands to PC settings open the Metro Settings app.
 * The window argument picks the first page ("system", "personalize", "programs"…).
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useOS, useTick } from "@/lib/os";
import { APPS, type ShellIconName } from "@/lib/model";
import { fs, join, basename, formatSize, useFS, USER, KNOWN } from "@/lib/fs";
import { sound } from "@/lib/sound";
import type { L } from "@/lib/types";
import { ShellIcon } from "../../icons/ShellIcons";
import { WinLogo } from "../../Icons";
import { Avatar } from "../../Lock";
import { Wallpaper } from "../Wallpaper";
import { Btn, ContextMenu, TextBox, useWindow } from "../ui";
import { msgBox } from "../dialogs";
import "./control.css";

const l = (tr: string, en: string): L => ({ tr, en });

/** Navigate: a page id, "pc:<category>" for PC settings, or anything else for "not available here". */
type Go = (to: string, label?: string) => void;

const CATS: { id: string; icon: ShellIconName; name: L; links: [L, string][] }[] = [
  {
    id: "security",
    icon: "shield",
    name: l("Sistem ve Güvenlik", "System and Security"),
    links: [
      [l("Bilgisayarınızın durumunu gözden geçirin", "Review your computer's status"), "action"],
      [
        l(
          "Dosyalarınızın yedek kopyalarını Dosya Geçmişi ile kaydedin",
          "Save backup copies of your files with File History",
        ),
        "filehistory",
      ],
      [l("Sorunları bul ve düzelt", "Find and fix problems"), "troubleshoot"],
    ],
  },
  {
    id: "network",
    icon: "network",
    name: l("Ağ ve İnternet", "Network and Internet"),
    links: [
      [l("Ağ durumunu ve görevleri görüntüleyin", "View network status and tasks"), "network"],
      [l("Ev grubu ve paylaşım seçeneklerini belirleyin", "Choose homegroup and sharing options"), "pc:network"],
    ],
  },
  {
    id: "hardware",
    icon: "devices",
    name: l("Donanım ve Ses", "Hardware and Sound"),
    links: [
      [l("Aygıtları ve yazıcıları görüntüleyin", "View devices and printers"), "devices"],
      [l("Aygıt ekleyin", "Add a device"), "devices"],
    ],
  },
  {
    id: "programs",
    icon: "programs",
    name: l("Programlar", "Programs"),
    links: [[l("Program kaldırın", "Uninstall a program"), "programs"]],
  },
  {
    id: "accounts",
    icon: "accounts",
    name: l("Kullanıcı Hesapları ve Aile Güvenliği", "User Accounts and Family Safety"),
    links: [
      [l("Hesap türünü değiştirin", "Change account type"), "accounts"],
      [
        l("Herhangi bir kullanıcı için Aile Güvenliği'ni ayarlayın", "Set up Family Safety for any user"),
        "pc:accounts",
      ],
    ],
  },
  {
    id: "appearance",
    icon: "personalize",
    name: l("Görünüm ve Kişiselleştirme", "Appearance and Personalization"),
    links: [
      [l("Temayı değiştirin", "Change the theme"), "personalize"],
      [l("Masaüstü arka planını değiştirin", "Change desktop background"), "background"],
      [l("Ekran çözünürlüğünü ayarlayın", "Adjust screen resolution"), "display"],
    ],
  },
  {
    id: "clock",
    icon: "clock",
    name: l("Saat, Dil ve Bölge", "Clock, Language, and Region"),
    links: [
      [l("Dil ekleyin", "Add a language"), "region"],
      [l("Giriş yöntemlerini değiştirin", "Change input methods"), "region"],
      [l("Tarih, saat veya sayı biçimlerini değiştirin", "Change date, time, or number formats"), "region"],
    ],
  },
  {
    id: "ease",
    icon: "ease",
    name: l("Erişim Kolaylığı", "Ease of Access"),
    links: [
      [l("Windows'un ayar önermesine izin verin", "Let Windows suggest settings"), "ease"],
      [l("Görsel ekranı iyileştirin", "Optimize visual display"), "ease"],
    ],
  },
];

/** All Control Panel Items: page id, icon, name, category. */
const ITEMS: [string, ShellIconName, L, string][] = [
  ["action", "shield", l("Eylem Merkezi", "Action Center"), "security"],
  ["admin", "control", l("Yönetimsel Araçlar", "Administrative Tools"), "security"],
  ["autoplay", "dvd", l("Otomatik Kullan", "AutoPlay"), "hardware"],
  ["bitlocker", "drive-system", l("BitLocker Sürücü Şifrelemesi", "BitLocker Drive Encryption"), "security"],
  ["credentials", "accounts", l("Kimlik Bilgisi Yöneticisi", "Credential Manager"), "accounts"],
  ["datetime", "clock", l("Tarih ve Saat", "Date and Time"), "clock"],
  ["defaults", "programs", l("Varsayılan Programlar", "Default Programs"), "programs"],
  ["devmgmt", "thispc", l("Aygıt Yöneticisi", "Device Manager"), "hardware"],
  ["devices", "devices", l("Aygıtlar ve Yazıcılar", "Devices and Printers"), "hardware"],
  ["display", "display", l("Ekran", "Display"), "appearance"],
  ["ease", "ease", l("Erişim Kolaylığı Merkezi", "Ease of Access Center"), "ease"],
  ["family", "user", l("Aile Güvenliği", "Family Safety"), "accounts"],
  ["filehistory", "drive", l("Dosya Geçmişi", "File History"), "security"],
  ["folders", "folder", l("Klasör Seçenekleri", "Folder Options"), "appearance"],
  ["fonts", "fonts", l("Yazı Tipleri", "Fonts"), "appearance"],
  ["homegroup", "homegroup", l("Ev Grubu", "HomeGroup"), "network"],
  ["internet", "ie", l("İnternet Seçenekleri", "Internet Options"), "network"],
  ["keyboard", "keyboard", l("Klavye", "Keyboard"), "hardware"],
  ["mouse", "mouse", l("Fare", "Mouse"), "hardware"],
  ["network", "network", l("Ağ ve Paylaşım Merkezi", "Network and Sharing Center"), "network"],
  ["notifications", "control", l("Bildirim Alanı Simgeleri", "Notification Area Icons"), "appearance"],
  ["personalize", "personalize", l("Kişiselleştirme", "Personalization"), "appearance"],
  ["power", "power", l("Güç Seçenekleri", "Power Options"), "hardware"],
  ["programs", "programs", l("Programlar ve Özellikler", "Programs and Features"), "programs"],
  ["recovery", "drive-system", l("Kurtarma", "Recovery"), "security"],
  ["region", "region", l("Bölge", "Region"), "clock"],
  ["sound", "sound", l("Ses", "Sound"), "hardware"],
  ["system", "thispc", l("Sistem", "System"), "security"],
  ["taskbar", "taskmgr", l("Görev Çubuğu ve Gezinti", "Taskbar and Navigation"), "appearance"],
  ["troubleshoot", "msg-warning", l("Sorun Giderme", "Troubleshooting"), "security"],
  ["accounts", "accounts", l("Kullanıcı Hesapları", "User Accounts"), "accounts"],
  ["defender", "shield", l("Windows Defender", "Windows Defender"), "security"],
  ["firewall", "shield", l("Windows Güvenlik Duvarı", "Windows Firewall"), "security"],
  ["update", "update", l("Windows Update", "Windows Update"), "security"],
];
const ITEM = Object.fromEntries(ITEMS.map((x) => [x[0], x]));
/** Personalization's own pages. */
const SUB: Record<string, L> = {
  background: l("Masaüstü Arka Planı", "Desktop Background"),
  color: l("Renk ve Görünüm", "Color and Appearance"),
};
/** Items Windows 8.1 hands over to PC settings. */
const PC: Record<string, string> = { family: "accounts", homegroup: "network", update: "update" };
/** Other names pages are opened by (Run's control.exe arguments, older links). */
const ALIAS: Record<string, string> = {
  all: "home",
  personalization: "personalize",
  useraccounts: "accounts",
  clock: "datetime",
  time: "datetime",
  language: "region",
  desktop: "background",
};
const pageOf = (arg?: string) => {
  const p = (arg || "home").toLowerCase();
  return ALIAS[p] ?? p;
};
const known = (p: string) => p === "home" || p.startsWith("cat:") || !!ITEM[p] || !!SUB[p];

type View = "category" | "large" | "small";
const VIEW_KEY = "afu-metro:v2:cp-view";

export default function ControlApp() {
  const { id, win, setTitle } = useWindow();
  const { lang, open } = useOS();
  const tr = lang === "tr";
  const first = pageOf(win.arg);
  const [hist, setHist] = useState({ list: [known(first) ? first : "home"], i: 0 });
  const [query, setQuery] = useState("");
  const [view, setViewState] = useState<View>(() => {
    try {
      return (window.localStorage.getItem(VIEW_KEY) as View) || "category";
    } catch {
      return "category";
    }
  });
  const [viewMenu, setViewMenu] = useState<{ x: number; y: number } | null>(null);
  const page = hist.list[hist.i];
  const cat = (p: string) => (p.startsWith("cat:") ? p.slice(4) : SUB[p] ? "appearance" : ITEM[p]?.[3]);
  const catName = (c: string) => CATS.find((x) => x.id === c)?.name[lang] ?? "";
  const home =
    view === "category"
      ? tr
        ? "Denetim Masası"
        : "Control Panel"
      : tr
        ? "Tüm Denetim Masası Öğeleri"
        : "All Control Panel Items";

  // Address bar: Control Panel › [All Control Panel Items | category] › [Personalization ›] page
  const crumbs: [string, string][] = [["home", tr ? "Denetim Masası" : "Control Panel"]];
  if (view !== "category") crumbs.push(["home", home]);
  else if (page !== "home") crumbs.push([`cat:${cat(page)}`, catName(cat(page) ?? "")]);
  if (SUB[page]) crumbs.push(["personalize", ITEM.personalize[2][lang]]);
  if (ITEM[page] || SUB[page]) crumbs.push([page, (ITEM[page]?.[2] ?? SUB[page])[lang]]);
  const title = query ? (tr ? "Arama Sonuçları" : "Search Results") : crumbs[crumbs.length - 1][1];

  useEffect(() => setTitle(title), [title, setTitle]);

  const go: Go = (to, label = "") => {
    setQuery("");
    const p = pageOf(to);
    if (p.startsWith("pc:") || PC[p]) return open({ kind: "app", app: "settings", param: PC[p] ?? p.slice(3) });
    if (!known(p)) {
      void msgBox(id, {
        title: label || (tr ? "Denetim Masası" : "Control Panel"),
        text: tr
          ? "Bu özellik Windows'un bu sürümünde kullanılamıyor."
          : "This feature isn't available in this version of Windows.",
        icon: "info",
        buttons: [tr ? "Tamam" : "OK"],
      });
      return;
    }
    if (p === page) return;
    setHist({ list: [...hist.list.slice(0, hist.i + 1), p], i: hist.i + 1 });
  };
  const step = (d: number) => {
    setQuery("");
    setHist({ ...hist, i: hist.i + d });
  };
  const setView = (v: View) => {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembered */
    }
    if (page.startsWith("cat:")) go("home");
  };

  const body = () => {
    if (query) return <Results go={go} query={query} />;
    if (page === "home") return view === "category" ? <Home go={go} /> : <AllItems go={go} small={view === "small"} />;
    if (page.startsWith("cat:")) return <CatPage go={go} cat={page.slice(4)} />;
    switch (page) {
      case "system":
        return <SystemPage go={go} />;
      case "personalize":
        return <Personalize go={go} />;
      case "background":
        return <Background go={go} />;
      case "color":
        return <ColorPage go={go} />;
      case "programs":
        return <Programs go={go} />;
      case "datetime":
        return <DateTime go={go} />;
      case "sound":
        return <SoundPage go={go} />;
      case "accounts":
        return <Accounts go={go} />;
      case "display":
        return <Display go={go} />;
      case "region":
        return <Region go={go} />;
      case "ease":
        return <Ease go={go} />;
    }
    return <Stub go={go} page={page} />;
  };

  const views: [View, string][] = [
    ["category", tr ? "Kategori" : "Category"],
    ["large", tr ? "Büyük simgeler" : "Large icons"],
    ["small", tr ? "Küçük simgeler" : "Small icons"],
  ];
  return (
    <div className="cp">
      <div className="cp-bar">
        <button className="cp-nav" disabled={hist.i === 0} onClick={() => step(-1)} aria-label={tr ? "Geri" : "Back"}>
          ←
        </button>
        <button
          className="cp-nav"
          disabled={hist.i >= hist.list.length - 1}
          onClick={() => step(1)}
          aria-label={tr ? "İleri" : "Forward"}
        >
          →
        </button>
        <button
          className="cp-up"
          disabled={crumbs.length < 2 && !query}
          onClick={() => (query ? setQuery("") : go(crumbs[crumbs.length - 2][0]))}
          aria-label={tr ? "Yukarı" : "Up"}
        >
          ↑
        </button>
        <div className="cp-addr">
          <ShellIcon name="control" size={16} />
          {crumbs.map(([p, label], i) => (
            <button key={i} onClick={() => go(p)}>
              {label}
              <span className="cp-sep">›</span>
            </button>
          ))}
        </div>
        <TextBox
          className="cp-search"
          placeholder={tr ? "Denetim Masasında Ara" : "Search Control Panel"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="cp-body">
        {page === "home" && !query && (
          <div className="cp-viewby">
            {tr ? "Görüntüleme ölçütü:" : "View by:"}
            <button
              className="cp-link"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setViewMenu({ x: r.left, y: r.bottom });
              }}
            >
              {views.find((v) => v[0] === view)?.[1]} ▾
            </button>
          </div>
        )}
        {body()}
      </div>
      {viewMenu && (
        <ContextMenu
          x={viewMenu.x}
          y={viewMenu.y}
          onClose={() => setViewMenu(null)}
          items={views.map(([v, label]) => ({ label, radio: true, checked: v === view, onClick: () => setView(v) }))}
        />
      )}
    </div>
  );
}

// =====================================================================================================
// Building blocks
// =====================================================================================================

function useTr() {
  const { lang } = useOS();
  return { lang, tr: lang === "tr" };
}

function Link({ children, onClick, shield }: { children: ReactNode; onClick: () => void; shield?: boolean }) {
  return (
    <button className="cp-link" onClick={onClick}>
      {shield && <ShellIcon name="shield" size={16} />}
      {children}
    </button>
  );
}

/** The left task pane: Control Panel Home, the page's tasks and "See also". */
function Side({ go, tasks = [], also = [] }: { go: Go; tasks?: [string, string][]; also?: [string, string][] }) {
  const { tr } = useTr();
  const row = ([label, to]: [string, string]) => (
    <Link key={label} onClick={() => go(to, label)}>
      {label}
    </Link>
  );
  return (
    <nav className="cp-side">
      <Link onClick={() => go("home")}>{tr ? "Denetim Masası Giriş Sayfası" : "Control Panel Home"}</Link>
      {tasks.map(row)}
      {also.length > 0 && (
        <div className="cp-also">
          <h4>{tr ? "Ayrıca bkz." : "See also"}</h4>
          {also.map(row)}
        </div>
      )}
    </nav>
  );
}

/** A page with the left pane and a scrolling main area. */
function Page({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <div className="cp-page">
      {side}
      <main className="cp-main">{children}</main>
    </div>
  );
}

// =====================================================================================================
// Home, category pages, all items, search
// =====================================================================================================

function Home({ go }: { go: Go }) {
  const { lang, tr } = useTr();
  return (
    <div className="cp-home">
      <h1 className="cp-h1">{tr ? "Bilgisayarınızın ayarlarını düzenleyin" : "Adjust your computer's settings"}</h1>
      <div className="cp-cats">
        {CATS.map((c) => (
          <section key={c.id} className="cp-cat">
            <ShellIcon name={c.icon} size={48} />
            <div>
              <button className="cp-cat-title" onClick={() => go(`cat:${c.id}`)}>
                {c.name[lang]}
              </button>
              {c.links.map(([label, to]) => (
                <Link key={label.en} onClick={() => go(to, label[lang])}>
                  {label[lang]}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function CatPage({ go, cat }: { go: Go; cat: string }) {
  const { lang, tr } = useTr();
  return (
    <Page
      side={
        <nav className="cp-side">
          <Link onClick={() => go("home")}>{tr ? "Denetim Masası Giriş Sayfası" : "Control Panel Home"}</Link>
          {CATS.map((c) => (
            <button key={c.id} className={`cp-link ${c.id === cat ? "cp-on" : ""}`} onClick={() => go(`cat:${c.id}`)}>
              {c.name[lang]}
            </button>
          ))}
        </nav>
      }
    >
      {ITEMS.filter((x) => x[3] === cat).map(([p, icon, name]) => (
        <section key={p} className="cp-applet">
          <ShellIcon name={icon} size={48} />
          <button className="cp-cat-title" onClick={() => go(p)}>
            {name[lang]}
          </button>
        </section>
      ))}
    </Page>
  );
}

function AllItems({ go, small }: { go: Go; small: boolean }) {
  const { lang, tr } = useTr();
  const sorted = [...ITEMS].sort((a, b) => a[2][lang].localeCompare(b[2][lang], lang));
  return (
    <div className="cp-home">
      <h1 className="cp-h1">{tr ? "Bilgisayarınızın ayarlarını düzenleyin" : "Adjust your computer's settings"}</h1>
      <div className={`cp-items ${small ? "small" : ""}`}>
        {sorted.map(([p, icon, name]) => (
          <button key={p} className="cp-item" onClick={() => go(p)}>
            <ShellIcon name={icon} size={small ? 16 : 32} />
            <span>{name[lang]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Results({ go, query }: { go: Go; query: string }) {
  const { lang, tr } = useTr();
  const q = query.toLocaleLowerCase(lang);
  const hit = (s: string) => s.toLocaleLowerCase(lang).includes(q);
  const items = ITEMS.filter((x) => hit(x[2][lang]));
  const tasks = CATS.flatMap((c) => c.links).filter(([label]) => hit(label[lang]));
  return (
    <div className="cp-home">
      {!items.length && !tasks.length && (
        <p className="cp-none">{tr ? "Aramanızla eşleşen öğe yok." : "No items match your search."}</p>
      )}
      {items.map(([p, icon, name]) => (
        <section key={p} className="cp-applet">
          <ShellIcon name={icon} size={32} />
          <button className="cp-cat-title" onClick={() => go(p)}>
            {name[lang]}
          </button>
        </section>
      ))}
      {tasks.map(([label, to]) => (
        <section key={label.en} className="cp-applet">
          <ShellIcon name="control" size={32} />
          <Link onClick={() => go(to, label[lang])}>{label[lang]}</Link>
        </section>
      ))}
    </div>
  );
}

/** Applets that aren't built: their name, and a pointer to PC settings when Windows 8.1 has one. */
function Stub({ go, page }: { go: Go; page: string }) {
  const { lang, tr } = useTr();
  const [, icon, name] = ITEM[page];
  return (
    <Page side={<Side go={go} />}>
      <div className="cp-stub">
        <ShellIcon name={icon} size={48} />
        <div>
          <h1 className="cp-h1">{name[lang]}</h1>
          <p>
            {tr
              ? "Bu öğe Windows'un bu sürümünde kullanılamıyor."
              : "This item isn't available in this version of Windows."}
          </p>
          {PC[page] && (
            <Link onClick={() => go(`pc:${PC[page]}`)}>{tr ? "PC ayarlarında aç" : "Open in PC settings"}</Link>
          )}
        </div>
      </div>
    </Page>
  );
}

// =====================================================================================================
// System
// =====================================================================================================

function SystemPage({ go }: { go: Go }) {
  const { tr } = useTr();
  const { id } = useWindow();
  const { openApp } = useOS();
  const cores = navigator.hardwareConcurrency || 1;
  const ram = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const touch = navigator.maxTouchPoints;
  const pc = `${USER.split(/\s+/)[0].toLocaleUpperCase(tr ? "tr-TR" : "en-US")}-PC`;
  const row = (k: string, v: ReactNode) => (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
  return (
    <Page
      side={
        <Side
          go={go}
          tasks={[
            [tr ? "Aygıt Yöneticisi" : "Device Manager", "devmgmt"],
            [tr ? "Uzak ayarlar" : "Remote settings", "-"],
            [tr ? "Sistem koruması" : "System protection", "-"],
            [tr ? "Gelişmiş sistem ayarları" : "Advanced system settings", "-"],
          ]}
          also={[
            [tr ? "Eylem Merkezi" : "Action Center", "action"],
            ["Windows Update", "update"],
          ]}
        />
      }
    >
      <h1 className="cp-h1">
        {tr ? "Bilgisayarınızla ilgili temel bilgileri görüntüleyin" : "View basic information about your computer"}
      </h1>
      <h2 className="cp-h2">{tr ? "Windows sürümü" : "Windows edition"}</h2>
      <div className="cp-edition">
        <p>
          Windows 8.1 Pro
          <br />©{" "}
          {tr
            ? "2013 Microsoft Corporation. Tüm hakları saklıdır."
            : "2013 Microsoft Corporation. All rights reserved."}
        </p>
        <div className="cp-brand">
          <WinLogo size={56} color="#00adef" />
          <span>Windows 8</span>
        </div>
      </div>
      <h2 className="cp-h2">{tr ? "Sistem" : "System"}</h2>
      <dl className="cp-dl">
        {row(
          tr ? "İşlemci:" : "Processor:",
          tr ? `Sanal İşlemci (${cores} çekirdek)` : `Virtual Processor (${cores} cores)`,
        )}
        {row(
          tr ? "Yüklü bellek (RAM):" : "Installed memory (RAM):",
          ram
            ? `${ram.toLocaleString(tr ? "tr-TR" : "en-US", { minimumFractionDigits: 2 })} GB`
            : tr
              ? "Bilinmiyor"
              : "Unknown",
        )}
        {row(
          tr ? "Sistem türü:" : "System type:",
          tr ? "64 bit İşletim Sistemi, x64 tabanlı işlemci" : "64-bit Operating System, x64-based processor",
        )}
        {row(
          tr ? "Kalem ve Dokunma:" : "Pen and Touch:",
          touch
            ? tr
              ? `${touch} Dokunma Noktası ile Tam Dokunma Desteği`
              : `Full Touch Support with ${touch} Touch Points`
            : tr
              ? "Bu Ekran için Kalem veya Dokunarak Giriş yok"
              : "No Pen or Touch Input is available for this Display",
        )}
      </dl>
      <h2 className="cp-h2">
        {tr ? "Bilgisayar adı, etki alanı ve çalışma grubu ayarları" : "Computer name, domain, and workgroup settings"}
      </h2>
      <div className="cp-split">
        <dl className="cp-dl">
          {row(tr ? "Bilgisayar adı:" : "Computer name:", pc)}
          {row(tr ? "Tam bilgisayar adı:" : "Full computer name:", pc)}
          {row(tr ? "Bilgisayar açıklaması:" : "Computer description:", "")}
          {row(tr ? "Çalışma grubu:" : "Workgroup:", "WORKGROUP")}
        </dl>
        <Link shield onClick={() => go("-", tr ? "Sistem Özellikleri" : "System Properties")}>
          {tr ? "Ayarları değiştir" : "Change settings"}
        </Link>
      </div>
      <h2 className="cp-h2">{tr ? "Windows etkinleştirme" : "Windows activation"}</h2>
      <p>
        {tr ? "Windows etkinleştirildi " : "Windows is activated "}
        <Link onClick={() => openApp("ie", "https://www.microsoft.com/useterms")}>
          {tr ? "Microsoft Yazılımı Lisans Koşulları'nı okuyun" : "Read the Microsoft Software License Terms"}
        </Link>
      </p>
      <div className="cp-split">
        <p>{tr ? "Ürün Kimliği: 00261-50000-00000-AA989" : "Product ID: 00261-50000-00000-AA989"}</p>
        <Link
          shield
          onClick={() =>
            void msgBox(id, {
              title: "Windows",
              text: tr ? "Bu Windows kopyası zaten etkinleştirildi." : "This copy of Windows is already activated.",
              icon: "info",
              buttons: [tr ? "Tamam" : "OK"],
            })
          }
        >
          {tr ? "Ürün anahtarını değiştir" : "Change product key"}
        </Link>
      </div>
    </Page>
  );
}

// =====================================================================================================
// Personalization: themes, desktop background, color
// =====================================================================================================

const WALL_DIR = "C:\\Windows\\Web\\Wallpaper\\Windows";
const THEMES: { name: L; wall: string; color: string }[] = [
  { name: l("Windows", "Windows"), wall: `${WALL_DIR}\\img0.jpg`, color: "#6aa9e9" },
  { name: l("Çizgiler ve renkler", "Lines and colors"), wall: `${WALL_DIR}\\img1.jpg`, color: "#e8503c" },
  { name: l("Çiçekler", "Flowers"), wall: `${WALL_DIR}\\img2.jpg`, color: "#c850d2" },
];
const SWATCHES = [
  "#6aa9e9",
  "#1e90ff",
  "#00b4c8",
  "#28c8a0",
  "#3cb43c",
  "#a0d250",
  "#f0c830",
  "#f08c28",
  "#e8503c",
  "#e84a8c",
  "#c850d2",
  "#9664dc",
  "#6e78e6",
  "#a0a0a0",
  "#3c3c3c",
];
const SOLIDS = ["#000000", "#1b3a6b", "#2d89ef", "#00a300", "#603cba", "#b91d47", "#da532c", "#7e7e7e", "#e3e3e3"];
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const wallName = (w: string, tr: boolean) =>
  w.startsWith("color:") ? (tr ? "Düz renk" : "Solid color") : basename(w).replace(/\.[^.]+$/, "");

function Personalize({ go }: { go: Go }) {
  const { lang, tr } = useTr();
  const { wallpaper, winColor, sfx, setPref } = useOS();
  const mine = !THEMES.some((t) => same(t.wall, wallpaper) && same(t.color, winColor));
  const theme = (name: string, wall: string, color: string, on: boolean, apply?: () => void) => (
    <button key={name} className={`cp-theme ${on ? "on" : ""}`} onClick={apply}>
      <Wallpaper value={wall} className="cp-theme-art" />
      <span className="cp-theme-bar" style={{ background: color }} />
      <span>{name}</span>
    </button>
  );
  const bottom: [string, string, ReactNode, () => void][] = [
    [
      tr ? "Masaüstü Arka Planı" : "Desktop Background",
      wallName(wallpaper, tr),
      <Wallpaper key="w" value={wallpaper} className="cp-mini" />,
      () => go("background"),
    ],
    [
      tr ? "Renk" : "Color",
      winColor.toUpperCase(),
      <span key="c" className="cp-mini" style={{ background: winColor }} />,
      () => go("color"),
    ],
    [
      tr ? "Sesler" : "Sounds",
      sfx ? (tr ? "Windows Varsayılanı" : "Windows Default") : tr ? "Ses Yok" : "No Sounds",
      <ShellIcon key="s" name="sound" size={40} />,
      () => go("sound"),
    ],
    [
      tr ? "Ekran Koruyucu" : "Screen Saver",
      tr ? "Yok" : "None",
      <ShellIcon key="d" name="display" size={40} />,
      () => go("-", tr ? "Ekran Koruyucu Ayarları" : "Screen Saver Settings"),
    ],
  ];
  return (
    <Page
      side={
        <Side
          go={go}
          tasks={[
            [tr ? "Masaüstü simgelerini değiştir" : "Change desktop icons", "-"],
            [tr ? "Fare işaretçilerini değiştir" : "Change mouse pointers", "mouse"],
            [tr ? "Hesap resminizi değiştirin" : "Change your account picture", "pc:accounts"],
          ]}
          also={[
            [ITEM.display[2][lang], "display"],
            [ITEM.taskbar[2][lang], "taskbar"],
            [ITEM.ease[2][lang], "ease"],
          ]}
        />
      }
    >
      <h1 className="cp-h1">
        {tr ? "Bilgisayarınızdaki görselleri ve sesleri değiştirin" : "Change the visuals and sounds on your computer"}
      </h1>
      <p>
        {tr
          ? "Masaüstü arka planını, rengi, sesleri ve ekran koruyucuyu aynı anda değiştirmek için bir temaya tıklayın."
          : "Click a theme to change the desktop background, color, sounds, and screen saver all at once."}
      </p>
      <div className="cp-themes">
        {mine && (
          <>
            <h3>{tr ? "Temalarım (1)" : "My Themes (1)"}</h3>
            <div className="cp-theme-row">
              {theme(tr ? "Kaydedilmemiş Tema" : "Unsaved Theme", wallpaper, winColor, true)}
            </div>
          </>
        )}
        <h3>{tr ? `Windows Varsayılan Temaları (${THEMES.length})` : `Windows Default Themes (${THEMES.length})`}</h3>
        <div className="cp-theme-row">
          {THEMES.map((t) =>
            theme(t.name[lang], t.wall, t.color, same(t.wall, wallpaper) && same(t.color, winColor), () => {
              setPref("wallpaper", t.wall);
              setPref("winColor", t.color);
              setPref("sfx", true);
            }),
          )}
        </div>
      </div>
      <div className="cp-bottom">
        {bottom.map(([label, value, art, onClick]) => (
          <button key={label} className="cp-bottom-item" onClick={onClick}>
            {art}
            <b>{label}</b>
            <span>{value}</span>
          </button>
        ))}
      </div>
    </Page>
  );
}

/** Every picture under a folder (Pictures library). */
function pictures(dir: string): string[] {
  return fs
    .list(dir)
    .flatMap((n) => (n.kind === "img" ? [join(dir, n.name)] : n.kind === "dir" ? pictures(join(dir, n.name)) : []));
}

function Background({ go }: { go: Go }) {
  useFS();
  const { tr } = useTr();
  const { wallpaper, setPref } = useOS();
  const [orig] = useState(wallpaper);
  const [where, setWhere] = useState(() =>
    wallpaper.startsWith("color:")
      ? "solid"
      : same(wallpaper.slice(0, WALL_DIR.length), WALL_DIR)
        ? "windows"
        : "pictures",
  );
  const choices =
    where === "solid"
      ? SOLIDS.map((c) => `color:${c}`)
      : where === "windows"
        ? pictures(WALL_DIR)
        : pictures(KNOWN.pictures);
  return (
    <Page side={<Side go={go} />}>
      <h1 className="cp-h1">{tr ? "Masaüstü arka planınızı seçin" : "Choose your desktop background"}</h1>
      <p>
        {tr
          ? "Masaüstünüzün arka planı yapmak için bir resme tıklayın."
          : "Click a picture to make it your desktop background."}
      </p>
      <label className="cp-field">
        {tr ? "Resim konumu:" : "Picture location:"}
        <select className="w8-select" value={where} onChange={(e) => setWhere(e.target.value)}>
          <option value="windows">{tr ? "Windows Masaüstü Arka Planları" : "Windows Desktop Backgrounds"}</option>
          <option value="pictures">{tr ? "Resimler Kitaplığı" : "Pictures Library"}</option>
          <option value="solid">{tr ? "Düz Renkler" : "Solid Colors"}</option>
        </select>
      </label>
      <div className="cp-walls">
        {choices.map((w) => (
          <button
            key={w}
            className={`cp-wall ${same(w, wallpaper) ? "on" : ""}`}
            onClick={() => setPref("wallpaper", w)}
            title={wallName(w, tr)}
          >
            <Wallpaper value={w} className="cp-wall-art" />
          </button>
        ))}
        {!choices.length && <p className="cp-none">{tr ? "Bu konumda resim yok." : "No pictures in this location."}</p>}
      </div>
      <div className="cp-actions">
        <Btn primary onClick={() => go("personalize")}>
          {tr ? "Değişiklikleri kaydet" : "Save changes"}
        </Btn>
        <Btn
          onClick={() => {
            setPref("wallpaper", orig);
            go("personalize");
          }}
        >
          {tr ? "İptal" : "Cancel"}
        </Btn>
      </div>
    </Page>
  );
}

function ColorPage({ go }: { go: Go }) {
  const { tr } = useTr();
  const { winColor, setPref } = useOS();
  const [orig] = useState(winColor);
  return (
    <Page side={<Side go={go} />}>
      <h1 className="cp-h1">
        {tr
          ? "Pencere kenarlıklarınızın ve görev çubuğunuzun rengini değiştirin"
          : "Change the color of your window borders and taskbar"}
      </h1>
      <div className="cp-swatches">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className={`cp-swatch ${same(c, winColor) ? "on" : ""}`}
            style={{ background: c }}
            onClick={() => setPref("winColor", c)}
            aria-label={c}
          />
        ))}
      </div>
      <label className="cp-field">
        {tr ? "Renk karıştırıcıyı göster:" : "Show color mixer:"}
        <input type="color" value={winColor} onChange={(e) => setPref("winColor", e.target.value)} />
      </label>
      <div className="cp-actions">
        <Btn primary onClick={() => go("personalize")}>
          {tr ? "Değişiklikleri kaydet" : "Save changes"}
        </Btn>
        <Btn
          onClick={() => {
            setPref("winColor", orig);
            go("personalize");
          }}
        >
          {tr ? "İptal" : "Cancel"}
        </Btn>
      </div>
    </Page>
  );
}

// =====================================================================================================
// Programs and Features
// =====================================================================================================

/** The portfolio's own apps; everything else ships with Windows. */
const OWN = new Set(["profile", "projects", "achievements", "reader"]);
/** A stable made-up size per program. */
const sizeOf = (id: string) => ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) + 40) * 97_000;

function Programs({ go }: { go: Go }) {
  const { lang, tr } = useTr();
  const { t } = useOS();
  const { id } = useWindow();
  const [sel, setSel] = useState<string | null>(null);
  const loc = tr ? "tr-TR" : "en-US";
  const rows = APPS.filter((a) => !a.hidden && a.id !== "desktop")
    .map((a) => {
      const own = OWN.has(a.id);
      return {
        id: a.id,
        name: t(a.title),
        pub: own ? "AFU" : "Microsoft Corporation",
        date: (own ? new Date(2026, 8, 14) : new Date(2013, 9, 18)).toLocaleDateString(loc),
        size: sizeOf(a.id),
        ver: own ? "1.0.0" : "6.3.9600.16384",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, lang));
  const cur = rows.find((r) => r.id === sel);
  const uninstall = (name: string, own: boolean) =>
    void msgBox(id, {
      title: tr ? "Programlar ve Özellikler" : "Programs and Features",
      text: own
        ? tr
          ? `${name} kaldırılamaz. Bu program, bu bilgisayarın sahibinin portföyünün bir parçasıdır.`
          : `${name} can't be removed. It's part of this PC owner's portfolio.`
        : tr
          ? `${name} kaldırılamaz. Bu program Windows'un bir parçasıdır.`
          : `${name} can't be removed. It's part of Windows.`,
      icon: "warning",
      buttons: [tr ? "Tamam" : "OK"],
    });
  return (
    <Page
      side={
        <Side
          go={go}
          tasks={[
            [tr ? "Yüklü güncelleştirmeleri görüntüle" : "View installed updates", "-"],
            [tr ? "Windows özelliklerini aç veya kapat" : "Turn Windows features on or off", "-"],
          ]}
        />
      }
    >
      <h1 className="cp-h1">{tr ? "Bir programı kaldırın veya değiştirin" : "Uninstall or change a program"}</h1>
      <p>
        {tr
          ? "Bir programı kaldırmak için listeden seçin ve sonra Kaldır, Değiştir veya Onar'a tıklayın."
          : "To uninstall a program, select it from the list and then click Uninstall, Change, or Repair."}
      </p>
      <div className="cp-toolbar">
        <button disabled>{tr ? "Düzenle ▾" : "Organize ▾"}</button>
        {cur && (
          <button onClick={() => uninstall(cur.name, OWN.has(cur.id))}>
            {tr ? "Kaldır/Değiştir" : "Uninstall/Change"}
          </button>
        )}
      </div>
      <table className="cp-table">
        <thead>
          <tr>
            <th>{tr ? "Ad" : "Name"}</th>
            <th>{tr ? "Yayımcı" : "Publisher"}</th>
            <th>{tr ? "Yüklendiği Tarih" : "Installed On"}</th>
            <th>{tr ? "Boyut" : "Size"}</th>
            <th>{tr ? "Sürüm" : "Version"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={sel === r.id ? "on" : ""}
              onClick={() => setSel(r.id)}
              onDoubleClick={() => uninstall(r.name, OWN.has(r.id))}
            >
              <td>{r.name}</td>
              <td>{r.pub}</td>
              <td>{r.date}</td>
              <td className="num">{formatSize(r.size, lang)}</td>
              <td>{r.ver}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cp-summary">
        <ShellIcon name="programs" size={32} />
        <div>
          <b>{tr ? "Şu anda yüklü olan programlar" : "Currently installed programs"}</b>
          <span>
            {tr ? "Toplam boyut: " : "Total size: "}
            {formatSize(
              rows.reduce((s, r) => s + r.size, 0),
              lang,
            )}
          </span>
          <span>{tr ? `${rows.length} program yüklü` : `${rows.length} programs installed`}</span>
        </div>
      </div>
    </Page>
  );
}

// =====================================================================================================
// Date and Time, Sound
// =====================================================================================================

function DateTime({ go }: { go: Go }) {
  const { tr } = useTr();
  const { id } = useWindow();
  const now = new Date(useTick(1000));
  const loc = tr ? "tr-TR" : "en-US";
  const off = -now.getTimezoneOffset();
  const zone = `(UTC${off >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(off) / 60)).padStart(2, "0")}:${String(Math.abs(off) % 60).padStart(2, "0")}) ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  const deg = (v: number, max: number) => `rotate(${(v / max) * 360} 50 50)`;
  return (
    <Page side={<Side go={go} />}>
      <h1 className="cp-h1">{ITEM.datetime[2][tr ? "tr" : "en"]}</h1>
      <div className="cp-clock">
        <svg viewBox="0 0 100 100" width={110} height={110} aria-hidden="true">
          <circle cx="50" cy="50" r="47" fill="#fff" stroke="#8aa0bd" strokeWidth="2" />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="50" y1="7" x2="50" y2="12" stroke="#334" strokeWidth="2" transform={deg(i, 12)} />
          ))}
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="26"
            stroke="#223"
            strokeWidth="3.5"
            strokeLinecap="round"
            transform={deg((now.getHours() % 12) + now.getMinutes() / 60, 12)}
          />
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="16"
            stroke="#223"
            strokeWidth="2.5"
            strokeLinecap="round"
            transform={deg(now.getMinutes(), 60)}
          />
          <line x1="50" y1="56" x2="50" y2="12" stroke="#d00" strokeWidth="1" transform={deg(now.getSeconds(), 60)} />
        </svg>
        <dl className="cp-dl">
          <dt>{tr ? "Tarih:" : "Date:"}</dt>
          <dd>{now.toLocaleDateString(loc, { dateStyle: "full" })}</dd>
          <dt>{tr ? "Saat:" : "Time:"}</dt>
          <dd>{now.toLocaleTimeString(loc)}</dd>
        </dl>
      </div>
      <Btn
        onClick={() =>
          void msgBox(id, {
            title: ITEM.datetime[2][tr ? "tr" : "en"],
            text: tr
              ? "Tarih ve saat, bu bilgisayarın saatiyle otomatik olarak eşitleniyor."
              : "The date and time are synchronized automatically with this computer's clock.",
            icon: "info",
            buttons: [tr ? "Tamam" : "OK"],
          })
        }
      >
        {tr ? "Tarihi ve saati değiştir..." : "Change date and time..."}
      </Btn>
      <h2 className="cp-h2">{tr ? "Saat dilimi" : "Time zone"}</h2>
      <p>{zone}</p>
      <Btn onClick={() => go("pc:time")}>{tr ? "Saat dilimini değiştir..." : "Change time zone..."}</Btn>
      <h2 className="cp-h2">{tr ? "İnternet Saati" : "Internet Time"}</h2>
      <p>
        {tr
          ? "Bu bilgisayar, 'time.windows.com' ile otomatik olarak eşitlenecek şekilde ayarlanmış."
          : "This computer is set to automatically synchronize with 'time.windows.com'."}
      </p>
    </Page>
  );
}

const onVolume = (f: () => void) => {
  sound.onVolume.add(f);
  return () => void sound.onVolume.delete(f);
};

function SoundPage({ go }: { go: Go }) {
  const { tr } = useTr();
  const { sfx, setPref } = useOS();
  const vol = useSyncExternalStore(
    onVolume,
    () => sound.volume,
    () => 0.7,
  );
  const muted = useSyncExternalStore(
    onVolume,
    () => sound.muted,
    () => false,
  );
  return (
    <Page side={<Side go={go} also={[[ITEM.devices[2][tr ? "tr" : "en"], "devices"]]} />}>
      <h1 className="cp-h1">{tr ? "Ses" : "Sound"}</h1>
      <h2 className="cp-h2">{tr ? "Kayıttan Yürütme" : "Playback"}</h2>
      <div className="cp-device">
        <ShellIcon name="sound" size={40} />
        <div>
          <b>{tr ? "Hoparlörler" : "Speakers"}</b>
          <span>{tr ? "Yüksek Tanımlı Ses Aygıtı" : "High Definition Audio Device"}</span>
          <span className="cp-ok">✓ {tr ? "Varsayılan Aygıt" : "Default Device"}</span>
        </div>
      </div>
      <label className="cp-field">
        {tr ? "Ses düzeyi:" : "Volume:"}
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(vol * 100)}
          onChange={(e) => sound.setVolume(Number(e.target.value) / 100, false)}
        />
        <span>{Math.round(vol * 100)}</span>
      </label>
      <label className="cp-check">
        <input type="checkbox" checked={muted} onChange={(e) => sound.setVolume(vol, e.target.checked)} />
        {tr ? "Sesi kapat" : "Mute"}
      </label>
      <h2 className="cp-h2">{tr ? "Sesler" : "Sounds"}</h2>
      <label className="cp-field">
        {tr ? "Ses Düzeni:" : "Sound Scheme:"}
        <select
          className="w8-select"
          value={sfx ? "default" : "none"}
          onChange={(e) => setPref("sfx", e.target.value === "default")}
        >
          <option value="default">{tr ? "Windows Varsayılanı" : "Windows Default"}</option>
          <option value="none">{tr ? "Ses Yok" : "No Sounds"}</option>
        </select>
        <Btn disabled={!sfx} onClick={() => sound.ding()}>
          {tr ? "Sına" : "Test"}
        </Btn>
      </label>
    </Page>
  );
}

// =====================================================================================================
// User Accounts, Display, Region, Ease of Access
// =====================================================================================================

function Accounts({ go }: { go: Go }) {
  const { tr } = useTr();
  const { id } = useWindow();
  const { user } = useOS();
  return (
    <Page
      side={
        <Side
          go={go}
          tasks={[
            [tr ? "Kimlik bilgilerinizi yönetin" : "Manage your credentials", "credentials"],
            [tr ? "Ortam değişkenlerimi değiştir" : "Change my environment variables", "-"],
          ]}
          also={[[ITEM.family[2][tr ? "tr" : "en"], "family"]]}
        />
      }
    >
      <h1 className="cp-h1">{tr ? "Kullanıcı hesabınızda değişiklik yapın" : "Make changes to your user account"}</h1>
      <div className="cp-account">
        <div className="cp-links">
          <Link onClick={() => go("pc:accounts")}>
            {tr ? "PC ayarlarında hesabımda değişiklik yap" : "Make changes to my account in PC settings"}
          </Link>
          <Link
            shield
            onClick={() =>
              void msgBox(id, {
                title: tr ? "Kullanıcı Hesapları" : "User Accounts",
                text: tr
                  ? "Bu bilgisayardaki tek yönetici sizsiniz; hesap türünüz değiştirilemez."
                  : "You're the only administrator on this PC, so your account type can't be changed.",
                icon: "warning",
                buttons: [tr ? "Tamam" : "OK"],
              })
            }
          >
            {tr ? "Hesap türünüzü değiştirin" : "Change your account type"}
          </Link>
          <Link shield onClick={() => go("-", tr ? "Hesapları Yönet" : "Manage Accounts")}>
            {tr ? "Başka bir hesabı yönet" : "Manage another account"}
          </Link>
          <Link shield onClick={() => go("-", tr ? "Kullanıcı Hesabı Denetimi" : "User Account Control")}>
            {tr ? "Kullanıcı Hesabı Denetimi ayarlarını değiştirin" : "Change User Account Control settings"}
          </Link>
        </div>
        <div className="cp-me">
          <Avatar user={user} size={64} />
          <div>
            <b>{USER}</b>
            <span>{tr ? "Yerel Hesap" : "Local Account"}</span>
            <span>{tr ? "Yönetici" : "Administrator"}</span>
          </div>
        </div>
      </div>
    </Page>
  );
}

function Display({ go }: { go: Go }) {
  const { tr } = useTr();
  const dpr = window.devicePixelRatio || 1;
  const scale = dpr >= 1.5 ? 150 : dpr >= 1.25 ? 125 : 100;
  const sizes: [number, string][] = [
    [100, tr ? "Daha küçük - %100 (varsayılan)" : "Smaller - 100% (default)"],
    [125, tr ? "Orta - %125" : "Medium - 125%"],
    [150, tr ? "Daha büyük - %150" : "Larger - 150%"],
  ];
  return (
    <Page
      side={
        <Side
          go={go}
          tasks={[
            [tr ? "Rengi ayarla" : "Calibrate color", "-"],
            [tr ? "ClearType metnini ayarla" : "Adjust ClearType text", "-"],
          ]}
          also={[[ITEM.personalize[2][tr ? "tr" : "en"], "personalize"]]}
        />
      }
    >
      <h1 className="cp-h1">{tr ? "Ekranınızın görünümünü değiştirin" : "Change the appearance of your display"}</h1>
      <div className="cp-device">
        <ShellIcon name="display" size={48} />
        <dl className="cp-dl">
          <dt>{tr ? "Ekran:" : "Display:"}</dt>
          <dd>{tr ? "1. Genel PnP Monitör" : "1. Generic PnP Monitor"}</dd>
          <dt>{tr ? "Çözünürlük:" : "Resolution:"}</dt>
          <dd>
            {Math.round(screen.width * dpr)} × {Math.round(screen.height * dpr)} {tr ? "(Önerilen)" : "(Recommended)"}
          </dd>
          <dt>{tr ? "Yönlendirme:" : "Orientation:"}</dt>
          <dd>{screen.width >= screen.height ? (tr ? "Yatay" : "Landscape") : tr ? "Dikey" : "Portrait"}</dd>
        </dl>
      </div>
      <h2 className="cp-h2">{tr ? "Tüm öğelerin boyutunu değiştirin" : "Change the size of all items"}</h2>
      {sizes.map(([v, label]) => (
        <label key={v} className="cp-check">
          <input type="radio" checked={v === scale} disabled readOnly />
          {label}
        </label>
      ))}
      <p className="cp-note">
        {tr
          ? "Boyut, tarayıcınızın yakınlaştırma düzeyini izler (Ctrl + ve Ctrl -)."
          : "The size follows your browser's zoom level (Ctrl + and Ctrl -)."}
      </p>
    </Page>
  );
}

function Region({ go }: { go: Go }) {
  const { tr } = useTr();
  const { setPref } = useOS();
  const now = new Date(useTick(1000));
  const loc = tr ? "tr-TR" : "en-US";
  const langs: ["tr" | "en", string, string][] = [
    ["tr", "Türkçe", tr ? "Türkçe (Türkiye)" : "Turkish (Turkey)"],
    ["en", "English (United States)", tr ? "İngilizce (ABD)" : "English (United States)"],
  ];
  const order = tr ? langs : [langs[1], langs[0]];
  return (
    <Page side={<Side go={go} also={[[ITEM.datetime[2][tr ? "tr" : "en"], "datetime"]]} />}>
      <h1 className="cp-h1">{tr ? "Dil tercihlerinizi değiştirin" : "Change your language preferences"}</h1>
      <p>
        {tr
          ? "Listenin en üstündeki dil, Windows'un ve uygulamaların görüntüleme dilidir."
          : "The language at the top of your list is the one Windows and apps display in."}
      </p>
      <div className="cp-langs">
        {order.map(([code, native], i) => (
          <div key={code} className="cp-lang">
            <b>{native}</b>
            <span>{i === 0 ? (tr ? "Windows görüntüleme dili: Etkin" : "Windows display language: Enabled") : ""}</span>
            {i > 0 && <Btn onClick={() => setPref("lang", code)}>{tr ? "Yukarı taşı" : "Move up"}</Btn>}
          </div>
        ))}
      </div>
      <h2 className="cp-h2">{tr ? "Biçimler" : "Formats"}</h2>
      <label className="cp-field">
        {tr ? "Biçim:" : "Format:"}
        <select
          className="w8-select"
          value={tr ? "tr" : "en"}
          onChange={(e) => setPref("lang", e.target.value as "tr" | "en")}
        >
          {langs.map(([code, , name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <dl className="cp-dl">
        <dt>{tr ? "Kısa tarih:" : "Short date:"}</dt>
        <dd>{now.toLocaleDateString(loc)}</dd>
        <dt>{tr ? "Uzun tarih:" : "Long date:"}</dt>
        <dd>{now.toLocaleDateString(loc, { dateStyle: "full" })}</dd>
        <dt>{tr ? "Kısa saat:" : "Short time:"}</dt>
        <dd>{now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}</dd>
        <dt>{tr ? "Uzun saat:" : "Long time:"}</dt>
        <dd>{now.toLocaleTimeString(loc)}</dd>
        <dt>{tr ? "Haftanın ilk günü:" : "First day of week:"}</dt>
        <dd>{tr ? "Pazartesi" : "Sunday"}</dd>
      </dl>
    </Page>
  );
}

function Ease({ go }: { go: Go }) {
  const { tr } = useTr();
  const { motion, setPref } = useOS();
  const quick: [ShellIconName, string][] = [
    ["ease", tr ? "Büyüteci başlat" : "Start Magnifier"],
    ["user", tr ? "Ekran Okuyucusu'nu başlat" : "Start Narrator"],
    ["keyboard", tr ? "Ekran Klavyesini başlat" : "Start On-Screen Keyboard"],
    ["display", tr ? "Yüksek Karşıtlığı ayarla" : "Set up High Contrast"],
  ];
  const explore = [
    tr ? "Bilgisayarı ekran olmadan kullan" : "Use the computer without a display",
    tr ? "Bilgisayarın daha kolay görülmesini sağla" : "Make the computer easier to see",
    tr ? "Bilgisayarı fare veya klavye olmadan kullan" : "Use the computer without a mouse or keyboard",
    tr ? "Farenin kullanımını kolaylaştır" : "Make the mouse easier to use",
    tr ? "Klavyenin kullanımını kolaylaştır" : "Make the keyboard easier to use",
  ];
  return (
    <Page
      side={<Side go={go} tasks={[[tr ? "Oturum açma ayarlarını değiştir" : "Change sign-in settings", "pc:ease"]]} />}
    >
      <h1 className="cp-h1">{tr ? "Bilgisayarınızı kullanmayı kolaylaştırın" : "Make your computer easier to use"}</h1>
      <h2 className="cp-h2">{tr ? "Ortak araçlara hızlı erişim" : "Quick access to common tools"}</h2>
      <div className="cp-quick">
        {quick.map(([icon, label]) => (
          <button key={label} className="cp-link" onClick={() => go("pc:ease")}>
            <ShellIcon name={icon} size={32} />
            {label}
          </button>
        ))}
      </div>
      <h2 className="cp-h2">{tr ? "Tüm ayarları keşfedin" : "Explore all settings"}</h2>
      <label className="cp-check">
        <input
          type="checkbox"
          checked={motion === "reduced"}
          onChange={(e) => setPref("motion", e.target.checked ? "reduced" : "full")}
        />
        {tr
          ? "Tüm gereksiz animasyonları kapat (mümkün olduğunda)"
          : "Turn off all unnecessary animations (when possible)"}
      </label>
      <div className="cp-links">
        {explore.map((label) => (
          <Link key={label} onClick={() => go("pc:ease")}>
            {label}
          </Link>
        ))}
      </div>
    </Page>
  );
}
