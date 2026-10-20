"use client";
/** Hot corners, the charms bar with its clock overlay, the charm panes (search, share, devices, settings, personalize) and toasts. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useOS, useTick, type View } from "@/lib/os";
import { longDate, pick, time, dayName, type Key } from "@/lib/i18n";
import {
  APPS,
  COLORS,
  PATTERNS,
  VISITOR_ACHIEVEMENTS,
  app,
  socialIcon,
  type AppId,
  type IconName,
  type ShellIconName,
} from "@/lib/model";
import { fs, join, HOME, type FNode } from "@/lib/fs";
import { AppIcon } from "./icons/AppIcon";
import { ShellIcon } from "./icons/ShellIcons";
import { nodeIcon, useOpenPath } from "./desktop/shell";
import { sound } from "@/lib/sound";
import { achievements, media, profile, projects, socials } from "@/content/portfolio";
import { Icon } from "./Icons";
import { CoverArt } from "./CoverArt";

export function Charms() {
  const os = useOS();
  const { charm, setCharm, view, recent, open, phone, t } = os;
  const [peek, setPeek] = useState(false);
  const [left, setLeft] = useState<null | "top" | "bottom" | "list">(null);
  const [winx, setWinx] = useState(false);
  const leaveTimer = useRef(0);
  const openWinx = (e: React.MouseEvent) => {
    e.preventDefault();
    setLeft(null);
    setWinx(true);
  };

  // Touch: swipe in from the right edge for charms, from the left edge for the previous app.
  useEffect(() => {
    if (phone) return;
    let start: { x: number; y: number; edge: "l" | "r" | null } | null = null;
    const ts = (e: TouchEvent) => {
      const p = e.touches[0];
      const w = window.innerWidth;
      start = { x: p.clientX, y: p.clientY, edge: p.clientX > w - 24 ? "r" : p.clientX < 24 ? "l" : null };
    };
    const te = (e: TouchEvent) => {
      if (!start?.edge) return;
      const p = e.changedTouches[0];
      const dx = p.clientX - start.x;
      if (start.edge === "r" && dx < -40) setCharm("bar");
      if (start.edge === "l" && dx > 40) {
        const prev = recent.find((r) => JSON.stringify(r) !== JSON.stringify(view));
        if (prev) open(prev);
      }
      start = null;
    };
    window.addEventListener("touchstart", ts, { passive: true });
    window.addEventListener("touchend", te, { passive: true });
    return () => {
      window.removeEventListener("touchstart", ts);
      window.removeEventListener("touchend", te);
    };
  }, [phone, setCharm, recent, view, open]);

  const enterCorner = () => {
    window.clearTimeout(leaveTimer.current);
    if (!charm) setPeek(true);
  };
  const leaveBar = () => {
    leaveTimer.current = window.setTimeout(() => {
      setPeek(false);
      if (charm === "bar") setCharm(null);
    }, 350);
  };

  const showBar = charm === "bar" || (peek && !charm);
  const prevApp = recent.find((r) => JSON.stringify(r) !== JSON.stringify(view));

  return (
    <>
      <div className="corner corner-tr" onMouseEnter={enterCorner} />
      <div className="corner corner-br" onMouseEnter={enterCorner} />
      <div className="corner corner-tl" onMouseEnter={() => prevApp && setLeft("top")} />
      {!(view.kind === "app" && view.app === "desktop") && (
        <div
          className="corner corner-bl"
          onMouseEnter={() => view.kind !== "start" && setLeft("bottom")}
          onContextMenu={openWinx}
        />
      )}
      {winx && <PowerUserMenu onClose={() => setWinx(false)} />}

      {left && (
        <div
          className="switcher"
          onMouseLeave={() => setLeft(null)}
          onMouseMove={(e) => left === "top" && e.clientY > 140 && setLeft("list")}
        >
          {left === "bottom" ? (
            <button
              className="switch-thumb switch-start"
              style={{ top: "auto", bottom: 0 }}
              onClick={() => {
                setLeft(null);
                open({ kind: "start" });
              }}
              onContextMenu={openWinx}
            >
              <Icon name="start" size={34} />
            </button>
          ) : left === "top" && prevApp ? (
            <SwitchThumb
              v={prevApp}
              onPick={(v) => {
                setLeft(null);
                open(v);
              }}
            />
          ) : (
            <div className="switch-list">
              {recent
                .filter((r) => JSON.stringify(r) !== JSON.stringify(view))
                .map((r, i) => (
                  <SwitchThumb
                    key={i}
                    v={r}
                    onPick={(v) => {
                      setLeft(null);
                      open(v);
                    }}
                    inList
                  />
                ))}
              <button
                className="switch-thumb switch-start in-list"
                onClick={() => {
                  setLeft(null);
                  open({ kind: "start" });
                }}
              >
                <Icon name="start" size={30} />
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className={`charms ${showBar ? "show" : ""} ${charm === "bar" ? "solid" : ""}`}
        onMouseEnter={() => {
          window.clearTimeout(leaveTimer.current);
          if (peek || charm === "bar") {
            setCharm("bar");
            setPeek(false);
          }
        }}
        onMouseLeave={leaveBar}
        aria-hidden={!showBar}
      >
        {(
          [
            ["search", "charm.search", () => setCharm("search")],
            ["share", "charm.share", () => setCharm("share")],
            [
              "start",
              "charm.start",
              () => {
                setCharm(null);
                setPeek(false);
                open(view.kind === "start" && recent[0] ? recent[0] : { kind: "start" });
              },
            ],
            ["devices", "charm.devices", () => setCharm("devices")],
            ["settings", "charm.settings", () => setCharm("settings")],
          ] as [IconName, Parameters<typeof t>[0], () => void][]
        ).map(([icon, label, fn]) => (
          <button
            key={icon}
            className={`charm charm-${icon}`}
            onClick={() => {
              sound.tap();
              setPeek(false);
              fn();
            }}
            tabIndex={showBar ? 0 : -1}
          >
            <Icon name={icon} size={icon === "start" ? 34 : 28} strokeWidth={1.5} />
            <span>{t(label)}</span>
          </button>
        ))}
      </div>
      {charm === "bar" && <ClockOverlay />}
      {charm && charm !== "bar" && <div className="pane-scrim" onClick={() => setCharm(null)} />}
      {charm === "search" && <SearchPane />}
      {charm === "share" && <SharePane />}
      {charm === "devices" && <DevicesPane />}
      {charm === "settings" && <SettingsPane />}
      {charm === "personalize" && <PersonalizePane />}
    </>
  );
}

/** Win+X "power user" menu: right-click the Start button or the bottom-left corner. */
export function PowerUserMenu({ onClose, bottom = 0 }: { onClose: () => void; bottom?: number }) {
  const { t, open, setCharm, power } = useOS();
  const [sub, setSub] = useState(false);
  const go = (app: View) => () => open(app);
  const item = (label: Key, fn: () => void) => (
    <button
      key={label}
      onClick={() => {
        onClose();
        fn();
      }}
    >
      {t(label)}
    </button>
  );
  return (
    <>
      <div className="menu-scrim" onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div className="flyout winx" style={{ bottom }} onContextMenu={(e) => e.preventDefault()}>
        {item("winx.programs", go({ kind: "app", app: "control", param: "programs" }))}
        {item("winx.powerOptions", go({ kind: "app", app: "control", param: "power" }))}
        {item("winx.system", go({ kind: "app", app: "control", param: "system" }))}
        {item("winx.devices", go({ kind: "app", app: "control", param: "devices" }))}
        {item("winx.network", go({ kind: "app", app: "control", param: "network" }))}
        {item("winx.disk", go({ kind: "app", app: "explorer", param: "::thispc" }))}
        {item("winx.cmd", go({ kind: "app", app: "cmd" }))}
        {item("winx.cmdAdmin", go({ kind: "app", app: "cmd", param: "C:\\Windows\\system32" }))}
        <hr />
        {item("winx.taskmgr", go({ kind: "app", app: "taskmgr" }))}
        {item("winx.control", go({ kind: "app", app: "control" }))}
        {item("winx.explorer", go({ kind: "app", app: "explorer" }))}
        {item("winx.search", () => setCharm("search"))}
        {item("winx.run", go({ kind: "app", app: "run" }))}
        <hr />
        <div className="winx-sub" onMouseEnter={() => setSub(true)} onMouseLeave={() => setSub(false)}>
          <button onClick={() => setSub((s) => !s)}>
            {t("winx.power")} <span className="winx-arrow">›</span>
          </button>
          {sub && (
            <div className="flyout winx">
              {item("power.signout", () => power("signout"))}
              {item("power.sleep", () => power("sleep"))}
              {item("power.off", () => power("shutdown"))}
              {item("power.restart", () => power("restart"))}
            </div>
          )}
        </div>
        {item("winx.desktop", go({ kind: "app", app: "desktop" }))}
      </div>
    </>
  );
}

