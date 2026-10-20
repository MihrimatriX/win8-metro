"use client";
/**
 * Internet Explorer 11 (desktop) as in Windows 8.1: round Back / Forward buttons, the address bar and the tabs on
 * one row in the window color, Home / Favorites / Tools on the right, and the classic menu bar on Alt.
 * Pages from the virtual file system (.html, .txt, pictures) render in a sandboxed frame. Real web sites mostly
 * refuse to be framed and a static site can't tell, so http(s) addresses get IE's "can't be displayed in a frame"
 * page with a button that opens them in a real browser tab.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useOS } from "@/lib/os";
import { fs, useFS, basename, join, normalize, HOME, type FNode } from "@/lib/fs";
import { wm } from "@/lib/wm";
import { profile, projects, socials } from "@/content/portfolio";
import { CoverArt } from "../../CoverArt";
import { ShellIcon } from "../../icons/ShellIcons";
import { MenuBar, ContextMenu, useWindow, useWinKeys, type MenuItem } from "../ui";
import { fileDialog, msgBox } from "../dialogs";
import { printHtml } from "./Notepad";
import "./ie.css";

type Lang = "tr" | "en";
type Tab = { id: number; hist: string[]; at: number; v: number };
type Page =
  | { kind: "home" | "tabs" | "blank" | "error"; title: string }
  | { kind: "file"; title: string; html: string }
  | { kind: "web"; title: string; url: URL };

const HOME_URL = "about:home";
const NEW_TAB = "about:Tabs";
const FAVORITES = join(HOME, "Favorites");
const ZOOMS = [50, 75, 100, 125, 150, 175, 200, 250, 300];

/** What the address bar input means: an about: page, a file path, a web address, or a Bing search. */
function toUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "about:blank";
  if (/^about:/i.test(s)) return s.toLowerCase() === "about:tabs" ? NEW_TAB : s.toLowerCase();
  if (/^file:/i.test(s)) return normalize(decodeURIComponent(s.replace(/^file:\/*/i, "")));
  if (/^[a-z]:([\\/]|$)/i.test(s)) return normalize(s);
  if (/^[a-z][a-z\d+.-]*:/i.test(s)) return s;
  if (!/\s/.test(s) && /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#]|$)/i.test(s)) return `http://${s}`;
  return `https://www.bing.com/search?q=${encodeURIComponent(s)}`;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** A file shown as a page: HTML as is, text in <pre>, pictures (with pixels) in <img>. */
function fileHtml(n: FNode): string | null {
  if (n.kind === "html") return n.text ?? "";
  if (n.kind === "txt")
    return `<pre style="white-space:pre-wrap;font:13px Consolas,monospace">${esc(n.text ?? "")}</pre>`;
  if (n.kind === "img" && n.data) return `<img src="${n.data}" alt="${esc(n.name)}">`;
  return null;
}

function pageOf(url: string, lang: Lang): Page {
  const tr = lang === "tr";
  const error = { kind: "error", title: tr ? "Bu sayfa görüntülenemiyor" : "This page can't be displayed" } as const;
  if (url === HOME_URL) return { kind: "home", title: `${profile.name} - ${tr ? "Ana Sayfa" : "Home"}` };
  if (url === NEW_TAB) return { kind: "tabs", title: tr ? "Yeni sekme" : "New tab" };
  if (url === "about:blank") return { kind: "blank", title: tr ? "Boş Sayfa" : "Blank Page" };
  if (/^[a-z]:\\/i.test(url)) {
    const n = fs.get(url);
    const html = n ? fileHtml(n) : null;
    if (!n || html === null) return error;
    const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
    return { kind: "file", title: t || basename(url), html };
  }
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return { kind: "web", title: u.hostname, url: u };
  } catch {
    /* not an address */
  }
  return error;
}

const real = (u?: string) => !!u && /^https?:\/\//i.test(u);

// ---------- glyphs ----------

const glyph = (body: ReactNode, s = 20) => (
  <svg width={s} height={s} viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
    {body}
  </svg>
);
const G = {
  back: glyph(<path d="M15 10H5m4.5-4.5L5 10l4.5 4.5" strokeWidth="2" />, 18),
  fwd: glyph(<path d="M5 10h10m-4.5-4.5L15 10l-4.5 4.5" strokeWidth="2" />, 14),
  refresh: glyph(<path d="M15.5 9.5A5.5 5.5 0 1 1 13.8 5.5M14 2v4h-4" />, 14),
  search: glyph(<path d="M8.5 3.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM12 12l4.5 4.5" />, 14),
  home: glyph(<path d="M3 10l7-6.5 7 6.5M5 8.5V17h4v-5h2v5h4V8.5" />),
  star: glyph(<path d="M10 2.8l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5L2.8 8l5-.6z" />),
  gear: glyph(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.3 4.3l1.8 1.8M13.9 13.9l1.8 1.8M4.3 15.7l1.8-1.8M13.9 6.1l1.8-1.8" />
      <circle cx="10" cy="10" r="5.6" />
    </>,
  ),
};

// =====================================================================================================

export default function IEApp() {
  const { id, win, focused, setTitle } = useWindow();
  const { lang } = useOS();
  const tr = lang === "tr";
  const L = (a: string, b: string) => (tr ? a : b);
  useFS();

  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: 1, hist: [win.arg ? toUrl(win.arg) : HOME_URL], at: 0, v: 0 }]);
  const [cur, setCur] = useState(() => tabs[0].id);
  const [edit, setEdit] = useState<string | null>(null);
  const [menuBar, setMenuBar] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [pop, setPop] = useState<{ x: number; y: number; which: "fav" | "tools" } | null>(null);
  const addr = useRef<HTMLInputElement>(null);

  const tab = tabs.find((t) => t.id === cur) ?? tabs[0];
  const url = tab.hist[tab.at];
  const page = pageOf(url, lang);

  useEffect(() => {
    setTitle(`${page.title} - Internet Explorer`);
  }, [page.title, setTitle]);

  // Alt on its own shows or hides the menu bar, like IE.
  useEffect(() => {
    if (!focused) return;
    let alone = false;
    const down = (e: KeyboardEvent) => {
      alone = e.key === "Alt" && (!e.repeat || alone);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt" && alone) {
        e.preventDefault();
        setMenuBar((m) => !m);
      }
      alone = false;
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [focused]);

  // ---------- navigation ----------

  const patch = (fn: (t: Tab) => Tab) => setTabs((ts) => ts.map((t) => (t.id === tab.id ? fn(t) : t)));
  const go = (to: string) => {
    setEdit(null);
    addr.current?.blur();
    patch((t) =>
      t.hist[t.at] === to ? { ...t, v: t.v + 1 } : { ...t, hist: [...t.hist.slice(0, t.at + 1), to], at: t.at + 1 },
    );
  };
  const step = (d: 1 | -1) => patch((t) => ({ ...t, at: Math.max(0, Math.min(t.hist.length - 1, t.at + d)) }));
  const refresh = () => patch((t) => ({ ...t, v: t.v + 1 }));

  const focusAddr = () => {
    addr.current?.focus();
    addr.current?.select();
  };
  const newTab = (to = NEW_TAB) => {
    const t = { id: Math.max(...tabs.map((x) => x.id)) + 1, hist: [to], at: 0, v: 0 };
    setTabs((ts) => [...ts, t]);
    setCur(t.id);
    setEdit(null);
    if (to === NEW_TAB) requestAnimationFrame(focusAddr);
  };
  const closeTab = (tid: number) => {
    if (tabs.length === 1) return wm.close(id);
    const i = tabs.findIndex((t) => t.id === tid);
    const rest = tabs.filter((t) => t.id !== tid);
    setTabs(rest);
    if (tid === cur) setCur(rest[Math.min(i, rest.length - 1)].id);
  };
  const cycle = (d: 1 | -1) => {
    const i = tabs.findIndex((t) => t.id === tab.id);
    setCur(tabs[(i + d + tabs.length) % tabs.length].id);
  };

  const openFile = async () => {
    const p = await fileDialog(id, {
      mode: "open",
      lang,
      filters: [
        { label: L("HTML dosyaları (*.htm;*.html)", "HTML files (*.htm;*.html)"), exts: ["htm", "html"] },
        { label: L("Tüm Dosyalar (*.*)", "All Files (*.*)"), exts: ["*"] },
      ],
    });
    if (p) go(normalize(p));
  };

  const print = () => page.kind === "file" && printHtml(page.title, page.html, "");

  const about = () =>
    void msgBox(id, {
      title: L("Internet Explorer Hakkında", "About Internet Explorer"),
      text: tr
        ? "Internet Explorer 11\nSürüm: 11.0.9600.17031\nGüncelleştirme Sürümleri: 11.0.7 (KB2929437)\n© 2013 Microsoft Corporation. Tüm hakları saklıdır."
        : "Internet Explorer 11\nVersion: 11.0.9600.17031\nUpdate Versions: 11.0.7 (KB2929437)\n© 2013 Microsoft Corporation. All rights reserved.",
      icon: "info",
      buttons: [L("Kapat", "Close")],
    });

  const zoomTo = (z: number) => setZoom(Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], z)));
  const zoomStep = (d: 1 | -1) =>
    setZoom((z) => (d > 0 ? (ZOOMS.find((x) => x > z) ?? z) : ([...ZOOMS].reverse().find((x) => x < z) ?? z)));

  // ---------- favorites ----------

  const favs = fs.list(FAVORITES).filter((n) => n.kind === "url" || n.kind === "html");
  const addFav = () => {
    if (page.kind !== "web" && page.kind !== "file") return;
    const name = page.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "Favori";
    fs.mkdir(FAVORITES);
    fs.write(join(FAVORITES, `${name}.url`), { target: url });
  };
  const favItems: MenuItem[] = [
    {
      label: L("Sık kullanılanlara ekle...", "Add to favorites..."),
      shortcut: "Ctrl+D",
      disabled: page.kind !== "web" && page.kind !== "file",
      onClick: addFav,
    },
    { sep: true },
    ...(favs.length
      ? favs.map((n): MenuItem => ({
          label: n.name.replace(/\.(url|html?)$/i, ""),
          icon: <ShellIcon name={n.kind === "url" ? "file-url" : "file-html"} size={16} />,
          onClick: () => go(n.kind === "url" ? toUrl(n.target ?? "") : join(FAVORITES, n.name)),
        }))
      : [{ label: L("(Boş)", "(Empty)"), disabled: true }]),
  ];

  const zoomItems: MenuItem[] = [
    { label: L("Yakınlaştır", "Zoom in"), shortcut: "Ctrl +", onClick: () => zoomStep(1) },
    { label: L("Uzaklaştır", "Zoom out"), shortcut: "Ctrl -", onClick: () => zoomStep(-1) },
    { sep: true },
    ...ZOOMS.map((z): MenuItem => ({ label: `${z}%`, radio: true, checked: zoom === z, onClick: () => zoomTo(z) })),
  ];
  const toolItems: MenuItem[] = [
    { label: L("Yazdır", "Print"), shortcut: "Ctrl+P", disabled: page.kind !== "file", onClick: print },
    { label: L(`Yakınlaştır (${zoom}%)`, `Zoom (${zoom}%)`), sub: zoomItems },
    { sep: true },
    { label: L("Menü çubuğu", "Menu bar"), checked: menuBar, onClick: () => setMenuBar((m) => !m) },
    { label: L("İnternet seçenekleri", "Internet options"), disabled: true },
    { label: L("Internet Explorer Hakkında", "About Internet Explorer"), onClick: about },
  ];

  useWinKeys({
    "ctrl+t": () => newTab(),
    "ctrl+w": () => closeTab(tab.id),
    "ctrl+n": () => void wm.launch("ie"),
    "ctrl+o": () => void openFile(),
    "ctrl+l": () => focusAddr(),
    "alt+d": () => focusAddr(),
    "ctrl+d": () => addFav(),
    "ctrl+p": () => print(),
    f5: () => refresh(),
    "ctrl+r": () => refresh(),
    "alt+arrowleft": () => step(-1),
    "alt+arrowright": () => step(1),
    "alt+home": () => go(HOME_URL),
    "ctrl+tab": () => cycle(1),
    "ctrl+shift+tab": () => cycle(-1),
    "ctrl+=": () => zoomStep(1),
    "ctrl+shift++": () => zoomStep(1),
    "ctrl+-": () => zoomStep(-1),
    "ctrl+0": () => zoomTo(100),
  });

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: L("Dosya", "File"),
      items: [
        { label: L("Yeni sekme", "New tab"), shortcut: "Ctrl+T", onClick: () => newTab() },
        { label: L("Yeni pencere", "New window"), shortcut: "Ctrl+N", onClick: () => void wm.launch("ie") },
        { label: L("Aç...", "Open..."), shortcut: "Ctrl+O", onClick: () => void openFile() },
        { sep: true },
        { label: L("Yazdır...", "Print..."), shortcut: "Ctrl+P", disabled: page.kind !== "file", onClick: print },
        { sep: true },
        { label: L("Sekmeyi kapat", "Close tab"), shortcut: "Ctrl+W", onClick: () => closeTab(tab.id) },
        { label: L("Çıkış", "Exit"), onClick: () => wm.close(id) },
      ],
    },
    {
      label: L("Görünüm", "View"),
      items: [
        { label: L("Yakınlaştır", "Zoom"), sub: zoomItems },
        { sep: true },
        { label: L("Durdur", "Stop"), shortcut: "Esc", disabled: true },
        { label: L("Yenile", "Refresh"), shortcut: "F5", onClick: refresh },
      ],
    },
    { label: L("Sık Kullanılanlar", "Favorites"), items: favItems },
    { label: L("Araçlar", "Tools"), items: toolItems },
    {
      label: L("Yardım", "Help"),
      items: [{ label: L("Internet Explorer Hakkında", "About Internet Explorer"), onClick: about }],
    },
  ];

  const popAt = (e: React.MouseEvent, which: "fav" | "tools") => {
    const r = e.currentTarget.getBoundingClientRect();
    setPop({ x: r.right - 240, y: r.bottom, which });
  };

  const shown = page.kind === "tabs" || page.kind === "blank" ? "" : url;
  const icon = (u: string) => (/^[a-z]:\\/i.test(u) ? "file-html" : "ie");

  return (
    <div className="ie">
      <div className="ie-bar">
        <button className="ie-nav back" disabled={tab.at === 0} onClick={() => step(-1)} title={L("Geri", "Back")}>
          {G.back}
        </button>
        <button
          className="ie-nav fwd"
          disabled={tab.at >= tab.hist.length - 1}
          onClick={() => step(1)}
          title={L("İleri", "Forward")}
        >
          {G.fwd}
        </button>
        <div className="ie-addr">
          <ShellIcon name={icon(url)} size={16} />
          <input
            ref={addr}
            value={edit ?? shown}
            spellCheck={false}
            aria-label={L("Adres", "Address")}
            placeholder={L("Ara veya adres girin", "Search or enter web address")}
            onFocus={(e) => {
              setEdit(shown);
              e.currentTarget.select();
            }}
            onBlur={() => setEdit(null)}
            onChange={(e) => setEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go(toUrl(edit ?? shown));
              else if (e.key === "Escape") e.currentTarget.blur();
            }}
          />
          <button
            title={L("Ara", "Search")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => go(toUrl(edit ?? shown))}
          >
            {G.search}
          </button>
          <button title={L("Yenile (F5)", "Refresh (F5)")} onClick={refresh}>
            {G.refresh}
          </button>
        </div>
        <div className="ie-tabs" role="tablist">
          {tabs.map((t) => {
            const u = t.hist[t.at];
            const title = pageOf(u, lang).title;
            return (
              <div
                key={t.id}
                role="tab"
                aria-selected={t.id === tab.id}
                className={`ie-tab ${t.id === tab.id ? "on" : ""}`}
                title={title}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(t.id);
                  } else setCur(t.id);
                }}
              >
                <ShellIcon name={icon(u)} size={16} />
                <span className="ie-tab-text">{title}</span>
                <button
                  className="ie-tab-x"
                  title={L("Sekmeyi kapat (Ctrl+W)", "Close Tab (Ctrl+W)")}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => closeTab(t.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button className="ie-newtab" title={L("Yeni sekme (Ctrl+T)", "New tab (Ctrl+T)")} onClick={() => newTab()}>
            <span />
          </button>
        </div>
        <button
          className="ie-tool"
          title={L("Giriş sayfası (Alt+Home)", "Home (Alt+Home)")}
          onClick={() => go(HOME_URL)}
        >
          {G.home}
        </button>
        <button
          className="ie-tool"
          title={L(
            "Sık kullanılanları, akışları ve geçmişi görüntüle (Alt+C)",
            "View favorites, feeds, and history (Alt+C)",
          )}
          onClick={(e) => popAt(e, "fav")}
        >
          {G.star}
        </button>
        <button className="ie-tool" title={L("Araçlar (Alt+X)", "Tools (Alt+X)")} onClick={(e) => popAt(e, "tools")}>
          {G.gear}
        </button>
      </div>
      {menuBar && (
        <div className="ie-menubar">
          <MenuBar menus={menus} />
        </div>
      )}
      <div className="ie-view">
        {page.kind === "file" ? (
          <iframe
            key={`${tab.id}:${tab.v}`}
            className="ie-frame"
            title={page.title}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={`<base target="_blank"><style>html{zoom:${zoom / 100}}</style>${page.html}`}
          />
        ) : (
          <div key={`${tab.id}:${tab.v}`} className="ie-doc" style={{ zoom: zoom / 100 }}>
            {page.kind === "home" && <HomePage lang={lang} go={go} />}
            {page.kind === "tabs" && <TabsPage lang={lang} go={go} favs={favs} />}
            {page.kind === "web" && <FramePage lang={lang} url={page.url} />}
            {page.kind === "error" && <ErrorPage lang={lang} url={url} go={go} />}
          </div>
        )}
      </div>
      {pop && (
        <ContextMenu
          x={pop.x}
          y={pop.y}
          items={pop.which === "fav" ? favItems : toolItems}
          onClose={() => setPop(null)}
        />
      )}
    </div>
  );
}

