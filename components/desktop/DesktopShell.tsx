"use client";
/**
 * The desktop: wallpaper, desktop icons (backed by the Desktop folder), real windows and the taskbar.
 * It stays mounted once visited, so windows keep their state while you're on Start.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOS } from "@/lib/os";
import { fs, useFS, join, basename, KNOWN, RECYCLE, type ArtSpec, type FNode } from "@/lib/fs";
import { wm, useWM, TASKBAR_H } from "@/lib/wm";
import { sound } from "@/lib/sound";
import type { ShellIconName } from "@/lib/model";
import { CoverArt } from "../CoverArt";
import { ShellIcon } from "../icons/ShellIcons";
import { PowerUserMenu } from "../Charms";
import { Window } from "./Window";
import { Taskbar } from "./Taskbar";
import { PROGRAMS } from "./registry";
import { ContextMenu, type MenuItem } from "./ui";
import { DND_TYPE, nodeIcon, readDrag, shellClipboard, useOpenPath } from "./shell";
import { confirmDelete, itemMenu, newMenu } from "./fileMenu";
import { showProperties } from "./Properties";
import "./desktop.css";

const DEFAULT_ART: ArtSpec = { seed: "wallpaper", motif: "dunes", palette: ["#0b1a3a", "#1e4fa8", "#7dd3fc"] };

/** The desktop background for a wallpaper setting: a solid color, a saved picture or generated art. */
export function Wallpaper({ value, className, animated }: { value: string; className?: string; animated?: boolean }) {
  useFS();
  if (value.startsWith("color:")) return <div className={className} style={{ background: value.slice(6) }} />;
  const n = fs.get(value);
  if (n?.data)
    return (
      <div className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={n.data} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  const art = n?.art ?? DEFAULT_ART;
  return <CoverArt className={className} seed={art.seed} motif={art.motif} palette={art.palette} variant={art.variant} animated={animated} />;
}

type Item = { key: string; path: string | null; label: string; icon: ShellIconName; node?: FNode; shortcut?: boolean };
type Pos = Record<string, { c: number; r: number }>;
const POS_KEY = "afu-metro:v2:desk-pos";
const VIEW_KEY = "afu-metro:v2:desk-view";

function loadJSON<T>(k: string, f: T): T {
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : f;
  } catch {
    return f;
  }
}