function SwitchThumb({ v, onPick, inList }: { v: View; onPick: (v: View) => void; inList?: boolean }) {
  const { t } = useOS();
  if (v.kind !== "app") return null;
  const a = app(v.app);
  return (
    <button
      className={`switch-thumb ${inList ? "in-list" : ""}`}
      style={{ background: a.color }}
      onClick={() => onPick(v)}
      title={t(a.title)}
    >
      <AppIcon id={a.id} size={inList ? 30 : 40} />
      {!inList && <span>{t(a.title)}</span>}
    </button>
  );
}

function ClockOverlay() {
  const { lang } = useOS();
  const now = new Date(useTick(10_000));
  return (
    <div className="clock-overlay">
      <div className="clock-icons">
        <Icon name="wifi" size={26} />
        <Icon name="battery" size={26} />
      </div>
      <div className="clock-time">{time(now)}</div>
      <div className="clock-date">
        <span>{dayName(lang, now.getDay())}</span>
        <span>
          {longDate(lang, now)
            .replace(`, ${dayName(lang, now.getDay())}`, "")
            .replace(`${dayName(lang, now.getDay())}, `, "")}
        </span>
      </div>
    </div>
  );
}

function Pane({
  title,
  children,
  className,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  onBack?: () => void;
}) {
  const { setCharm, t } = useOS();
  return (
    <aside className={`pane ${className ?? ""}`} onClick={(e) => e.stopPropagation()}>
      <header className="pane-head">
        <button
          className="circle-btn small"
          onClick={() => (onBack ? onBack() : setCharm("bar"))}
          aria-label={t("back")}
        >
          <Icon name="back" size={18} />
        </button>
        <h2>{title}</h2>
      </header>
      <div className="pane-body">{children}</div>
    </aside>
  );
}

