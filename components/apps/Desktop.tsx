"use client";
/** Desktop: wallpaper, icons, a taskbar and real draggable windows (File Explorer, Notepad, Photo viewer). */
import { useEffect, useRef, useState } from "react";
import { useOS, useTick, type View } from "@/lib/os";
import { formatDate, pick, time } from "@/lib/i18n";
import type { IconName } from "@/lib/model";
import { media, profile, projects } from "@/content/portfolio";
import type { Motif } from "@/lib/types";
import { CoverArt } from "../CoverArt";
import { Icon } from "../Icons";
import { PowerUserMenu } from "../Charms";
import { WALLPAPER } from "../Tiles";

type Node = {
  id: string;
  name: string;
  type: "folder" | "txt" | "img" | "lnk" | "drive";
  children?: Node[];
  text?: string;
  art?: { seed: string; motif: Motif; palette: [string, string, string]; variant?: number };
  view?: View;
  date?: string;
};

type Snap = "max" | "left" | "right";
type Win = { id: string; kind: "explorer" | "notepad" | "image"; node: string; x: number; y: number; w: number; h: number; max: boolean; min: boolean; snap?: "left" | "right" };

/** Aero Snap: which edge the pointer is pushing against while a window is dragged. */
function snapZone(x: number, y: number): Snap | null {
  if (y <= 2) return "max";
  if (x <= 2) return "left";
  if (x >= window.innerWidth - 3) return "right";
  return null;
}

function useTree(): Node {
  const { t, lang } = useOS();
  const readme =
    lang === "tr"
      ? `Merhaba!\r\n\r\nBu masaüstü de portfolyomun bir parçası. Projeler klasöründe her proje için bir klasör var: içinde açıklama, kapak görseli ve uygulamada açan bir kısayol bulacaksın.\r\n\r\nBaşlangıç ekranına dönmek için sol alttaki düğmeye bas ya da fareyi sol alt köşeye götür.\r\n\r\n${profile.name}`
      : `Hi!\r\n\r\nThis desktop is part of my portfolio too. The Projects folder has a folder for every project, with a description, cover art and a shortcut that opens it in the app.\r\n\r\nTo get back to Start, press the button at the bottom left or move the mouse into the bottom-left corner.\r\n\r\n${profile.name}`;
  const cv = [
    `${profile.name} · ${pick(lang, profile.title)}`,
    pick(lang, profile.location),
    "",
    pick(lang, profile.about),
    "",
    `== ${t("profile.experience")} ==`,
    ...profile.experience.map((e) => `${e.period}  ${pick(lang, e.role)}, ${e.company}\r\n    ${pick(lang, e.summary)}`),
    "",
    `== ${t("profile.skills")} ==`,
    profile.skills.map((s) => s.name).join(", "),
    "",
    `== ${t("profile.education")} ==`,
    ...profile.education.map((e) => `${e.period}  ${pick(lang, e.degree)}, ${e.school}`),
  ].join("\r\n");
  return {
    id: "pc",
    name: t("desk.thisPc"),
    type: "folder",
    children: [
      {
        id: "projects",
        name: t("desk.projects"),
        type: "folder",
        children: projects.map((p) => ({
          id: `p-${p.id}`,
          name: p.title,
          type: "folder" as const,
          date: `${p.year}`,
          children: [
            { id: `p-${p.id}-txt`, name: lang === "tr" ? "aciklama.txt" : "about.txt", type: "txt" as const, text: `${p.title}\r\n${pick(lang, p.tagline)}\r\n\r\n${pick(lang, p.description)}\r\n\r\n${p.tech.join(" · ")}`, date: `${p.year}` },
            { id: `p-${p.id}-img`, name: lang === "tr" ? "kapak.png" : "cover.png", type: "img" as const, art: { seed: p.id, motif: p.motif, palette: p.palette }, date: `${p.year}` },
            ...[1, 2].map((v) => ({ id: `p-${p.id}-shot${v}`, name: `${lang === "tr" ? "ekran" : "screen"}-${v}.png`, type: "img" as const, art: { seed: p.id, motif: p.motif, palette: p.palette, variant: v }, date: `${p.year}` })),
            { id: `p-${p.id}-lnk`, name: `${p.title}.lnk`, type: "lnk" as const, view: { kind: "app", app: "projects", param: p.id } as View, date: `${p.year}` },
          ],
        })),
      },
      {
        id: "docs",
        name: t("desk.documents"),
        type: "folder",
        children: [
          { id: "readme", name: t("desk.readme"), type: "txt", text: readme, date: "2026" },
          { id: "cv", name: "CV.txt", type: "txt", text: cv, date: "2026" },
          ...media.map((m) => ({ id: `m-${m.id}`, name: `${pick(lang, m.title)}.url`, type: "lnk" as const, view: { kind: "app", app: "reader", param: m.id } as View, date: formatDate(lang, m.date) })),
        ],
      },
      {
        id: "pics",
        name: t("desk.pictures"),
        type: "folder",
        children: [...projects, ...media].map((x) => ({ id: `pic-${x.id}`, name: `${x.id}.png`, type: "img" as const, art: { seed: x.id, motif: x.motif, palette: x.palette }, date: "2026" })),
      },
      { id: "c", name: lang === "tr" ? "Yerel Disk (C:)" : "Local Disk (C:)", type: "drive", children: [] },
    ],
  };
}

