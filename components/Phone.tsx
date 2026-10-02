"use client";
/** Phone layout, in the spirit of Windows Phone 8.1: vertical tile Start, app list, pivots, action center and a nav bar. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useOS, useTick } from "@/lib/os";
import { longDate, time } from "@/lib/i18n";
import { APPS, GROUPS, app, sizesFor, type AppId, type TileSize } from "@/lib/model";
import { sound } from "@/lib/sound";
import { projects, socials } from "@/content/portfolio";
import { Icon } from "./Icons";
import { Tile, useLauncher } from "./Start";
import { useTileMeta } from "./Tiles";
import { AppHost } from "./AppHost";
import { Toasts, useSearch } from "./Charms";
import { CoverArt } from "./CoverArt";

export function Phone() {
  const os = useOS();
  const { view, back, open, canBack } = os;
  const [center, setCenter] = useState(false);
  const [search, setSearch] = useState(false);

  const goBack = () => {
    sound.tap();
    if (center) return setCenter(false);
    if (search) return setSearch(false);
    if (view.kind === "apps") return open({ kind: "start" });
    if (canBack) back();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (e.key === "Escape" || (e.key === "Backspace" && !typing)) {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="phone">
      <StatusBar onOpen={() => setCenter(true)} />
      <div className="phone-main">
        {view.kind === "start" && <PhoneStart />}
        {view.kind === "apps" && <PhoneAppList onSearch={() => setSearch(true)} />}
        {view.kind === "app" && <AppHost key={view.app} view={view} />}
      </div>
      {search && <PhoneSearch onClose={() => setSearch(false)} />}
      <ActionCenter open={center} onClose={() => setCenter(false)} />
      <Toasts />
      <nav className="navbar">
        <button onClick={goBack} aria-label={os.t("back")}>
          <Icon name="back" size={22} />
        </button>
        <button
          onClick={() => {
            setCenter(false);
            setSearch(false);
            open({ kind: "start" });
          }}
          aria-label={os.t("start")}
        >
          <Icon name="start" size={24} />
        </button>
        <button onClick={() => setSearch(true)} aria-label={os.t("charm.search")}>
          <Icon name="search" size={22} />
        </button>
      </nav>
    </div>
  );
}

function StatusBar({ onOpen }: { onOpen: () => void }) {
  const now = new Date(useTick(10_000));
  const start = useRef<number | null>(null);
  return (
    <div
      className="statusbar"
      onClick={onOpen}
      onTouchStart={(e) => (start.current = e.touches[0].clientY)}
      onTouchEnd={(e) => {
        if (start.current !== null && e.changedTouches[0].clientY - start.current > 30) onOpen();
        start.current = null;
      }}
    >
      <span className="sb-left">
        <i className="sig" />
        <Icon name="wifi" size={14} />
      </span>
      <span className="sb-right">
        <Icon name="battery" size={16} />
        <span>{time(now)}</span>
      </span>
    </div>
  );
}

function PhoneStart() {
  const os = useOS();
  const { tiles, setTiles, t, open, earn } = os;
  const [selected, setSelected] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [entering, setEntering] = useState(true);
  const launch = useLauncher(() => setLeaving(true));
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setEntering(false), 1200);
    return () => window.clearTimeout(id);
  }, []);

  // Phone Start is one long column: me, projects, reading, links.
  const order = GROUPS.map((g) => g.id as string);
  // Desktop programs don't exist on the phone.
  const list = [...tiles].filter((x) => x.pinned && !(x.key.startsWith("app:") && app(x.key.slice(4) as AppId).phone === false)).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  const sel = list.find((x) => x.key === selected);

  return (
    <div
      className={`pstart ${entering ? "entering" : ""} ${leaving ? "leaving" : ""} ${selected ? "editing" : ""}`}
      onTouchStart={(e) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (dx < -70 && Math.abs(dx) > Math.abs(dy) * 1.5) open({ kind: "apps" });
      }}
      onClick={() => selected && setSelected(null)}
    >
      <div className="pstart-grid">
        {list.map((tile, i) => (
          <Tile
            key={tile.key}
            tile={tile.size === "large" ? { ...tile, size: "wide" } : tile}
            index={i}
            selected={selected === tile.key}
            selecting={!!selected}
            onSelect={(k) => setSelected((s) => (s === k ? null : k))}
            onOpen={launch}
          />
        ))}
      </div>
      <button className="pstart-more" onClick={(e) => { e.stopPropagation(); open({ kind: "apps" }); }} aria-label={t("allApps")}>
        <Icon name="forward" size={18} />
      </button>
      {sel && (
        <div className="pedit" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setTiles((all) => all.map((x) => (x.key === sel.key ? { ...x, pinned: false } : x)));
              setSelected(null);
              earn("architect");
            }}
          >
            <Icon name="unpin" size={20} />
            <span>{t("tile.unpin")}</span>
          </button>
          <button
            onClick={() => {
              const sizes = sizesFor(sel.key).filter((s) => s !== "large") as TileSize[];
              const next = sizes[(sizes.indexOf(sel.size) + 1) % sizes.length] ?? "medium";
              setTiles((all) => all.map((x) => (x.key === sel.key ? { ...x, size: next } : x)));
              earn("architect");
            }}
          >
            <Icon name="resize" size={20} />
            <span>{t("tile.resize")}</span>
          </button>
          <button onClick={() => setSelected(null)}>
            <Icon name="check" size={20} />
            <span>{t("tile.clear")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function PhoneAppList({ onSearch }: { onSearch: () => void }) {
  const { lang, t } = useOS();
  const meta = useTileMeta();
  const launch = useLauncher();
  const [jump, setJump] = useState(false);
  const keys = [...APPS.filter((a) => a.phone !== false).map((a) => `app:${a.id}`), ...projects.map((p) => `project:${p.id}`), ...socials.map((s) => `social:${s.id}`)];
  const items = keys.map((k) => ({ k, m: meta(k) })).sort((a, b) => a.m.title.localeCompare(b.m.title, lang));
  const groups = useMemo(() => {
    const g = new Map<string, typeof items>();
    for (const it of items) {
      const L = it.m.title[0].toLocaleUpperCase(lang);
      g.set(L, [...(g.get(L) ?? []), it]);
    }
    return g;
  }, [items, lang]);
  const letters = (lang === "tr" ? "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ").split("");

  return (
    <div className="papps">
      <button className="papps-search" onClick={onSearch}>
        <Icon name="search" size={20} />
        <span>{t("apps.search")}</span>
      </button>
      {[...groups.entries()].map(([L, list]) => (
        <section key={L} id={`letter-${L}`}>
          <button className="papps-letter" onClick={() => setJump(true)}>
            {L.toLocaleLowerCase(lang)}
          </button>
          {list.map(({ k, m }) => (
            <button key={k} className="papps-item" onClick={() => launch(m)}>
              <span className="papps-icon" style={{ background: k.startsWith("app:") ? "var(--accent)" : m.color }}>
                <Icon name={m.icon} size={24} />
              </span>
              <span>{m.title}</span>
            </button>
          ))}
        </section>
      ))}
      {jump && (
        <div className="jumplist" onClick={() => setJump(false)}>
          {letters.map((L) => (
            <button
              key={L}
              className={groups.has(L) ? "has" : ""}
              disabled={!groups.has(L)}
              onClick={() => {
                setJump(false);
                document.getElementById(`letter-${L}`)?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {L.toLocaleLowerCase(lang)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PhoneSearch({ onClose }: { onClose: () => void }) {
  const { t, open, toast } = useOS();
  const [q, setQ] = useState("");
  const hits = useSearch(q);
  return (
    <div className="psearch">
      <div className="psearch-box">
        <Icon name="search" size={20} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search.placeholder")} aria-label={t("charm.search")} />
        <button onClick={onClose} aria-label={t("mail.cancel")}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="psearch-results">
        {q && !hits.length && <p className="dim">{t("search.empty")}</p>}
        {hits.map((h) => (
          <button
            key={h.id}
            className="search-hit"
            onClick={() => {
              onClose();
              if (h.view) open(h.view);
              else if (h.url && h.url !== "#") window.open(h.url, "_blank", "noopener,noreferrer");
              else toast({ title: t("placeholderLink"), body: h.title, color: "#555", icon: "link" });
            }}
          >
            <span className="search-hit-icon" style={{ background: h.color }}>
              {h.art ? <CoverArt seed={h.art.seed} motif={h.art.motif} palette={h.art.palette} /> : <Icon name={h.icon} size={20} />}
            </span>
            <span className="search-hit-text">
              <strong>{h.title}</strong>
              <small>{h.sub}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionCenter({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  const os = useOS();
  const { t, lang, setPref, sfx, motion, phoneTheme, notifications, clearNotifications, openApp, open, power } = os;
  const now = new Date(useTick(10_000));
  const start = useRef<number | null>(null);
  return (
    <div
      className={`acenter ${isOpen ? "open" : ""}`}
      onTouchStart={(e) => (start.current = e.touches[0].clientY)}
      onTouchEnd={(e) => {
        if (start.current !== null && e.changedTouches[0].clientY - start.current < -40) onClose();
        start.current = null;
      }}
      aria-hidden={!isOpen}
    >
      <div className="ac-head">
        <span className="ac-time">{time(now)}</span>
        <span className="ac-date">{longDate(lang, now)}</span>
        <button className="ac-all" onClick={() => { onClose(); openApp("settings"); }}>
          {t("phone.allSettings")}
        </button>
      </div>
      <div className="ac-quick">
        <button className="on" onClick={() => setPref("lang", lang === "tr" ? "en" : "tr")}>
          <span className="quick-lang">{lang === "tr" ? "TR" : "EN"}</span>
          <small>{t("settings.language")}</small>
        </button>
        <button className={sfx ? "on" : ""} onClick={() => setPref("sfx", !sfx)}>
          <Icon name={sfx ? "volume" : "mute"} size={22} />
          <small>{t("settings.sound")}</small>
        </button>
        <button className={motion === "full" ? "on" : ""} onClick={() => setPref("motion", motion === "full" ? "reduced" : "full")}>
          <Icon name="motion" size={22} />
          <small>{t("settings.motion")}</small>
        </button>
        <button className="on" onClick={() => setPref("phoneTheme", phoneTheme === "dark" ? "light" : "dark")}>
          <Icon name="brush" size={22} />
          <small>{t(phoneTheme === "dark" ? "settings.dark" : "settings.light")}</small>
        </button>
        <button className="on" onClick={() => { onClose(); power("sleep"); }}>
          <Icon name="lock" size={22} />
          <small>{t("power.lock")}</small>
        </button>
      </div>
      <div className="ac-list">
        <div className="ac-list-head">
          <span>{t("phone.actionCenter")}</span>
          {notifications.length > 0 && <button onClick={clearNotifications}>{t("phone.clear")}</button>}
        </div>
        {!notifications.length && <p className="dim">{t("phone.noNotifications")}</p>}
        {notifications.map((n) => (
          <button
            key={n.id}
            className="ac-note"
            onClick={() => {
              onClose();
              if (n.action) open(n.action);
            }}
          >
            <span className="ac-note-icon" style={{ background: n.color }}>
              <Icon name={n.icon} size={16} />
            </span>
            <span>
              <strong>{n.title}</strong>
              <small>{n.body}</small>
            </span>
          </button>
        ))}
      </div>
      <button className="ac-grip" onClick={onClose} aria-label={t("back")}>
        <Icon name="up" size={16} />
      </button>
    </div>
  );
}