type Hit = {
  id: string;
  title: string;
  sub: string;
  icon: IconName;
  color: string;
  view?: View;
  url?: string;
  /** Draw this app's own icon (desktop programs have colorful ones). */
  app?: AppId;
  /** A file on the desktop's file system. */
  path?: string;
  shell?: ShellIconName;
  art?: { seed: string; motif: (typeof projects)[number]["motif"]; palette: [string, string, string] };
};

/** Files whose names match, searched from the user's folder down (Windows 8.1 "Everywhere" search includes files). */
function findFiles(s: string, lang: "tr" | "en", limit = 8) {
  const out: { path: string; node: FNode }[] = [];
  const walk = (dir: string, depth: number) => {
    for (const n of fs.list(dir)) {
      if (out.length >= limit) return;
      const p = join(dir, n.name);
      if (fs.label(n, lang).toLocaleLowerCase(lang).includes(s) && n.kind !== "drive") out.push({ path: p, node: n });
      if (n.children && depth < 6) walk(p, depth + 1);
    }
  };
  walk(HOME, 0);
  return out;
}

export function useSearch(q: string, files = false): Hit[] {
  const { t, lang } = useOS();
  return useMemo(() => {
    const s = q.trim().toLocaleLowerCase(lang);
    if (!s) return [];
    const has = (...xs: string[]) => xs.some((x) => x.toLocaleLowerCase(lang).includes(s));
    const hits: Hit[] = [];
    for (const a of APPS)
      if (!a.hidden && !(a.kind === "desktop" && !files) && has(t(a.title), a.id, a.exe ?? ""))
        hits.push({
          id: `app:${a.id}`,
          title: t(a.title),
          sub:
            a.kind === "desktop"
              ? t(a.cat === "accessories" ? "cat.accessories" : a.cat === "games" ? "cat.games" : "cat.system")
              : t("apps"),
          icon: a.icon,
          color: a.color,
          view: { kind: "app", app: a.id },
          app: a.id,
        });
    if (files)
      for (const f of findFiles(s, lang))
        hits.push({
          id: `f:${f.path}`,
          title: fs.label(f.node, lang),
          sub: f.path,
          icon: "file",
          color: "#4a4a4a",
          path: f.path,
          shell: nodeIcon(f.node, f.path),
        });
    for (const p of projects)
      if (has(p.title, pick(lang, p.tagline), pick(lang, p.description), ...p.tech, pick(lang, p.genre)))
        hits.push({
          id: `p:${p.id}`,
          title: p.title,
          sub: pick(lang, p.tagline),
          icon: "projects",
          color: p.palette[1],
          view: { kind: "app", app: "projects", param: p.id },
          art: { seed: p.id, motif: p.motif, palette: p.palette },
        });
    for (const m of media)
      if (has(pick(lang, m.title), pick(lang, m.summary)))
        hits.push({
          id: `m:${m.id}`,
          title: pick(lang, m.title),
          sub: t(`kind.${m.kind}`),
          icon: "reader",
          color: app("reader").color,
          view: { kind: "app", app: "reader", param: m.id },
          art: { seed: m.id, motif: m.motif, palette: m.palette },
        });
    for (const a of achievements)
      if (has(pick(lang, a.name), a.issuer))
        hits.push({
          id: `a:${a.id}`,
          title: pick(lang, a.name),
          sub: a.issuer,
          icon: "achievements",
          color: app("achievements").color,
          view: { kind: "app", app: "achievements" },
        });
    for (const e of profile.experience)
      if (has(e.company, pick(lang, e.role)))
        hits.push({
          id: `e:${e.company}`,
          title: e.company,
          sub: pick(lang, e.role),
          icon: "profile",
          color: app("profile").color,
          view: { kind: "app", app: "profile" },
        });
    for (const so of socials)
      if (has(so.label, so.handle))
        hits.push({
          id: `s:${so.id}`,
          title: so.label,
          sub: so.handle,
          icon: socialIcon(so.id),
          color: "#333",
          url: so.url,
        });
    return hits.slice(0, 24);
    // fs.version keeps file results fresh
  }, [q, t, lang, files, fs.version]); // eslint-disable-line react-hooks/exhaustive-deps
}