export function DesktopShell({ active }: { active: boolean }) {
  const os = useOS();
  const { t, lang, open, wallpaper, winColor, showDesktopIcons, setPref } = os;
  useFS();
  const { wins, order, focus } = useWM();
  const openPath = useOpenPath();
  const [sel, setSel] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [winx, setWinx] = useState(false);
  const [network, setNetwork] = useState(false);
  const [pos, setPos] = useState<Pos>({});
  const [iconSize, setIconSize] = useState<32 | 48 | 96>(48);
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [vh, setVh] = useState(800);
  const layer = useRef<HTMLDivElement>(null);
  const tr = lang === "tr";

  useEffect(() => {
    setPos(loadJSON(POS_KEY, {}));
    setIconSize(loadJSON(VIEW_KEY, 48));
    const r = () => setVh(window.innerHeight);
    r();
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
      window.localStorage.setItem(VIEW_KEY, JSON.stringify(iconSize));
    } catch {
      /* not remembered */
    }
  }, [pos, iconSize]);

  // "Set as desktop background" from file menus anywhere.
  useEffect(() => {
    const f = (e: Event) => setPref("wallpaper", String((e as CustomEvent).detail));
    window.addEventListener("w8:wallpaper", f);
    return () => window.removeEventListener("w8:wallpaper", f);
  }, [setPref]);

  const binFull = fs.binCount() > 0;
  const items: Item[] = useMemo(() => {
    const files = fs.list(KNOWN.desktop).map((n) => {
      const p = join(KNOWN.desktop, n.name);
      return { key: p, path: p, label: n.kind === "lnk" || n.kind === "url" ? n.name.replace(/\.(lnk|url)$/i, "") : fs.label(n, lang), icon: nodeIcon(n, p), node: n, shortcut: n.kind === "lnk" || n.kind === "url" };
    });
    return [
      { key: "::thispc", path: null, label: t("desk.thisPc"), icon: "thispc" as ShellIconName },
      { key: "::recycle", path: null, label: t("desk.recycle"), icon: (binFull ? "recycle-full" : "recycle-empty") as ShellIconName },
      ...files,
    ];
    // fs version drives the re-render through useFS
  }, [t, lang, binFull, fs.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const cellW = iconSize === 96 ? 116 : iconSize === 48 ? 78 : 74;
  const cellH = iconSize === 96 ? 132 : iconSize === 48 ? 90 : 62;
  const rows = Math.max(1, Math.floor((vh - TASKBAR_H - 8) / cellH));

  // Lay out: remembered cells first, then fill the free cells column by column.
  const layout = useMemo(() => {
    const taken = new Set<string>();
    const out = new Map<string, { c: number; r: number }>();
    for (const it of items) {
      const p = pos[it.key];
      if (p && p.r < rows && !taken.has(`${p.c},${p.r}`)) {
        out.set(it.key, p);
        taken.add(`${p.c},${p.r}`);
      }
    }
    let k = 0;
    for (const it of items) {
      if (out.has(it.key)) continue;
      while (taken.has(`${Math.floor(k / rows)},${k % rows}`)) k++;
      const cell = { c: Math.floor(k / rows), r: k % rows };
      out.set(it.key, cell);
      taken.add(`${cell.c},${cell.r}`);
    }
    return out;
  }, [items, pos, rows]);

  const ctx = useMemo(
    () => ({
      lang,
      owner: null,
      open,
      openPath: (p: string) => openPath(p),
      rename: (p: string) => setRenaming(p),
    }),
    [lang, open, openPath],
  );

  const activate = useCallback(
    (it: Item) => {
      sound.tap();
      if (it.key === "::thispc") wm.launch("explorer", { arg: "::thispc" });
      else if (it.key === "::recycle") wm.launch("explorer", { arg: RECYCLE });
      else if (it.path) openPath(it.path);
    },
    [openPath],
  );

  const cellAt = (x: number, y: number) => ({ c: Math.max(0, Math.floor((x - 4) / cellW)), r: Math.max(0, Math.min(rows - 1, Math.floor((y - 4) / cellH))) });

  const placeAt = (keys: string[], x: number, y: number) => {
    const base = cellAt(x, y);
    setPos((cur) => {
      const next = { ...cur };
      const occupied = new Set([...layout.entries()].filter(([k]) => !keys.includes(k)).map(([, v]) => `${v.c},${v.r}`));
      let k = base.c * rows + base.r;
      for (const key of keys) {
        while (occupied.has(`${Math.floor(k / rows)},${k % rows}`)) k++;
        next[key] = { c: Math.floor(k / rows), r: k % rows };
        occupied.add(`${next[key].c},${next[key].r}`);
        k++;
      }
      return next;
    });
  };

  // ---- drag & drop ----
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const paths = readDrag(e);
    if (!paths.length) return;
    const r = layer.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-dkey]")?.dataset.dkey;
    if (target === "::recycle") {
      for (const p of paths) fs.exists(p) && fs.remove(p);
      sound.recycle();
      return;
    }
    if (target && target !== "::thispc" && !paths.includes(target) && fs.isDir(target)) {
      for (const p of paths) {
        try {
          e.ctrlKey ? fs.copy(p, target) : fs.move(p, target);
        } catch {
          /* into itself */
        }
      }
      return;
    }
    const fromDesk = paths.every((p) => join(p, "..").toLowerCase() === KNOWN.desktop.toLowerCase());
    if (fromDesk && !e.ctrlKey) return placeAt(paths, x, y);
    const moved = paths.map((p) => {
      try {
        return e.ctrlKey ? fs.copy(p, KNOWN.desktop) : fs.move(p, KNOWN.desktop);
      } catch {
        return null;
      }
    });
    placeAt(moved.filter(Boolean) as string[], x, y);
  };

  // ---- rubber band selection ----
  const onLayerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    wm.focus(null);
    setSel([]);
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setBand({ x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top });
  };
  const onLayerMove = (e: React.PointerEvent) => {
    if (!band) return;
    const r = e.currentTarget.getBoundingClientRect();
    const nb = { ...band, x1: e.clientX - r.left, y1: e.clientY - r.top };
    setBand(nb);
    const [l, rr] = [Math.min(nb.x0, nb.x1), Math.max(nb.x0, nb.x1)];
    const [tp, b] = [Math.min(nb.y0, nb.y1), Math.max(nb.y0, nb.y1)];
    setSel(
      items
        .filter((it) => {
          const c = layout.get(it.key)!;
          const x = 4 + c.c * cellW;
          const y = 4 + c.r * cellH;
          return x < rr && x + cellW > l && y < b && y + cellH > tp;
        })
        .map((it) => it.key),
    );
  };

  // ---- keyboard on the desktop (no window focused) ----
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement;
      if (wm.state.focus || renaming || tg.tagName === "INPUT" || tg.tagName === "TEXTAREA") return;
      const paths = sel.filter((k) => !k.startsWith("::"));
      if (e.key === "Delete" && paths.length) void confirmDelete(paths, { lang, owner: null });
      else if (e.key === "F2" && paths.length === 1) setRenaming(paths[0]);
      else if (e.key === "Enter" && sel.length) items.filter((i) => sel.includes(i.key)).forEach(activate);
      else if (e.key === "F5") setPos((p) => ({ ...p }));
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") setSel(items.map((i) => i.key));
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && paths.length) shellClipboard.set(paths, false);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x" && paths.length) shellClipboard.set(paths, true);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") shellClipboard.paste(KNOWN.desktop);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, sel, renaming, items, lang, activate]);

  const bgMenu = (x: number, y: number) => {
    const sizes: [32 | 48 | 96, string][] = [
      [96, tr ? "Büyük simgeler" : "Large icons"],
      [48, tr ? "Orta boyutlu simgeler" : "Medium icons"],
      [32, tr ? "Küçük simgeler" : "Small icons"],
    ];
    const sortBy = (key: "name" | "type" | "date") => () => {
      const sorted = [...items].filter((i) => i.path).sort((a, b) => {
        if (key === "name") return a.label.localeCompare(b.label, lang);
        if (key === "type") return (a.node?.kind ?? "").localeCompare(b.node?.kind ?? "") || a.label.localeCompare(b.label, lang);
        return (b.node?.modified ?? 0) - (a.node?.modified ?? 0);
      });
      const next: Pos = { "::thispc": { c: 0, r: 0 }, "::recycle": { c: 0, r: 1 } };
      sorted.forEach((it, i) => (next[it.key] = { c: Math.floor((i + 2) / rows), r: (i + 2) % rows }));
      setPos(next);
    };
    setMenu({
      x,
      y,
      items: [
        {
          label: tr ? "Görünüm" : "View",
          sub: [
            ...sizes.map(([s, l]) => ({ label: l, checked: iconSize === s, radio: true, onClick: () => setIconSize(s) })),
            { sep: true },
            { label: tr ? "Simgeleri otomatik düzenle" : "Auto arrange icons", onClick: () => setPos({}) },
            { label: tr ? "Masaüstü simgelerini göster" : "Show desktop icons", checked: showDesktopIcons, onClick: () => setPref("showDesktopIcons", !showDesktopIcons) },
          ],
        },
        {
          label: tr ? "Sıralama ölçütü" : "Sort by",
          sub: [
            { label: tr ? "Ad" : "Name", onClick: sortBy("name") },
            { label: tr ? "Öğe türü" : "Item type", onClick: sortBy("type") },
            { label: tr ? "Değiştirme tarihi" : "Date modified", onClick: sortBy("date") },
          ],
        },
        { label: t("ctx.refresh"), onClick: () => setPos((p) => ({ ...p })) },
        { sep: true },
        { label: tr ? "Yapıştır" : "Paste", disabled: !shellClipboard.get(), onClick: () => shellClipboard.paste(KNOWN.desktop) },
        { label: tr ? "Kısayolu yapıştır" : "Paste shortcut", disabled: true },
        { sep: true },
        newMenu(KNOWN.desktop, lang, (p) => {
          setSel([p]);
          setRenaming(p);
          const c = cellAt(x, y);
          setPos((cur) => ({ ...cur, [p]: c }));
        }),
        { sep: true },
        { label: t("ctx.resolution"), onClick: () => open({ kind: "app", app: "control", param: "display" }) },
        { label: t("ctx.personalize"), onClick: () => open({ kind: "app", app: "control", param: "personalize" }) },
      ],
    });
  };

  const iconMenu = (it: Item, x: number, y: number) => {
    if (it.key === "::thispc")
      return setMenu({
        x,
        y,
        items: [
          { label: tr ? "Aç" : "Open", bold: true, onClick: () => activate(it) },
          { label: tr ? "Ağ sürücüsüne bağlan..." : "Map network drive...", disabled: true },
          { sep: true },
          { label: tr ? "Özellikler" : "Properties", onClick: () => open({ kind: "app", app: "control", param: "system" }) },
        ],
      });
    if (it.key === "::recycle")
      return setMenu({
        x,
        y,
        items: [
          { label: tr ? "Aç" : "Open", bold: true, onClick: () => activate(it) },
          { sep: true },
          {
            label: tr ? "Geri Dönüşüm Kutusunu Boşalt" : "Empty Recycle Bin",
            disabled: !binFull,
            onClick: () => {
              fs.emptyBin();
              sound.recycle();
            },
          },
          { sep: true },
          { label: tr ? "Özellikler" : "Properties", onClick: () => showProperties(null, RECYCLE, lang) },
        ],
      });
    const paths = (sel.includes(it.key) ? sel : [it.key]).filter((k) => !k.startsWith("::"));
    setMenu({ x, y, items: itemMenu(paths, ctx) });
  };

  return (
    <div className="w8-desktop" hidden={!active} style={{ "--frame": winColor } as React.CSSProperties}>
      <Wallpaper value={wallpaper} className="w8-wallpaper" />
      <div
        ref={layer}
        className="w8-iconlayer"
        style={{ bottom: TASKBAR_H }}
        onPointerDown={onLayerDown}
        onPointerMove={onLayerMove}
        onPointerUp={() => setBand(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (e.target === e.currentTarget) {
            setSel([]);
            bgMenu(e.clientX, e.clientY);
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DND_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move";
          }
        }}
        onDrop={onDrop}
      >
        {showDesktopIcons &&
          items.map((it) => {
            const c = layout.get(it.key)!;
            const isSel = sel.includes(it.key);
            const thumb = it.node?.kind === "img" && iconSize >= 48 ? it.node : null;
            return (
              <div
                key={it.key}
                data-dkey={it.path ?? it.key}
                className={`w8-dicon size-${iconSize} ${isSel ? "sel" : ""} ${shellClipboard.get()?.cut && it.path && shellClipboard.get()!.paths.includes(it.path) ? "cut" : ""}`}
                style={{ left: 4 + c.c * cellW, top: 4 + c.r * cellH, width: cellW - 4 }}
                draggable={!renaming}
                onDragStart={(e) => {
                  const paths = (isSel ? sel : [it.key]).filter((k) => !k.startsWith("::"));
                  if (!paths.length) {
                    // System icons only move around the desktop.
                    e.dataTransfer.setData("text/plain", it.key);
                    return;
                  }
                  if (!isSel) setSel([it.key]);
                  e.dataTransfer.setData(DND_TYPE, JSON.stringify(paths));
                  e.dataTransfer.setData("text/plain", paths.map((p) => basename(p)).join("\n"));
                  e.dataTransfer.effectAllowed = "copyMove";
                }}
                onDragEnd={(e) => {
                  // System icons (This PC, Recycle Bin) get repositioned here since they carry no paths.
                  if (it.path || !layer.current) return;
                  const r = layer.current.getBoundingClientRect();
                  if (e.clientX > 0 && e.clientY > 0) placeAt([it.key], e.clientX - r.left, e.clientY - r.top);
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  wm.focus(null);
                  if (e.button === 2) {
                    if (!isSel) setSel([it.key]);
                    return;
                  }
                  if (e.ctrlKey) setSel((s) => (s.includes(it.key) ? s.filter((k) => k !== it.key) : [...s, it.key]));
                  else if (!isSel) setSel([it.key]);
                }}
                onDoubleClick={() => activate(it)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  iconMenu(it, e.clientX, e.clientY);
                }}
              >
                <span className="w8-dicon-img">
                  {thumb?.art ? (
                    <span className="w8-thumb">
                      <CoverArt seed={thumb.art.seed} motif={thumb.art.motif} palette={thumb.art.palette} variant={thumb.art.variant} />
                    </span>
                  ) : thumb?.data ? (
                    <span className="w8-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb.data} alt="" />
                    </span>
                  ) : (
                    <ShellIcon name={it.icon} size={iconSize} />
                  )}
                  {it.shortcut && (
                    <svg className="w8-lnk-arrow" viewBox="0 0 10 10" width={iconSize >= 48 ? 14 : 10} height={iconSize >= 48 ? 14 : 10}>
                      <rect width="10" height="10" fill="#fff" stroke="#999" strokeWidth="0.6" />
                      <path d="M2.5 7.5 7 3M4 3h3v3" fill="none" stroke="#1565c0" strokeWidth="1.3" />
                    </svg>
                  )}
                </span>
                {renaming === it.path && it.path ? (
                  <RenameBox
                    initial={it.node ? fs.label(it.node, lang) : it.label}
                    onDone={(v) => {
                      setRenaming(null);
                      if (v && it.path && v !== it.node?.name) {
                        try {
                          fs.rename(it.path, v);
                          const np = join(KNOWN.desktop, v);
                          setPos((p) => ({ ...p, [np]: p[it.key] ?? c }));
                          setSel([np]);
                        } catch {
                          sound.error();
                        }
                      }
                    }}
                  />
                ) : (
                  <span className="w8-dicon-label">{it.label}</span>
                )}
              </div>
            );
          })}
        {band && <div className="w8-band" style={{ left: Math.min(band.x0, band.x1), top: Math.min(band.y0, band.y1), width: Math.abs(band.x1 - band.x0), height: Math.abs(band.y1 - band.y0) }} />}
      </div>

      <div className="w8-winlayer">
        {wins.map((w) => {
          const Comp = PROGRAMS[w.app];
          if (!Comp) return null;
          const z = 10 + order.indexOf(w.id);
          return <Window key={w.id} win={w} z={z} focused={focus === w.id} modal={wins.some((x) => x.owner === w.id)} Comp={Comp} />;
        })}
      </div>
      <Taskbar onWinX={() => setWinx(true)} onNetwork={() => setNetwork(true)} />
      {winx && <PowerUserMenu bottom={TASKBAR_H} onClose={() => setWinx(false)} />}
      {network && <NetworkPane onClose={() => setNetwork(false)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function RenameBox({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  return (
    <textarea
      ref={ref}
      className="w8-rename"
      defaultValue={initial}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.currentTarget.value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onDone(e.currentTarget.value.trim());
        }
        if (e.key === "Escape") onDone(null);
        e.stopPropagation();
      }}
    />
  );
}