function find(n: Node, id: string, path: Node[] = []): Node[] | null {
  if (n.id === id) return [...path, n];
  for (const c of n.children ?? []) {
    const r = find(c, id, [...path, n]);
    if (r) return r;
  }
  return null;
}

const typeIcon = (n: Node): IconName => (n.type === "folder" ? "folder" : n.type === "img" ? "image" : n.type === "lnk" ? "link" : n.type === "drive" ? "pc" : "file");

export function DesktopApp() {
  const os = useOS();
  const { t, lang, open, openApp, setCharm } = os;
  const tree = useTree();
  const now = new Date(useTick(10_000));
  const [wins, setWins] = useState<Win[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [selIcon, setSelIcon] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | "winx" | { x: number; y: number }>(null);
  const [showIcons, setShowIcons] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const z = useRef<string[]>([]);

  const spawn = (kind: Win["kind"], node: string) => {
    const id = `${kind}-${Date.now()}`;
    const vw = window.innerWidth;
    const vh = window.innerHeight - 40;
    const w = kind === "image" ? Math.min(760, vw - 80) : kind === "notepad" ? Math.min(620, vw - 80) : Math.min(900, vw - 60);
    const h = kind === "image" ? Math.min(500, vh - 60) : kind === "notepad" ? Math.min(460, vh - 60) : Math.min(560, vh - 40);
    const k = wins.length;
    setWins((ws) => [...ws, { id, kind, node, x: Math.max(10, (vw - w) / 2 - 60 + k * 30), y: Math.max(10, (vh - h) / 2 - 30 + k * 26), w, h, max: false, min: false }]);
    z.current = [...z.current.filter((x) => x !== id), id];
    setFocus(id);
  };

  // Open the explorer once on arrival so the desktop feels alive.
  useEffect(() => {
    const id = window.setTimeout(() => spawn("explorer", "projects"), 450);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const raise = (id: string) => {
    z.current = [...z.current.filter((x) => x !== id), id];
    setFocus(id);
  };
  const patch = (id: string, p: Partial<Win>) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const close = (id: string) => setWins((ws) => ws.filter((w) => w.id !== id));

  const activate = (n: Node, from?: string) => {
    if (n.type === "folder" || n.type === "drive") {
      if (from) patch(from, { node: n.id });
      else spawn("explorer", n.id);
    } else if (n.type === "txt") spawn("notepad", n.id);
    else if (n.type === "img") spawn("image", n.id);
    else if (n.view) open(n.view);
  };

  const icons: Node[] = [
    { id: "pc", name: t("desk.thisPc"), type: "drive" },
    find(tree, "projects")!.slice(-1)[0],
    find(tree, "readme")!.slice(-1)[0],
    find(tree, "cv")!.slice(-1)[0],
    { id: "bin", name: t("desk.recycle"), type: "folder", children: [] },
  ];

  return (
    <div
      className="desktop"
      onClick={() => setSelIcon(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!(e.target as HTMLElement).closest(".win, .taskbar")) setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <CoverArt className="wallpaper" {...WALLPAPER} animated />
      <div className="desk-icons" key={refresh} hidden={!showIcons}>
        {icons.map((n) => (
          <button
            key={n.id}
            className={`desk-icon ${selIcon === n.id ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelIcon(n.id);
            }}
            onDoubleClick={() => (n.id === "bin" ? spawn("explorer", "bin") : activate(n.id === "pc" ? tree : n))}
            onKeyDown={(e) => e.key === "Enter" && activate(n.id === "pc" ? tree : n)}
          >
            <span className={`desk-glyph g-${n.id === "bin" ? "bin" : n.type}`}>
              <Icon name={n.id === "pc" ? "pc" : n.id === "bin" ? "trash" : typeIcon(n)} size={34} strokeWidth={1.3} />
            </span>
            <span>{n.name}</span>
          </button>
        ))}
      </div>

      {wins.map((w) => (
        <Window
          key={w.id}
          w={w}
          z={z.current.indexOf(w.id) + 10}
          focused={focus === w.id}
          onFocus={() => raise(w.id)}
          onPatch={(p) => patch(w.id, p)}
          onClose={() => close(w.id)}
          tree={tree}
          onActivate={(n) => activate(n, w.kind === "explorer" ? w.id : undefined)}
        />
      ))}

      <div className="taskbar" onClick={(e) => e.stopPropagation()}>
        <button
          className="tb-start"
          onClick={() => open({ kind: "start" })}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu("winx");
          }}
          aria-label={t("start")}
          title={t("start")}
        >
          <Icon name="start" size={22} />
        </button>
        <button className={`tb-app ${wins.some((w) => w.kind === "explorer") ? "running" : ""}`} onClick={() => {
          const ex = wins.find((w) => w.kind === "explorer");
          if (ex) { patch(ex.id, { min: !ex.min && focus === ex.id }); raise(ex.id); } else spawn("explorer", "pc");
        }} title={t("desk.explorer")}>
          <Icon name="folder" size={22} />
        </button>
        <button className="tb-app" onClick={() => openApp("projects")} title={t("app.projects")}>
          <Icon name="projects" size={22} />
        </button>
        {wins
          .filter((w) => w.kind !== "explorer")
          .map((w) => (
            <button key={w.id} className={`tb-app running ${focus === w.id && !w.min ? "active" : ""}`} onClick={() => { patch(w.id, { min: focus === w.id ? !w.min : false }); raise(w.id); }} title={find(tree, w.node)?.slice(-1)[0]?.name}>
              <Icon name={w.kind === "notepad" ? "file" : "image"} size={22} />
            </button>
          ))}
        <div className="tb-tray">
          <Icon name="up" size={14} />
          <Icon name="wifi" size={16} />
          <Icon name="volume" size={16} />
          <span className="tb-lang">{lang === "tr" ? "TUR" : "ENG"}</span>
          <span className="tb-clock">
            <span>{time(now)}</span>
            <span>{now.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US")}</span>
          </span>
          <button className="tb-show" onClick={() => setWins((ws) => ws.map((w) => ({ ...w, min: true })))} aria-label="show desktop" />
        </div>
      </div>

      {menu === "winx" && <PowerUserMenu bottom={40} onClose={() => setMenu(null)} />}
      {menu && menu !== "winx" && (
        <>
          <div className="menu-scrim" onPointerDown={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()} />
          <div className="flyout ctx" style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 170) }}>
            {(
              [
                [t("ctx.view"), () => setShowIcons((s) => !s), showIcons],
                [t("ctx.refresh"), () => setRefresh((n) => n + 1)],
                null,
                [t("ctx.resolution"), () => openApp("settings", "pcinfo")],
                [t("ctx.personalize"), () => setCharm("personalize")],
              ] as ([string, () => void, boolean?] | null)[]
            ).map((it, i) =>
              it ? (
                <button
                  key={i}
                  onClick={() => {
                    setMenu(null);
                    it[1]();
                  }}
                >
                  {it[2] && <Icon name="check" size={12} className="ctx-check" />}
                  {it[0]}
                </button>
              ) : (
                <hr key={i} />
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Window({
  w,
  z,
  focused,
  onFocus,
  onPatch,
  onClose,
  tree,
  onActivate,
}: {
  w: Win;
  z: number;
  focused: boolean;
  onFocus: () => void;
  onPatch: (p: Partial<Win>) => void;
  onClose: () => void;
  tree: Node;
  onActivate: (n: Node) => void;
}) {
  const { t, lang } = useOS();
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number } | null>(null);
  const size = useRef<{ dir: string; x: number; y: number; r: { x: number; y: number; w: number; h: number } } | null>(null);
  const [zone, setZone] = useState<Snap | null>(null);
  const docked = w.max || !!w.snap;
  const path = find(tree, w.node) ?? (w.node === "bin" ? [tree, { id: "bin", name: t("desk.recycle"), type: "folder" as const, children: [] }] : [tree]);
  const node = path[path.length - 1];
  const [sel, setSel] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const title = w.kind === "notepad" ? `${node.name} - ${t("desk.notepad")}` : node.name;

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // A docked window comes loose under the pointer at its old size, like Aero Snap.
    const at = { sx: e.clientX, sy: e.clientY };
    drag.current = docked ? { dx: w.w / 2, dy: e.clientY, ...at } : { dx: e.clientX - w.x, dy: e.clientY - w.y, ...at };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (docked && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return;
    const x = Math.max(-w.w + 80, Math.min(window.innerWidth - 80, e.clientX - d.dx));
    const y = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - d.dy));
    onPatch({ x, y, max: false, snap: undefined });
    setZone(snapZone(e.clientX, e.clientY));
  };
  const onUp = () => {
    if (drag.current && zone) onPatch(zone === "max" ? { max: true } : { snap: zone });
    drag.current = null;
    setZone(null);
  };

  const startSize = (dir: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    size.current = { dir, x: e.clientX, y: e.clientY, r: { x: w.x, y: w.y, w: w.w, h: w.h } };
  };
  const onSize = (e: React.PointerEvent) => {
    const s = size.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const nw = Math.max(320, s.r.w + (s.dir.includes("e") ? dx : s.dir.includes("w") ? -dx : 0));
    const nh = Math.max(200, s.r.h + (s.dir.includes("s") ? dy : s.dir.includes("n") ? -dy : 0));
    onPatch({ w: nw, h: nh, x: s.dir.includes("w") ? s.r.x + s.r.w - nw : s.r.x, y: s.dir.includes("n") ? s.r.y + s.r.h - nh : s.r.y });
  };

  const go = (n: Node) => {
    if (n.type === "folder" || n.type === "drive") {
      setHistory((h) => [...h, w.node]);
      setSel(null);
    }
    onActivate(n);
  };

  const full = { top: 0, height: "calc(100% - 40px)" };
  const style: React.CSSProperties = w.max
    ? { ...full, left: 0, width: "100%", zIndex: z }
    : w.snap
      ? { ...full, left: w.snap === "left" ? 0 : "50%", width: "50%", zIndex: z }
      : { left: w.x, top: w.y, width: w.w, height: w.h, zIndex: z };

  return (
    <>
    {zone && <div className={`snap-preview snap-${zone}`} style={{ zIndex: z }} />}
    <div className={`win ${focused ? "focused" : ""} ${w.min ? "min" : ""} ${docked ? "docked" : ""} win-${w.kind}`} style={style} onPointerDown={onFocus}>
      {!docked &&
        ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => (
          <div key={d} className={`rz rz-${d}`} onPointerDown={startSize(d)} onPointerMove={onSize} onPointerUp={() => (size.current = null)} />
        ))}
      <div className="win-title" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={() => onPatch(docked ? { max: false, snap: undefined } : { max: true })}>
        <span className="win-title-icon">
          <Icon name={w.kind === "explorer" ? "folder" : w.kind === "notepad" ? "file" : "image"} size={14} />
        </span>
        <span className="win-title-text">{title}</span>
        <div className="win-caption" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => onPatch({ min: true })} aria-label="minimize">
            <Icon name="minus" size={12} />
          </button>
          <button onClick={() => onPatch(docked ? { max: false, snap: undefined } : { max: true })} aria-label="maximize">
            <Icon name={docked ? "restore" : "maximize"} size={11} />
          </button>
          <button className="win-close" onClick={onClose} aria-label="close">
            <Icon name="close" size={12} />
          </button>
        </div>
      </div>

      {w.kind === "explorer" && (
        <>
          <div className="ribbon-tabs">
            <span className="ribbon-file">{lang === "tr" ? "Dosya" : "File"}</span>
            <span>{lang === "tr" ? "Giriş" : "Home"}</span>
            <span>{lang === "tr" ? "Paylaş" : "Share"}</span>
            <span>{lang === "tr" ? "Görünüm" : "View"}</span>
          </div>
          <div className="addr">
            <button
              className="addr-btn"
              disabled={!history.length}
              onClick={() => {
                const prev = history[history.length - 1];
                setHistory((h) => h.slice(0, -1));
                if (prev) onActivate(find(tree, prev)?.slice(-1)[0] ?? tree);
              }}
              aria-label={t("back")}
            >
              <Icon name="back" size={14} />
            </button>
            <button className="addr-btn" disabled={path.length < 2} onClick={() => path.length > 1 && go(path[path.length - 2])} aria-label="up">
              <Icon name="up" size={14} />
            </button>
            <div className="addr-path">
              <Icon name={path[0].type === "folder" ? "pc" : "pc"} size={14} />
              {path.map((p) => (
                <button key={p.id} onClick={() => p.id !== node.id && go(p)}>
                  {p.name} ›
                </button>
              ))}
            </div>
            <div className="addr-search">
              {t("charm.search")} "{node.name}"
              <Icon name="search" size={12} />
            </div>
          </div>
          <div className="explorer">
            <nav className="explorer-nav">
              <span className="nav-h">★ {lang === "tr" ? "Sık Kullanılanlar" : "Favorites"}</span>
              <button onClick={() => go(find(tree, "docs")!.slice(-1)[0])}>{t("desk.documents")}</button>
              <span className="nav-h">
                <Icon name="pc" size={13} /> {t("desk.thisPc")}
              </span>
              {tree.children!.map((c) => (
                <button key={c.id} className={path.some((p) => p.id === c.id) ? "on" : ""} onClick={() => go(c)}>
                  <Icon name={c.type === "drive" ? "pc" : "folder"} size={14} /> {c.name}
                </button>
              ))}
            </nav>
            <div className="explorer-main">
              <div className="explorer-cols">
                <span>{t("desk.name")}</span>
                <span>{t("desk.modified")}</span>
                <span>{t("desk.type")}</span>
              </div>
              {!(node.children ?? []).length && <p className="explorer-empty">{t("desk.empty")}</p>}
              {(node.children ?? []).map((c) => (
                <button
                  key={c.id}
                  className={`explorer-row ${sel === c.id ? "on" : ""}`}
                  onClick={() => setSel(c.id)}
                  onDoubleClick={() => go(c)}
                  onKeyDown={(e) => e.key === "Enter" && go(c)}
                >
                  <span>
                    <span className={`row-icon t-${c.type}`}>
                      {c.type === "img" && c.art ? <CoverArt seed={c.art.seed} motif={c.art.motif} palette={c.art.palette} variant={c.art.variant} /> : <Icon name={typeIcon(c)} size={16} />}
                    </span>
                    {c.name}
                  </span>
                  <span>{c.date ?? ""}</span>
                  <span>{c.type === "folder" || c.type === "drive" ? t("desk.folder") : c.type === "img" ? t("desk.image") : c.type === "txt" ? t("desk.textDoc") : "Shortcut"}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="win-status">
            {(node.children ?? []).length} {t("desk.items")}
            {node.id.startsWith("p-") && (
              <button className="linkish" onClick={() => onActivate(node.children!.find((x) => x.type === "lnk")!)}>
                {t("desk.openInApp")}
              </button>
            )}
          </div>
        </>
      )}

      {w.kind === "notepad" && (
        <>
          <div className="np-menu">
            {(lang === "tr" ? ["Dosya", "Düzen", "Biçim", "Görünüm", "Yardım"] : ["File", "Edit", "Format", "View", "Help"]).map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
          <textarea className="np-text" defaultValue={(node.text ?? "").replace(/\r\n/g, "\n")} spellCheck={false} />
        </>
      )}

      {w.kind === "image" && node.art && (
        <div className="imgview">
          <CoverArt seed={node.art.seed} motif={node.art.motif} palette={node.art.palette} variant={node.art.variant} animated />
        </div>
      )}
    </div>
    </>
  );
}
