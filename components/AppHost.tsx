"use client";
/** App frame: splash screen, page header with the round back button, the Hub (tablet) / Pivot (phone) layout, and the Apps view. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useOS, type View } from "@/lib/os";
import { APPS, GROUPS, app, parseKey, type AppId } from "@/lib/model";
import { sound } from "@/lib/sound";
import { projects, socials } from "@/content/portfolio";
import { Icon } from "./Icons";
import { Pattern } from "./Lock";
import { useLauncher } from "./Start";
import { useTileMeta } from "./Tiles";
import { ProjectsApp } from "./apps/Projects";
import { ProfileApp } from "./apps/Profile";
import { MailApp } from "./apps/Mail";
import { ReaderApp } from "./apps/Reader";
import { PhotosApp } from "./apps/Photos";
import { MusicApp } from "./apps/Music";
import { AchievementsApp } from "./apps/Achievements";
import { CalendarApp } from "./apps/Calendar";
import { SettingsApp } from "./apps/Settings";
import { WeatherApp } from "./metro/Weather";
import { NewsApp } from "./metro/News";
import { SportsApp } from "./metro/Sports";
import { FinanceApp } from "./metro/Finance";
import { TravelApp } from "./metro/Travel";
import { MapsApp } from "./metro/Maps";
import { CameraApp } from "./metro/Camera";
import { AlarmsApp } from "./metro/Alarms";
import { SoundRecorderApp } from "./metro/SoundRecorder";
import { VideoApp } from "./metro/Video";
import { SkyDriveApp } from "./metro/SkyDrive";
import { AppIcon } from "./icons/AppIcon";

/** Metro (Windows Store) apps. Desktop programs open in windows instead (components/desktop). */
const APP_COMPONENTS: Partial<Record<AppId, (p: { param?: string }) => ReactNode>> = {
  projects: ProjectsApp,
  profile: ProfileApp,
  mail: MailApp,
  reader: ReaderApp,
  photos: PhotosApp,
  music: MusicApp,
  achievements: AchievementsApp,
  calendar: CalendarApp,
  settings: SettingsApp,
  weather: WeatherApp,
  news: NewsApp,
  sports: SportsApp,
  finance: FinanceApp,
  travel: TravelApp,
  maps: MapsApp,
  camera: CameraApp,
  alarms: AlarmsApp,
  soundrec: SoundRecorderApp,
  video: VideoApp,
  skydrive: SkyDriveApp,
};

export function AppHost({ view }: { view: Extract<View, { kind: "app" }> }) {
  const { phone } = useOS();
  const a = app(view.app);
  const [splash, setSplash] = useState(view.app !== "desktop");
  // Dragging the app down from the top edge: it shrinks into a card that follows the pointer; drop it low to close.
  const [pull, setPull] = useState<{ dx: number; dy: number; closing?: boolean } | null>(null);
  useEffect(() => {
    if (!splash) return;
    const id = window.setTimeout(() => setSplash(false), 950);
    return () => window.clearTimeout(id);
  }, [splash]);
  const Comp = APP_COMPONENTS[view.app] ?? (() => null);
  const s = pull ? Math.max(0.28, 1 - pull.dy / 260) : 1;
  return (
    <div
      className={`app app-${view.app} ${pull ? "pulled" : ""} ${pull?.closing ? "closing" : ""}`}
      style={{ "--app": a.color, transform: pull ? `translate(${pull.dx}px, ${pull.dy}px) scale(${s})` : undefined } as React.CSSProperties}
    >
      {splash ? (
        <div className="splash" style={{ background: a.color }}>
          <AppIcon id={a.id} size={120} strokeWidth={1.1} />
        </div>
      ) : (
        <div className="app-body" key={view.param ?? "root"}>
          <Comp param={view.param} />
        </div>
      )}
      {!phone && view.app !== "desktop" && <TitleBar id={view.app} onPull={setPull} />}
    </div>
  );
}