/** The Metro "Networks" pane that slides in from the right when the tray network icon is clicked. */
function NetworkPane({ onClose }: { onClose: () => void }) {
  const { lang } = useOS();
  const tr = lang === "tr";
  const [airplane, setAirplane] = useState(false);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  return (
    <>
      <div className="pane-scrim" onClick={onClose} />
      <aside className="w8-netpane">
        <h2>{tr ? "Ağlar" : "Networks"}</h2>
        <div className="w8-net-row">
          <span>{tr ? "Uçak modu" : "Airplane mode"}</span>
          <button className={`w8-toggle ${airplane ? "on" : ""}`} onClick={() => setAirplane((a) => !a)} aria-pressed={airplane}>
            <i />
          </button>
          <small>{airplane ? (tr ? "Açık" : "On") : tr ? "Kapalı" : "Off"}</small>
        </div>
        <h3>{tr ? "Bağlantılar" : "Connections"}</h3>
        {!airplane && (
          <>
            <div className="w8-net-item on">
              <svg width="22" height="18" viewBox="0 0 18 16" fill="currentColor">
                <rect x="1" y="11" width="3" height="4" />
                <rect x="5" y="8" width="3" height="7" />
                <rect x="9" y="5" width="3" height="10" />
                <rect x="13" y="2" width="3" height="13" />
              </svg>
              <span>
                AFU-Ev
                <small>{online ? (tr ? "Bağlı" : "Connected") : tr ? "İnternet erişimi yok" : "No Internet access"}</small>
              </span>
            </div>
            {["Kafe-WiFi", "TurkNet_5G", "DIRECT-HP-Yazıcı"].map((n, i) => (
              <div key={n} className="w8-net-item">
                <svg width="22" height="18" viewBox="0 0 18 16" fill="currentColor" opacity="0.8">
                  {[0, 1, 2, 3].map((k) => (
                    <rect key={k} x={1 + k * 4} y={11 - k * 3} width="3" height={4 + k * 3} opacity={k < 3 - (i % 3) ? 1 : 0.3} />
                  ))}
                </svg>
                <span>{n}</span>
              </div>
            ))}
          </>
        )}
      </aside>
    </>
  );
}