// ---------- pages ----------

/** The home page: an MSN-style start page made of the portfolio. */
function HomePage({ lang, go }: { lang: Lang; go: (u: string) => void }) {
  const tr = lang === "tr";
  const [q, setQ] = useState("");
  const link = (p: (typeof projects)[number]) => [p.links.demo, p.links.repo].find(real);
  const [hero, ...rest] = projects;
  return (
    <div className="ie-home">
      <header className="ie-home-top">
        <span className="ie-home-brand">{profile.name}</span>
        <span className="ie-home-sub">{profile.title[lang]}</span>
        <form
          className="ie-home-search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) go(`https://www.bing.com/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr ? "Web'de ara" : "Search the web"} />
          <button aria-label={tr ? "Ara" : "Search"}>bing</button>
        </form>
      </header>
      <div className="ie-home-main">
        <section className="ie-home-news">
          {hero && (
            <button className="ie-home-hero" disabled={!link(hero)} onClick={() => go(link(hero)!)}>
              <CoverArt seed={hero.id} motif={hero.motif} palette={hero.palette} />
              <span className="ie-home-cap">
                <b>{hero.title}</b>
                {hero.tagline[lang]}
              </span>
            </button>
          )}
          <h2>{tr ? "Projeler" : "Projects"}</h2>
          <div className="ie-home-grid">
            {rest.map((p) => (
              <button key={p.id} className="ie-home-card" disabled={!link(p)} onClick={() => go(link(p)!)}>
                <CoverArt seed={p.id} motif={p.motif} palette={p.palette} />
                <b>{p.title}</b>
                <span>
                  {p.genre[lang]} · {p.year}
                </span>
              </button>
            ))}
          </div>
        </section>
        <aside className="ie-home-side">
          <h2>{tr ? "Hakkımda" : "About me"}</h2>
          <p className="ie-home-who">
            <b>{profile.title[lang]}</b>
            {profile.location[lang]}
          </p>
          <p>{profile.about[lang]}</p>
          <h2>{tr ? "Deneyim" : "Experience"}</h2>
          {profile.experience.map((x) => (
            <p key={x.company} className="ie-home-exp">
              <b>{x.role[lang]}</b>
              {x.company} · {x.period}
            </p>
          ))}
          <h2>{tr ? "Bağlantılar" : "Links"}</h2>
          {socials
            .filter((s) => real(s.url))
            .map((s) => (
              <button key={s.id} className="ie-link" onClick={() => go(s.url)}>
                {s.label} · {s.handle}
              </button>
            ))}
        </aside>
      </div>
      <footer className="ie-home-foot">© 2026 {profile.name}</footer>
    </div>
  );
}