/** Win8.1 Update title bar: hover the top edge to reveal minimize / close; grab the edge and drag down to close. */
function TitleBar({ id, onPull }: { id: AppId; onPull: (p: { dx: number; dy: number; closing?: boolean } | null) => void }) {
  const { t, open, closeApp } = useOS();
  const a = app(id);
  const [show, setShow] = useState(false);
  const hide = useRef(0);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const close = () => {
    sound.back();
    onPull({ dx: 0, dy: window.innerHeight, closing: true });
    window.setTimeout(() => closeApp(id), 260);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = Math.max(0, e.clientY - d.y);
    if (!d.moved && dy < 8) return;
    d.moved = true;
    setShow(false);
    onPull({ dx: e.clientX - d.x, dy });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    if (e.clientY > window.innerHeight * 0.6) close();
    else onPull(null);
  };

  return (
    <div
      className={`titlebar ${show ? "show" : ""}`}
      onMouseEnter={() => {
        window.clearTimeout(hide.current);
        setShow(true);
      }}
      onMouseLeave={() => {
        hide.current = window.setTimeout(() => setShow(false), 500);
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        drag.current = null;
        onPull(null);
      }}
    >
      <div className="titlebar-bar">
        <span className="titlebar-icon" style={{ background: a.color }}>
          <AppIcon id={a.id} size={14} />
        </span>
        <span className="titlebar-name">{t(a.title)}</span>
        <button onClick={() => open({ kind: "start" })} aria-label={t("win.minimize")} title={t("win.minimize")}>
          <Icon name="minus" size={14} />
        </button>
        <button className="titlebar-close" onClick={close} aria-label={t("win.close")} title={t("win.close")}>
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}

export function BackButton() {
  const { back, t } = useOS();
  return (
    <button className="circle-btn back-btn" onClick={back} aria-label={t("back")} title={t("back")} data-nav>
      <Icon name="back" size={20} />
    </button>
  );
}

export type Section = { id: string; title: string; content: ReactNode; wide?: boolean; onTitle?: () => void };

/**
 * Win8 Hub: a page title with a back button, an optional hero, then sections laid out side by side on a horizontal strip.
 * On the phone the same sections become a Pivot: swipeable headers, one section per screen.
 */
export function Hub({ title, appTitle, hero, sections, className }: { title: string; appTitle?: string; hero?: ReactNode; sections: Section[]; className?: string }) {
  const { phone } = useOS();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phone) return;
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Let inner vertical scrollers have the wheel when they can scroll.
      let n = e.target as HTMLElement | null;
      while (n && n !== el) {
        if (n.scrollHeight > n.clientHeight + 2 && getComputedStyle(n).overflowY !== "visible" && getComputedStyle(n).overflowY !== "hidden") return;
        n = n.parentElement;
      }
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY * 1.2;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [phone]);

  if (phone) return <Pivot title={appTitle ?? title} sections={hero ? [{ id: "_hero", title, content: hero }, ...sections] : sections} />;

  return (
    <div className={`hub ${className ?? ""}`}>
      <div className="hub-scroll" ref={scroller}>
        <div className="hub-strip">
          {/* The title belongs to the hub and scrolls away with it, like Win8.1 hubs. */}
          <header className="page-head">
            <BackButton />
            <h1>{title}</h1>
          </header>
          {hero && <div className="hub-hero">{hero}</div>}
          {sections.map((s, i) => (
            <section key={s.id} className={`hub-section ${s.wide ? "wide" : ""}`} style={{ "--i": i } as React.CSSProperties}>
              <h2 className={s.onTitle ? "link" : ""} onClick={s.onTitle}>
                {s.title}
                {s.onTitle && <Icon name="forward" size={18} />}
              </h2>
              <div className="hub-content">{s.content}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pivot({ title, sections }: { title: string; sections: Section[] }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const head = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const go = (n: number) => {
    const next = (n + sections.length) % sections.length;
    setDir(n > i ? 1 : -1);
    setI(next);
    sound.tap();
  };
  useEffect(() => {
    head.current?.querySelector<HTMLElement>(".on")?.scrollIntoView({ inline: "start", behavior: "smooth", block: "nearest" });
  }, [i]);
  const s = sections[i];
  return (
    <div
      className="pivot"
      onTouchStart={(e) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const st = start.current;
        start.current = null;
        if (!st) return;
        const dx = e.changedTouches[0].clientX - st.x;
        const dy = e.changedTouches[0].clientY - st.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) go(i + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="pivot-app">{title.toLocaleUpperCase()}</div>
      <div className="pivot-heads" ref={head}>
        {sections.map((x, k) => (
          <button key={x.id} className={k === i ? "on" : ""} onClick={() => go(k)}>
            {x.title.toLocaleLowerCase()}
          </button>
        ))}
      </div>
      <div className={`pivot-body ${dir > 0 ? "from-right" : "from-left"}`} key={s.id}>
        {s.content}
      </div>
    </div>
  );
}

/** Win8.1 Apps view: everything installed, by category, with pin / unpin on right click. */
export function AppsView() {
  const { t, open, tiles, setTiles, lang, phone } = useOS();
  const meta = useTileMeta();
  const launch = useLauncher();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [sort, setSort] = useState<"name" | "category">("name");

  const visibleApps = APPS.filter((a) => !a.hidden && !(phone && a.phone === false));
  const byCat = (c: string) => visibleApps.filter((a) => a.cat === c).map((a) => `app:${a.id}`);
  const cats: { title: string; keys: string[] }[] = [
    { title: t("apps"), keys: byCat("apps") },
    { title: t("cat.games"), keys: byCat("games") },
    { title: t("cat.accessories"), keys: byCat("accessories") },
    { title: t("cat.system"), keys: byCat("system") },
    { title: t("group.projects"), keys: projects.map((p) => `project:${p.id}`) },
    { title: t("group.links"), keys: socials.map((s) => `social:${s.id}`) },
  ].filter((c) => c.keys.length);
  const ql = q.trim().toLocaleLowerCase(lang);
  // Windows 8.1 "by name" groups everything under letter headers; "by category" keeps the three kinds apart.
  const groups =
    sort === "category"
      ? cats
      : cats
          .flatMap((c) => c.keys)
          .map((k) => ({ k, title: meta(k).title }))
          .sort((a, b) => a.title.localeCompare(b.title, lang))
          .reduce<{ title: string; keys: string[] }[]>((acc, { k, title }) => {
            const letter = /^[\p{L}]/u.test(title) ? title[0].toLocaleUpperCase(lang) : "#";
            const last = acc[acc.length - 1];
            if (last?.title === letter) last.keys.push(k);
            else acc.push({ title: letter, keys: [k] });
            return acc;
          }, []);

  const togglePin = (key: string) => {
    setTiles((all) => {
      const found = all.find((x) => x.key === key);
      if (found) return all.map((x) => (x.key === key ? { ...x, pinned: !x.pinned } : x));
      const ref = parseKey(key);
      const group = ref.kind === "project" ? "projects" : ref.kind === "social" ? "links" : GROUPS[0].id;
      return [...all, { key, size: "medium", live: true, pinned: true, group }];
    });
    setMenu(null);
  };

  return (
    <div className="appsview" onClick={() => setMenu(null)}>
      <Pattern />
      <header className="appsview-head">
        <h1>
          {t("apps")}{" "}
          <button
            className="appsview-sort"
            onClick={(e) => {
              e.stopPropagation();
              setMenu(menu === "sort" ? null : "sort");
            }}
          >
            {t(sort === "name" ? "apps.byName" : "apps.byCategory")} ▾
          </button>
          {menu === "sort" && (
            <div className="flyout appsview-sort-menu" onClick={(e) => e.stopPropagation()}>
              {(["name", "category"] as const).map((s) => (
                <button
                  key={s}
                  className={sort === s ? "on" : undefined}
                  onClick={() => {
                    setSort(s);
                    setMenu(null);
                  }}
                >
                  {t(s === "name" ? "apps.byName" : "apps.byCategory")}
                </button>
              ))}
            </div>
          )}
        </h1>
        <input className="appsview-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("apps.search")} aria-label={t("apps.search")} />
      </header>
      <div className="appsview-scroll">
        {(() => {
          const item = (k: string) => {
            const m = meta(k);
            const pinned = tiles.find((x) => x.key === k)?.pinned;
            return (
              <div key={k} className="appsview-item-wrap">
                <button
                  className="appsview-item"
                  onClick={() => launch(m)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu(k);
                  }}
                  data-nav
                >
                  <span className="appsview-icon" style={{ background: m.color }}>
                    {m.app ? <AppIcon id={m.app} size={22} /> : <Icon name={m.icon} size={22} />}
                  </span>
                  <span>{m.title}</span>
                </button>
                {menu === k && (
                  <div className="flyout" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => togglePin(k)}>
                      <Icon name={pinned ? "unpin" : "pin"} size={16} /> {pinned ? t("tile.unpin") : t("tile.pin")}
                    </button>
                  </div>
                )}
              </div>
            );
          };
          const visible = groups
            .map((c) => ({ ...c, keys: c.keys.filter((k) => !ql || meta(k).title.toLocaleLowerCase(lang).includes(ql)) }))
            .filter((c) => c.keys.length);
          // By name: one grid that flows top to bottom, with each letter header taking a cell, like 8.1.
          if (sort === "name")
            return (
              <section className="appsview-cat letter">
                <div className="appsview-cols">
                  {visible.flatMap((c) => [
                    // The header travels with its first app so a letter never sits alone at a column's foot.
                    <div key={`h-${c.title}`} className="appsview-keep">
                      <h2 className="appsview-letter">{c.title}</h2>
                      {item(c.keys[0])}
                    </div>,
                    ...c.keys.slice(1).map(item),
                  ])}
                </div>
              </section>
            );
          return visible.map((c) => (
            <section key={c.title} className="appsview-cat">
              <h2>{c.title}</h2>
              <div className="appsview-grid">{c.keys.map(item)}</div>
            </section>
          ));
        })()}
      </div>
      <button className="start-allapps up" onClick={() => open({ kind: "start" })} aria-label={t("start")} title={t("start")}>
        <Icon name="up" size={20} />
      </button>
    </div>
  );
}