function SearchPane() {
  const { t, open, setCharm, toast } = useOS();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const hits = useSearch(q, true);
  const openPath = useOpenPath();

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    const onSeed = (e: Event) => setQ((x) => x + String((e as CustomEvent).detail ?? ""));
    window.addEventListener("metro:search", onSeed);
    return () => window.removeEventListener("metro:search", onSeed);
  }, []);

  const go = (h: Hit) => {
    sound.tap();
    if (h.path) openPath(h.path);
    else if (h.view) open(h.view);
    else if (h.url && h.url !== "#") window.open(h.url, "_blank", "noopener,noreferrer");
    else toast({ title: t("placeholderLink"), body: h.title, color: "#555", icon: "link" });
    setCharm(null);
  };

  return (
    <Pane title={t("charm.search")} className="pane-search">
      <div className="search-scope">{t("search.everywhere")} ▾</div>
      <form
        className="search-box"
        onSubmit={(e) => {
          e.preventDefault();
          if (hits[0]) go(hits[0]);
        }}
      >
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("charm.search")}
        />
        <button type="submit" aria-label={t("charm.search")}>
          <Icon name="search" size={18} />
        </button>
      </form>
      <div className="search-results">
        {!q && (
          <>
            <h3>{t("search.suggest")}</h3>
            {["Three.js", "React", "Next.js", profile.experience[0]?.company ?? "", "Web Audio"]
              .filter(Boolean)
              .map((s) => (
                <button key={s} className="search-suggest" onClick={() => setQ(s)}>
                  <Icon name="search" size={14} /> {s}
                </button>
              ))}
          </>
        )}
        {q && !hits.length && <p className="dim">{t("search.empty")}</p>}
        {hits.map((h) => (
          <button key={h.id} className="search-hit" onClick={() => go(h)}>
            <span className="search-hit-icon" style={{ background: h.color }}>
              {h.art ? (
                <CoverArt seed={h.art.seed} motif={h.art.motif} palette={h.art.palette} />
              ) : h.shell ? (
                <ShellIcon name={h.shell} size={24} />
              ) : h.app ? (
                <AppIcon id={h.app} size={h.app && app(h.app).kind === "desktop" ? 24 : 20} />
              ) : (
                <Icon name={h.icon} size={20} />
              )}
            </span>
            <span className="search-hit-text">
              <strong>{h.title}</strong>
              <small>{h.sub}</small>
            </span>
          </button>
        ))}
      </div>
    </Pane>
  );
}

