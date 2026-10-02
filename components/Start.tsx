"use client";
/** The Start screen: groups of live tiles on a horizontal strip, semantic zoom, tile app bar and the Apps view entry. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useOS, type View } from "@/lib/os";
import { GROUPS, SPAN, defaultTiles, moveTile, sizesFor, type GroupId, type TileSize, type TileState } from "@/lib/model";
import { sound } from "@/lib/sound";
import { profile } from "@/content/portfolio";
import { Icon } from "./Icons";
import { Avatar, Pattern } from "./Lock";
import { TileFace, useTileMeta, type TileMeta } from "./Tiles";

/** Move focus to the nearest focusable element in a direction (keyboard / arrow navigation). */
export function spatialMove(root: HTMLElement | null, dir: "up" | "down" | "left" | "right", selector = "[data-nav]") {
  if (!root) return false;
  const items = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => el.offsetParent !== null);
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !items.includes(cur)) {
    items[0]?.focus();
    return true;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const ok = dir === "right" ? b.left >= a.right - 4 : dir === "left" ? b.right <= a.left + 4 : dir === "down" ? b.top >= a.bottom - 4 : b.bottom <= a.top + 4;
    if (!ok) continue;
    const main = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy);
    const cross = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = main + cross * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    best.focus();
    best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return true;
  }
  return false;
}

type TileProps = {
  tile: TileState;
  index: number;
  selected: boolean;
  onSelect: (key: string) => void;
  onOpen: (meta: TileMeta) => void;
  selecting: boolean;
  /** Start only: pick the tile up to move it (mouse drag, or a vertical "cross-slide" on touch). */
  onDragStart?: (key: string, e: React.PointerEvent<HTMLButtonElement>) => void;
  dragging?: boolean;
};

export function Tile({ tile, index, selected, onSelect, onOpen, selecting, onDragStart, dragging }: TileProps) {
  const meta = useTileMeta()(tile.key);
  const [w, h] = SPAN[tile.size];
  const press = useRef<{ timer: number; long: boolean; x: number; y: number } | null>(null);
  const [tilt, setTilt] = useState<{ rx: number; ry: number } | null>(null);

  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = press.current;
    if (!st || st.long || !onDragStart || !e.buttons) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    const pick = e.pointerType === "touch" ? Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) : Math.hypot(dx, dy) > 6;
    if (!pick) return;
    window.clearTimeout(st.timer);
    st.long = true; // swallow the click that follows the drop
    setTilt(null);
    onDragStart(tile.key, e);
  };

  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button === 2) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    // Pressing a tile tips it toward the finger, like the real thing.
    setTilt({ rx: -py * 14, ry: px * 14 });
    const st = { timer: 0, long: false, x: e.clientX, y: e.clientY };
    st.timer = window.setTimeout(() => {
      st.long = true;
      setTilt(null);
      onSelect(tile.key);
      navigator.vibrate?.(15);
    }, 560);
    press.current = st;
  };
  const up = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    setTilt(null);
  };

  return (
    <button
      className={`tile size-${tile.size} ${selected ? "selected" : ""} ${tilt ? "pressed" : ""} ${dragging ? "dragging" : ""}`}
      style={
        {
          gridColumn: `span ${w}`,
          gridRow: `span ${h}`,
          "--c": meta.color,
          "--d": `${Math.min(index, 30) * 28}ms`,
          "--rx": `${tilt?.rx ?? 0}deg`,
          "--ry": `${tilt?.ry ?? 0}deg`,
        } as React.CSSProperties
      }
      data-nav
      data-key={tile.key}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(tile.key);
      }}
      onClick={() => {
        if (press.current?.long) {
          press.current = null;
          return;
        }
        if (selecting) onSelect(tile.key);
        else onOpen(meta);
      }}
      aria-label={meta.title}
    >
      <div className="tile-body">
        <TileFace tileKey={tile.key} size={tile.size} live={tile.live} />
      </div>
      {tile.size !== "small" && <span className="tile-label">{meta.title}</span>}
      {selected && (
        <span className="tile-check">
          <Icon name="check" size={14} strokeWidth={2.4} />
        </span>
      )}
    </button>
  );
}