/** about:Tabs, the new tab page: tiles of frequent sites. */
function TabsPage({ lang, go, favs }: { lang: Lang; go: (u: string) => void; favs: FNode[] }) {
  const tr = lang === "tr";
  const sites = [
    ...favs
      .filter((n) => n.kind === "url" && real(n.target))
      .map((n) => ({ name: n.name.slice(0, -4), url: n.target! })),
    ...socials.filter((s) => real(s.url)).map((s) => ({ name: s.label, url: s.url })),
    ...projects.flatMap((p) => [p.links.demo, p.links.repo].filter(real).map((u) => ({ name: p.title, url: u! }))),
  ].slice(0, 10);
  const colors = ["#2672ec", "#00a300", "#dc572e", "#7200ac", "#008299", "#ac193d", "#d39d09", "#4617b4"];
  return (
    <div className="ie-tabs-page">
      <h1>{tr ? "Sık ziyaret edilen siteler" : "Frequent"}</h1>
      <div className="ie-tiles">
        {sites.map((s, i) => (
          <button key={`${s.url}${i}`} className="ie-tile" title={s.url} onClick={() => go(s.url)}>
            <span className="ie-tile-face" style={{ background: colors[i % colors.length] }}>
              {s.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="ie-tile-name">{s.name}</span>
          </button>
        ))}
      </div>
      <button className="ie-link" onClick={() => go(HOME_URL)}>
        {tr ? "Giriş sayfasına git" : "Go to your home page"}
      </button>
    </div>
  );
}

/** What IE shows when a site refuses to be framed, with a way out to a real browser tab. */
function FramePage({ lang, url }: { lang: Lang; url: URL }) {
  const tr = lang === "tr";
  return (
    <div className="ie-msg">
      <h1>{tr ? "Bu içerik bir çerçevede görüntülenemiyor" : "This content cannot be displayed in a frame"}</h1>
      <p>
        {tr
          ? "Bu web sitesine girdiğiniz bilgilerin güvenliğini korumaya yardımcı olmak için, bu içeriğin yayımcısı içeriğin bir çerçevede görüntülenmesine izin vermiyor."
          : "To help protect the security of information you enter into this website, the publisher of this content does not allow it to be displayed in a frame."}
      </p>
      <p className="ie-msg-url">{url.href}</p>
      <p>{tr ? "Deneyebilecekleriniz:" : "What you can try:"}</p>
      <button className="ie-msg-btn" onClick={() => window.open(url.href, "_blank", "noopener")}>
        {tr ? "Bu içeriği yeni bir pencerede açın" : "Open this content in a new window"}
      </button>
    </div>
  );
}

/** IE's "This page can't be displayed". */
function ErrorPage({ lang, url, go }: { lang: Lang; url: string; go: (u: string) => void }) {
  const tr = lang === "tr";
  return (
    <div className="ie-msg">
      <h1>{tr ? "Bu sayfa görüntülenemiyor" : "This page can't be displayed"}</h1>
      <ul>
        <li>
          {tr ? "Web adresinin " : "Make sure the web address "}
          <b>{url}</b>
          {tr ? " doğru olduğundan emin olun." : " is correct."}
        </li>
        <li>
          <button className="ie-link" onClick={() => go(`https://www.bing.com/search?q=${encodeURIComponent(url)}`)}>
            {tr ? "Sayfayı arama motorunuzla arayın." : "Look for the page with your search engine."}
          </button>
        </li>
        <li>{tr ? "Birkaç dakika sonra sayfayı yenileyin." : "Refresh the page in a few minutes."}</li>
      </ul>
    </div>
  );
}