function SharePane() {
  const { t, view, toast, lang } = useOS();
  const subject =
    view.kind === "app"
      ? view.app === "projects" && view.param
        ? projects.find((p) => p.id === view.param)?.title
        : t(app(view.app).title)
      : t("start");
  const url = typeof window !== "undefined" ? window.location.href : "";
  const text = `${profile.name} · ${subject ?? ""}`;
  return (
    <Pane title={t("charm.share")} className="pane-dark">
      <p className="pane-sub">{text}</p>
      <button
        className="pane-row"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            /* clipboard may be blocked inside frames */
          }
          toast({ title: t("share.copied"), body: url.slice(0, 60), color: "var(--accent)", icon: "link" });
        }}
      >
        <span className="pane-row-icon" style={{ background: "#555" }}>
          <Icon name="link" size={22} />
        </span>
        {t("share.copy")}
      </button>
      <a className="pane-row" href={`mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`}>
        <span className="pane-row-icon" style={{ background: app("mail").color }}>
          <Icon name="mail" size={22} />
        </span>
        {t("share.mail")}
      </a>
      {typeof navigator !== "undefined" && "share" in navigator && (
        <button className="pane-row" onClick={() => navigator.share({ title: text, url }).catch(() => {})}>
          <span className="pane-row-icon" style={{ background: "var(--accent)" }}>
            <Icon name="share" size={22} />
          </span>
          {t("share.native")}
        </button>
      )}
      <h3>{lang === "tr" ? "Bağlantılarım" : "My links"}</h3>
      {socials.map((s) => (
        <a
          key={s.id}
          className="pane-row"
          href={s.url === "#" ? undefined : s.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            if (s.url === "#") {
              e.preventDefault();
              toast({ title: t("placeholderLink"), body: s.label, color: "#555", icon: "link" });
            }
          }}
        >
          <span className="pane-row-icon" style={{ background: "#333" }}>
            <Icon name={socialIcon(s.id)} size={22} />
          </span>
          <span>
            {s.label}
            <small>{s.handle}</small>
          </span>
        </a>
      ))}
    </Pane>
  );
}