/** Launch something from a tile: links open in a tab, apps get the launch animation. */
export function useLauncher(onLaunchStart?: () => void) {
  const { open, toast, t } = useOS();
  return useCallback(
    (meta: TileMeta) => {
      if (meta.url !== undefined) {
        if (!meta.url || meta.url === "#") {
          sound.error();
          toast({ title: t("placeholderLink"), body: meta.title, color: meta.color, icon: meta.icon });
          return;
        }
        sound.tap();
        if (meta.url.startsWith("mailto:")) window.location.href = meta.url;
        else window.open(meta.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (!meta.view) return;
      sound.open();
      onLaunchStart?.();
      const v: View = meta.view;
      window.setTimeout(() => open(v), 230);
    },
    [open, toast, t, onLaunchStart],
  );
}

export function StartScreen({ hidden }: { hidden: boolean }) {
  const os = useOS();
  const { t, tiles, setTiles, setCharm, user, power, earn, open, groupNames, setPref } = os;
  const [naming, setNaming] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const [scrollX, setScrollX] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [bar, setBar] = useState(false);
  const [sizeMenu, setSizeMenu] = useState(false);
  const [powerMenu, setPowerMenu] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [zoomScale, setZoomScale] = useState(0.3);
  const [launching, setLaunching] = useState(false);
  const [entering, setEntering] = useState(true);
  const [grid, setGrid] = useState({ u: 70, g: 8, rows: 8 });
  const [drag, setDrag] = useState<{ key: string; ox: number; oy: number; w: number; h: number; x: number; y: number } | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const tileMeta = useTileMeta();

  // Size the tile unit from the window height, like Windows picks the number of rows.
  useLayoutEffect(() => {
    const fit = () => {
      const h = window.innerHeight;
      const avail = h - (h < 640 ? 112 : 150) - 64;
      const rows = avail >= 8 * 58 + 7 * 8 ? 8 : 6;
      const g = Math.max(5, Math.round(avail / rows / 11));
      const u = Math.max(40, Math.min(92, Math.floor((avail - (rows - 1) * g) / rows)));
      setGrid({ u, g, rows });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Replay the fly-in every time Start comes back.
  useEffect(() => {
    if (hidden) {
      savedScroll.current = scroller.current?.scrollLeft ?? 0;
      setLaunching(false);
      return;
    }
    if (scroller.current) scroller.current.scrollLeft = savedScroll.current;
    setEntering(false);
    const raf = requestAnimationFrame(() => setEntering(true));
    const id = window.setTimeout(() => setEntering(false), 1400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(id);
    };
  }, [hidden]);

  // Vertical wheel scrolls the strip sideways; Ctrl + wheel zooms out.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY > 0 && !zoomed) zoomOut();
        if (e.deltaY < 0 && zoomed) setZoomed(false);
        return;
      }
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY * 1.2;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // Arrow keys move between tiles.
  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (os.charm) return;
      const dir = ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" } as const)[e.key as "ArrowUp"];
      if (dir) {
        e.preventDefault();
        spatialMove(strip.current, dir);
      }
      if (e.key === "Escape" && (selected.length || zoomed)) {
        setSelected([]);
        setBar(false);
        setZoomed(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, os.charm, selected.length, zoomed]);

  // A picked-up tile: the ghost follows the pointer (moved through its ref, not state), and the others make room as it passes.
  const dragKey = drag?.key;
  useEffect(() => {
    if (!dragKey) return;
    let last: string | null = null;
    let lastAt = 0;
    const move = (e: PointerEvent) => {
      const g = ghost.current;
      if (g) g.style.translate = `${e.clientX - Number(g.dataset.ox)}px ${e.clientY - Number(g.dataset.oy)}px`;
      const sc = scroller.current;
      if (sc && e.clientX > window.innerWidth - 70) sc.scrollLeft += 16;
      if (sc && e.clientX < 70) sc.scrollLeft -= 16;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const over = el?.closest<HTMLElement>("[data-key]")?.dataset.key;
      const group = el?.closest<HTMLElement>("[data-group]")?.dataset.group as GroupId | undefined;
      if (over === dragKey) {
        last = null;
        return;
      }
      const id = over ?? (group ? `group:${group}` : null);
      // ponytail: a 160ms debounce stops mismatched tile sizes from swapping back and forth under the pointer.
      if (!id || id === last || performance.now() - lastAt < 160) return;
      last = id;
      lastAt = performance.now();
      setTiles((all) => moveTile(all, dragKey, over ? { key: over } : { group: group! }));
    };
    const up = () => {
      setDrag(null);
      sound.tap();
      earn("architect");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragKey, setTiles, earn]);

  const beginDrag = (key: string, e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setSelected([]);
    setBar(false);
    setDrag({ key, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height, x: e.clientX, y: e.clientY });
  };
  const dragTile = drag && tiles.find((x) => x.key === drag.key);

  const zoomOut = () => {
    const el = strip.current;
    const sc = scroller.current;
    if (!el || !sc) return;
    const s = Math.min(0.42, (sc.clientWidth - 160) / el.scrollWidth);
    setZoomScale(Math.max(0.12, s));
    setZoomed(true);
    setSelected([]);
    setBar(false);
    earn("zoom");
  };

  const zoomInto = (group: string) => {
    setZoomed(false);
    requestAnimationFrame(() => {
      const g = strip.current?.querySelector<HTMLElement>(`[data-group="${group}"]`);
      if (g && scroller.current) scroller.current.scrollTo({ left: g.offsetLeft - 40, behavior: "smooth" });
    });
  };

  const launch = useLauncher(() => setLaunching(true));

  const toggleSelect = (key: string) => {
    sound.tap();
    setSelected((s) => {
      const next = s.includes(key) ? s.filter((k) => k !== key) : [...s, key];
      setBar(next.length > 0);
      return next;
    });
    setSizeMenu(false);
  };

  const sel = tiles.filter((x) => selected.includes(x.key));
  const one = sel.length === 1 ? sel[0] : null;
  const update = (fn: (t: TileState) => TileState) => setTiles((all) => all.map((x) => (selected.includes(x.key) ? fn(x) : x)));

  let idx = 0;
  const style = { "--tu": `${grid.u}px`, "--tg": `${grid.g}px`, "--rows": grid.rows } as React.CSSProperties;
  const userName = user === "owner" ? profile.name : user === "guest" ? t("login.guest") : t("login.recruiter");

  return (
    <div
      className={`start ${entering ? "entering" : ""} ${launching ? "launching" : ""} ${zoomed ? "zoomed" : ""} ${drag || naming ? "customizing" : ""}`}
      hidden={hidden}
      style={style}
      onContextMenu={(e) => {
        e.preventDefault();
        setBar((b) => !b);
      }}
      onClick={(e) => {
        setPowerMenu(false);
        if (naming && !(e.target as HTMLElement).closest("input")) setNaming(false);
      }}
    >
      <Pattern offset={scrollX} />
      <header className="start-head">
        <h1>{t("start")}</h1>
        <div className="start-user" onClick={(e) => e.stopPropagation()}>
          <span className="start-user-name">
            <strong>{userName}</strong>
          </span>
          <Avatar user={user} size={40} />
          <button className="icon-btn" onClick={() => setPowerMenu((m) => !m)} aria-label={t("settings.power")} title={t("settings.power")}>
            <Icon name="power" size={20} />
          </button>
          <button className="icon-btn" onClick={() => setCharm("search")} aria-label={t("charm.search")} title={t("charm.search")}>
            <Icon name="search" size={20} />
          </button>
          {powerMenu && (
            <div className="flyout flyout-power">
              <button onClick={() => power("signout")}>{t("power.signout")}</button>
              <button onClick={() => power("sleep")}>{t("power.lock")}</button>
              <button onClick={() => power("shutdown")}>{t("power.off")}</button>
              <button onClick={() => power("restart")}>{t("power.restart")}</button>
            </div>
          )}
        </div>
      </header>

      <div className="start-scroll" ref={scroller} onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}>
        <div className="start-strip" ref={strip} style={zoomed ? { transform: `scale(${zoomScale})` } : undefined}>
          {GROUPS.map((g) => {
            const list = tiles.filter((x) => x.pinned && x.group === g.id);
            if (!list.length) return null;
            return (
              <section
                key={g.id}
                className="group"
                data-group={g.id}
                onClick={
                  zoomed
                    ? (e) => {
                        e.stopPropagation();
                        zoomInto(g.id);
                      }
                    : undefined
                }
              >
                {naming ? (
                  <input
                    className="group-name-input"
                    defaultValue={groupNames[g.id] ?? t(g.title)}
                    placeholder={t("group.name")}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                    onBlur={(e) => setPref("groupNames", { ...groupNames, [g.id]: e.currentTarget.value.trim() })}
                  />
                ) : (
                  <h2 className="group-title">{groupNames[g.id] ?? t(g.title)}</h2>
                )}
                <div className="group-grid">
                  {list.map((tile) => (
                    <Tile
                      key={tile.key}
                      tile={tile}
                      index={idx++}
                      selected={selected.includes(tile.key)}
                      selecting={selected.length > 0}
                      onSelect={toggleSelect}
                      onOpen={launch}
                      onDragStart={zoomed ? undefined : beginDrag}
                      dragging={drag?.key === tile.key}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {drag && dragTile && (
        <div
          ref={ghost}
          className={`tile tile-ghost size-${dragTile.size}`}
          data-ox={drag.ox}
          data-oy={drag.oy}
          style={{ width: drag.w, height: drag.h, translate: `${drag.x - drag.ox}px ${drag.y - drag.oy}px`, "--c": tileMeta(drag.key).color } as React.CSSProperties}
        >
          <div className="tile-body">
            <TileFace tileKey={drag.key} size={dragTile.size} live={false} />
          </div>
          {dragTile.size !== "small" && <span className="tile-label">{tileMeta(drag.key).title}</span>}
        </div>
      )}

      <button className="start-allapps" onClick={() => open({ kind: "apps" })} aria-label={t("allApps")} title={t("allApps")}>
        <Icon name="down" size={20} />
      </button>
      <button className="start-zoom" onClick={() => (zoomed ? setZoomed(false) : zoomOut())} aria-label={t("zoom.out")} title={t("zoom.out")}>
        <Icon name={zoomed ? "plus" : "minus"} size={18} />
      </button>

      <div className={`appbar ${bar ? "open" : ""}`} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        {sel.length > 0 ? (
          <>
            <div className="appbar-left">
              <button onClick={() => { setSelected([]); setBar(false); }}>
                <Icon name="close" size={20} />
                <span>{t("tile.clear")}</span>
              </button>
            </div>
            <div className="appbar-right">
              <button
                onClick={() => {
                  update((x) => ({ ...x, pinned: false }));
                  setSelected([]);
                  setBar(false);
                  earn("architect");
                }}
              >
                <Icon name="unpin" size={20} />
                <span>{t("tile.unpin")}</span>
              </button>
              {one && (
                <div className="appbar-menu">
                  <button onClick={() => setSizeMenu((m) => !m)}>
                    <Icon name="resize" size={20} />
                    <span>{t("tile.resize")}</span>
                  </button>
                  {sizeMenu && (
                    <div className="flyout flyout-up">
                      {sizesFor(one.key).map((s: TileSize) => (
                        <button
                          key={s}
                          className={one.size === s ? "on" : ""}
                          onClick={() => {
                            update((x) => ({ ...x, size: s }));
                            setSizeMenu(false);
                            earn("architect");
                          }}
                        >
                          {one.size === s && <Icon name="check" size={14} />} {t(`size.${s}`)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={() => update((x) => ({ ...x, live: !(one ?? sel[0]).live }))}>
                <Icon name="refresh" size={20} />
                <span>{(one ?? sel[0]).live ? t("tile.liveOff") : t("tile.liveOn")}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="appbar-left">
              <button onClick={() => open({ kind: "apps" })}>
                <Icon name="start" size={20} />
                <span>{t("allApps")}</span>
              </button>
            </div>
            <div className="appbar-right">
              <button
                onClick={() => {
                  setTiles(() => defaultTiles());
                  setBar(false);
                }}
              >
                <Icon name="refresh" size={20} />
                <span>{t("tile.reset")}</span>
              </button>
              <button
                onClick={() => {
                  setNaming((n) => !n);
                  setBar(false);
                }}
              >
                <Icon name="edit" size={20} />
                <span>{t(naming ? "group.done" : "group.customize")}</span>
              </button>
              <button onClick={() => { setBar(false); setCharm("personalize"); }}>
                <Icon name="brush" size={20} />
                <span>{t("settings.personalize")}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