function DevicesPane() {
  const { t, openApp, setCharm } = useOS();
  const rows: [IconName, Parameters<typeof t>[0], Parameters<typeof t>[0]][] = [
    ["keyboard", "devices.keyboard", "devices.keyboardNote"],
    ["mouse", "devices.mouse", "devices.mouseNote"],
    ["touch", "devices.touch", "devices.touchNote"],
  ];
  return (
    <Pane title={t("charm.devices")} className="pane-dark">
      <p className="pane-sub">{t("devices.title")}</p>
      {rows.map(([icon, a, b]) => (
        <div key={icon} className="pane-row static">
          <span className="pane-row-icon" style={{ background: "var(--accent)" }}>
            <Icon name={icon} size={22} />
          </span>
          <span>
            {t(a)}
            <small>{t(b)}</small>
          </span>
        </div>
      ))}
      <button
        className="pane-row"
        onClick={() => {
          setCharm(null);
          openApp("profile");
          window.setTimeout(() => window.print(), 900);
        }}
      >
        <span className="pane-row-icon" style={{ background: app("profile").color }}>
          <Icon name="print" size={22} />
        </span>
        {t("devices.print")}
      </button>
    </Pane>
  );
}

function SettingsPane() {
  const os = useOS();
  const { t, lang, setPref, sfx, motion, setCharm, power, view, openApp } = os;
  const [powerMenu, setPowerMenu] = useState(false);
  const context = view.kind === "app" ? t(app(view.app).title) : t("start");
  return (
    <Pane title={t("settings.title")} className="pane-settings">
      <p className="pane-sub">{context}</p>
      <div className="pane-links">
        <button onClick={() => setCharm("personalize")}>{t("settings.personalize")}</button>
        <button onClick={() => openApp("settings", "personalize")}>{t("settings.tiles")}</button>
        <button onClick={() => openApp("settings", "pcinfo")}>{t("settings.help")}</button>
      </div>
      <div className="pane-quick">
        <div className="quick-grid">
          <button className="quick on" onClick={() => {}}>
            <Icon name="wifi" size={26} />
            <span>{lang === "tr" ? "Bağlı" : "Connected"}</span>
          </button>
          <button className={`quick ${sfx ? "on" : ""}`} onClick={() => setPref("sfx", !sfx)}>
            <Icon name={sfx ? "volume" : "mute"} size={26} />
            <span>{t("settings.sound")}</span>
          </button>
          <button
            className={`quick ${motion === "full" ? "on" : ""}`}
            onClick={() => setPref("motion", motion === "full" ? "reduced" : "full")}
          >
            <Icon name="motion" size={26} />
            <span>{t("settings.motion")}</span>
          </button>
          <button className="quick on" onClick={() => setCharm("personalize")}>
            <Icon name="brush" size={26} />
            <span>{t("settings.personalize")}</span>
          </button>
          <div className="quick-wrap">
            <button className="quick on" onClick={() => setPowerMenu((m) => !m)}>
              <Icon name="power" size={26} />
              <span>{t("settings.power")}</span>
            </button>
            {powerMenu && (
              <div className="flyout flyout-up">
                <button onClick={() => power("sleep")}>{t("power.sleep")}</button>
                <button onClick={() => power("shutdown")}>{t("power.off")}</button>
                <button onClick={() => power("restart")}>{t("power.restart")}</button>
                <button onClick={() => power("signout")}>{t("power.signout")}</button>
              </div>
            )}
          </div>
          <button className="quick on" onClick={() => setPref("lang", lang === "tr" ? "en" : "tr")}>
            <span className="quick-lang">{lang === "tr" ? "TUR" : "ENG"}</span>
            <span>{t("settings.language")}</span>
          </button>
        </div>
        <button className="pane-pc" onClick={() => openApp("settings")}>
          {t("settings.pcSettings")}
        </button>
      </div>
    </Pane>
  );
}

function PersonalizePane() {
  const { t, setPref, color, pattern, setCharm } = useOS();
  return (
    <Pane title={t("settings.personalize")} className="pane-settings" onBack={() => setCharm("settings")}>
      <h3>{t("settings.background")}</h3>
      <div className="pat-grid">
        {PATTERNS.map((p) => (
          <button
            key={p}
            className={`pat-thumb pat-${p} ${pattern === p ? "on" : ""}`}
            onClick={() => setPref("pattern", p)}
            aria-label={p}
          >
            <PatternThumb kind={p} />
          </button>
        ))}
      </div>
      <h3>{t("settings.bgColor")}</h3>
      <div className="swatches">
        {COLORS.map((c, i) => (
          <button
            key={i}
            className={`swatch ${color === i ? "on" : ""}`}
            style={{ background: c.bg }}
            onClick={() => setPref("color", i)}
            aria-label={`${i + 1}`}
          >
            <i style={{ background: c.accent }} />
          </button>
        ))}
      </div>
      <h3>{t("settings.accent")}</h3>
      <div className="swatches">
        {COLORS.map((c, i) => (
          <button
            key={i}
            className={`swatch ${color === i ? "on" : ""}`}
            style={{ background: c.accent }}
            onClick={() => setPref("color", i)}
            aria-label={`${i + 1}`}
          />
        ))}
      </div>
    </Pane>
  );
}

function PatternThumb({ kind }: { kind: (typeof PATTERNS)[number] }) {
  return (
    <svg viewBox="0 0 80 50" preserveAspectRatio="none">
      <rect width="80" height="50" fill="var(--start-bg)" />
      {kind === "waves" &&
        [0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M0 ${18 + i * 5} Q20 ${8 + i * 5} 40 ${18 + i * 5} T80 ${18 + i * 5}`}
            fill="none"
            stroke="#fff"
            strokeOpacity="0.3"
          />
        ))}
      {kind === "geo" &&
        [0, 1, 2].map((i) => (
          <polygon
            key={i}
            points={`${10 + i * 25},8 ${30 + i * 25},20 ${10 + i * 25},38`}
            fill="#fff"
            fillOpacity="0.15"
          />
        ))}
      {kind === "circuit" &&
        [0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M${6 + i * 24} ${12 + i * 9} h18 l6 6 v10`}
            fill="none"
            stroke="#fff"
            strokeOpacity="0.35"
          />
        ))}
      {kind === "bubbles" &&
        [0, 1, 2, 3, 4].map((i) => (
          <circle key={i} cx={10 + i * 16} cy={14 + (i % 2) * 18} r={4 + (i % 3) * 4} fill="#fff" fillOpacity="0.15" />
        ))}
      {kind === "desktop" && (
        <>
          <rect width="80" height="50" fill="#1e4fa8" />
          <path d="M0 38 Q20 30 40 36 T80 32 V50 H0Z" fill="#0b1a3a" />
          <rect x="0" y="45" width="80" height="5" fill="#000" fillOpacity="0.5" />
        </>
      )}
    </svg>
  );
}

export function Toasts() {
  const { toasts, dismissToast, open, t } = useOS();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <button
          key={x.id}
          className="toast"
          style={{ background: x.color }}
          onClick={() => {
            dismissToast(x.id);
            if (x.action) open(x.action);
          }}
        >
          <span className="toast-icon">
            <Icon name={x.icon} size={28} />
          </span>
          <span className="toast-text">
            <strong>{x.title}</strong>
            <span>{x.body}</span>
          </span>
          <span
            className="toast-close"
            role="button"
            aria-label={t("mail.cancel")}
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(x.id);
            }}
          >
            <Icon name="close" size={12} />
          </span>
        </button>
      ))}
    </div>
  );
}

export const achievementTotal = VISITOR_ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);
