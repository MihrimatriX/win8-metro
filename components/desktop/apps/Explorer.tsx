"use client";
/**
 * File Explorer (Dosya Gezgini) as in Windows 8.1: the ribbon (with the Computer and Recycle Bin Tools tabs),
 * Back / Forward / Up, the breadcrumb address bar, search, the navigation pane tree, six layouts with sortable
 * Details columns, This PC with drive bars, the Recycle Bin, selection by click / Ctrl / Shift / rubber band /
 * keyboard, inline rename, drag and drop and the shell clipboard shared with the desktop.
 */
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useOS } from "@/lib/os";
import {
  fs,
  useFS,
  join,
  dirname,
  basename,
  extname,
  normalize,
  resolve,
  splitPath,
  formatSize,
  formatStamp,
  typeLabel,
  KNOWN,
  HOME,
  RECYCLE,
  type FNode,
} from "@/lib/fs";
import { wm } from "@/lib/wm";
import { sound } from "@/lib/sound";
import type { ShellIconName } from "@/lib/model";
import { CoverArt } from "../../CoverArt";
import { ShellIcon } from "../../icons/ShellIcons";
import { Ribbon, ContextMenu, RenameBox, StatusBar, useWindow, useWinKeys, type MenuItem, type RibbonTab } from "../ui";
import { msgBox } from "../dialogs";
import { showProperties } from "../Properties";
import { DND_TYPE, nodeIcon, readDrag, shellClipboard, useOpenPath } from "../shell";
import { confirmDelete, itemMenu, makeShortcut, newMenu } from "../fileMenu";
import "./explorer.css";

type Lang = "tr" | "en";
type Layout = "large" | "medium" | "small" | "list" | "details" | "tiles";
type SortKey = "name" | "modified" | "type" | "size" | "orig" | "deleted" | "folder";
type Row = { p: string; n: FNode; label: string; group?: number };
type Prefs = {
  nav: boolean;
  navW: number;
  pane: "preview" | "details" | null;
  ext: boolean;
  hidden: boolean;
  /** Layout per folder, like Windows remembers it. */
  views: Record<string, Layout>;
};

const PC = "::thispc";
const NET = "::network";
const RECENT = "::recent";
const BIN = normalize(RECYCLE);
const PREFS_KEY = "afu-metro:v2:explorer";
const KNOWN_ORDER = [KNOWN.desktop, KNOWN.documents, KNOWN.downloads, KNOWN.music, KNOWN.pictures, KNOWN.videos];
// A 256 GB SSD as Windows reports it, with the OS already on it.
const C_TOTAL = 237 * 1024 ** 3;
const C_BASE = 38.4 * 1024 ** 3;

/** Folders visited lately, for Favorites → Recent places (shared by every Explorer window). */
const recent: string[] = [];
function rememberPlace(p: string) {
  const i = recent.findIndex((x) => same(x, p));
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(p);
  recent.length = Math.min(recent.length, 20);
}

const lc = (s: string) => s.toLowerCase();
const same = (a: string, b: string) => lc(a) === lc(b);
const isDir = (n: FNode) => n.kind === "dir" || n.kind === "drive";
const under = (p: string, root: string) => same(p, root) || lc(p).startsWith(`${lc(root).replace(/\\$/, "")}\\`);
const stripExt = (s: string) => {
  const e = extname(s);
  return e ? s.slice(0, -(e.length + 1)) : s;
};

function loadPrefs(): Prefs {
  const d: Prefs = { nav: true, navW: 190, pane: null, ext: false, hidden: false, views: {} };
  try {
    return { ...d, ...JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return d;
  }
}

function startLoc(arg?: string) {
  if (!arg) return PC;
  if (arg.startsWith("::")) return [NET, RECENT].includes(arg) ? arg : PC;
  const p = normalize(arg);
  return fs.isDir(p) ? p : PC;
}

function locName(loc: string, lang: Lang) {
  const tr = lang === "tr";
  if (loc === PC) return tr ? "Bu bilgisayar" : "This PC";
  if (loc === NET) return tr ? "Ağ" : "Network";
  if (loc === RECENT) return tr ? "Son yerler" : "Recent places";
  if (same(loc, BIN)) return tr ? "Geri Dönüşüm Kutusu" : "Recycle Bin";
  const n = fs.get(loc);
  return n ? fs.label(n, lang) : basename(loc);
}

function locIcon(loc: string): ShellIconName {
  if (loc === PC) return "thispc";
  if (loc === NET) return "network";
  if (loc === RECENT) return "clock";
  if (same(loc, BIN)) return fs.binCount() ? "recycle-full" : "recycle-empty";
  const n = fs.get(loc);
  return n ? nodeIcon(n, loc) : "folder";
}

/** Breadcrumb locations: known folders hang off This PC, everything else off its drive. */
function crumbsOf(loc: string): string[] {
  if (loc.startsWith("::")) return loc === PC ? [PC] : [loc];
  if (under(loc, BIN)) return [BIN, ...(same(loc, BIN) ? [] : [loc])];
  const k = KNOWN_ORDER.find((x) => under(loc, x));
  const parts = splitPath(loc);
  const out = [PC];
  for (let i = k ? splitPath(k).length : 1; i <= parts.length; i++) out.push(normalize(parts.slice(0, i).join("\\")));
  return out;
}

function itemLabel(n: FNode, lang: Lang, ext: boolean) {
  const name = n.orig ? basename(n.orig) : fs.label(n, lang);
  if (isDir(n)) return name;
  return n.kind === "lnk" || n.kind === "url" || (!ext && n.kind !== "other") ? stripExt(name) : name;
}

function defaultLayout(loc: string): Layout {
  if (loc === PC) return "tiles";
  return under(loc, KNOWN.pictures) || under(loc, KNOWN.videos) ? "large" : "details";
}

function driveFree(n: FNode) {
  if (n.name.toUpperCase() !== "C:") return null;
  return { total: C_TOTAL, free: C_TOTAL - C_BASE - fs.size(n) };
}

// ---------- ribbon glyphs ----------

const page = "M3.5 1.5h6l3 3v10h-9z";
const folder = "M1.5 3.5h5l1.5 1.5h6.5v9h-13z";
const GLYPHS: Record<string, ReactNode> = {
  copy: (
    <>
      <path d="M5.5 1.5h5l2.5 2.5v7.5h-7.5z" fill="#fff" stroke="#6d6d6d" />
      <path d="M2.5 4.5h5l2.5 2.5v7.5h-7.5z" fill="#fff" stroke="#6d6d6d" />
    </>
  ),
  paste: (
    <>
      <rect x="1.5" y="2.5" width="9" height="12" fill="#d7b77d" stroke="#8a6a3a" />
      <rect x="4" y="1.5" width="4" height="2.5" fill="#e6e6e6" stroke="#777" />
      <path d="M6.5 6.5h5l2 2v6h-7z" fill="#fff" stroke="#6d6d6d" />
    </>
  ),
  cut: (
    <>
      <path d="M6 10.2 11.2 1.5M10 10.2 4.8 1.5" stroke="#555" strokeWidth="1.2" />
      <circle cx="4.5" cy="12" r="2.2" fill="none" stroke="#2b6cb0" strokeWidth="1.3" />
      <circle cx="11.5" cy="12" r="2.2" fill="none" stroke="#2b6cb0" strokeWidth="1.3" />
    </>
  ),
  path: (
    <>
      <path d={page} fill="#fff" stroke="#6d6d6d" />
      <path d="M5.5 7.5h5M5.5 10h5M5.5 12.5h3" stroke="#2b6cb0" />
    </>
  ),
  lnk: (
    <>
      <path d={page} fill="#fff" stroke="#6d6d6d" />
      <path d="M5.5 12 10 7.5M7.5 7.5H10V10" stroke="#2b6cb0" strokeWidth="1.3" fill="none" />
    </>
  ),
  move: (
    <>
      <path d={folder} fill="#f8d775" stroke="#c9a23c" />
      <path d="M4.5 10h6M8.5 8l2 2-2 2" stroke="#1565c0" strokeWidth="1.4" fill="none" />
    </>
  ),
  copyto: (
    <>
      <path d={folder} fill="#f8d775" stroke="#c9a23c" />
      <path d="M5.5 6.5h4l1.5 1.5v5h-5.5z" fill="#fff" stroke="#6d6d6d" />
    </>
  ),
  del: <path d="M3 3l10 10M13 3 3 13" stroke="#d13438" strokeWidth="2.4" />,
  rename: (
    <>
      <rect x="1.5" y="4.5" width="13" height="7" fill="#fff" stroke="#6d6d6d" />
      <path d="M3.5 6.5v3M10.5 2.5v11M9 2.5h3M9 13.5h3" stroke="#1565c0" />
    </>
  ),
  newfolder: (
    <>
      <path d={folder} fill="#f8d775" stroke="#c9a23c" />
      <path d="M12.5 .5v5M10 3h5M10.7 1.2l3.6 3.6M14.3 1.2l-3.6 3.6" stroke="#e8a317" strokeWidth="1.1" />
    </>
  ),
  newitem: (
    <>
      <path d={page} fill="#fff" stroke="#6d6d6d" />
      <path d="M12.5 .5v5M10 3h5" stroke="#e8a317" strokeWidth="1.3" />
    </>
  ),
  props: (
    <>
      <path d="M3.5 1.5h9v13h-9z" fill="#fff" stroke="#6d6d6d" />
      <path d="M5.5 8.2 7.5 10.2 11 5.8" stroke="#d13438" strokeWidth="1.6" fill="none" />
    </>
  ),
  open: (
    <>
      <path d={folder} fill="#e9b949" stroke="#c9a23c" />
      <path d="M3 14.5l2-7h10.5l-2 7z" fill="#f8d775" stroke="#c9a23c" />
    </>
  ),
  edit: <path d="M2.5 13.5l1-3.8 7.4-7.4 2.8 2.8-7.4 7.4z" fill="#f2c94c" stroke="#8a6a3a" />,
  history: (
    <>
      <circle cx="8" cy="8" r="6.5" fill="#fff" stroke="#6d6d6d" />
      <path d="M8 4v4l3 2" stroke="#2b6cb0" strokeWidth="1.3" fill="none" />
    </>
  ),
  selall: <rect x="2.5" y="2.5" width="11" height="11" fill="#cce8ff" stroke="#2b6cb0" strokeDasharray="2 1" />,
  selnone: <rect x="2.5" y="2.5" width="11" height="11" fill="#fff" stroke="#6d6d6d" strokeDasharray="2 1" />,
  invert: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" fill="#fff" stroke="#6d6d6d" strokeDasharray="2 1" />
      <path d="M3 13 13 3v10z" fill="#cce8ff" />
    </>
  ),
  nav: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" fill="#fff" stroke="#6d6d6d" />
      <rect x="2" y="3" width="4" height="10" fill="#9fc6ee" />
    </>
  ),
  preview: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" fill="#fff" stroke="#6d6d6d" />
      <rect x="9" y="3" width="5" height="10" fill="#9fc6ee" />
    </>
  ),
  dpane: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" fill="#fff" stroke="#6d6d6d" />
      <path d="M9.5 5h3.5M9.5 7.5h3.5M9.5 10h3.5" stroke="#2b6cb0" />
    </>
  ),
  large: (
    <path
      d="M1.5 1.5h5.5v5.5h-5.5zM9 1.5h5.5v5.5H9zM1.5 9h5.5v5.5h-5.5zM9 9h5.5v5.5H9z"
      fill="#9fc6ee"
      stroke="#2b6cb0"
    />
  ),
  medium: (
    <path
      d="M1.5 1.5h3v3h-3zM6.5 1.5h3v3h-3zM11.5 1.5h3v3h-3zM1.5 6.5h3v3h-3zM6.5 6.5h3v3h-3zM11.5 6.5h3v3h-3zM1.5 11.5h3v3h-3zM6.5 11.5h3v3h-3zM11.5 11.5h3v3h-3z"
      fill="#9fc6ee"
      stroke="#2b6cb0"
    />
  ),
  small: <path d="M1 2h3v3H1zM1 6.5h3v3H1zM1 11h3v3H1zM9 2h3v3H9zM9 6.5h3v3H9zM9 11h3v3H9z" fill="#2b6cb0" />,
  list: <path d="M1 2h3v2H1zM1 7h3v2H1zM1 12h3v2H1zM5 3h5M5 8h5M5 13h5" stroke="#2b6cb0" fill="#2b6cb0" />,
  details: <path d="M1 2h2.5v2H1zM1 7h2.5v2H1zM1 12h2.5v2H1zM5 3h10M5 8h10M5 13h10" stroke="#2b6cb0" fill="#2b6cb0" />,
  tiles: (
    <path d="M1.5 2.5h4v4h-4zM1.5 9.5h4v4h-4zM7 3.5h7M7 5.5h5M7 10.5h7M7 12.5h5" stroke="#2b6cb0" fill="#9fc6ee" />
  ),
  sort: (
    <path
      d="M4.5 2v12M2 11.5 4.5 14 7 11.5M9 3.5h6M9 7.5h4.5M9 11.5h3"
      stroke="#2b6cb0"
      strokeWidth="1.2"
      fill="none"
    />
  ),
  restore: (
    <>
      <path d="M2.5 1.5h11v13h-11z" fill="#fff" stroke="#6d6d6d" />
      <path d="M11 10.5a3.5 3.5 0 1 1-1-4.5M10.5 3.5v2.8H7.7" stroke="#1565c0" strokeWidth="1.4" fill="none" />
    </>
  ),
  mail: (
    <>
      <rect x="1.5" y="3.5" width="13" height="9" fill="#fff" stroke="#6d6d6d" />
      <path d="M1.5 3.5 8 9l6.5-5.5" stroke="#6d6d6d" fill="none" />
    </>
  ),
  zip: (
    <>
      <path d={folder} fill="#f8d775" stroke="#c9a23c" />
      <path d="M8 5v9" stroke="#555" strokeDasharray="1 1" strokeWidth="2" />
    </>
  ),
  disc: (
    <>
      <circle cx="8" cy="8" r="6.5" fill="#e8e8e8" stroke="#888" />
      <circle cx="8" cy="8" r="1.8" fill="#fff" stroke="#888" />
    </>
  ),
  print: (
    <>
      <rect x="4.5" y="1.5" width="7" height="4" fill="#fff" stroke="#6d6d6d" />
      <rect x="1.5" y="5.5" width="13" height="6" fill="#bbb" stroke="#6d6d6d" />
      <rect x="4.5" y="9.5" width="7" height="5" fill="#fff" stroke="#6d6d6d" />
    </>
  ),
  shield: <path d="M8 1.5 2.5 3.5v4c0 3.5 2.5 6 5.5 7 3-1 5.5-3.5 5.5-7v-4z" fill="#ffd34d" stroke="#2b6cb0" />,
};
const ic = (name: string, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    {GLYPHS[name]}
  </svg>
);

/** The little shortcut arrow over .lnk / .url icons. */
function LnkArrow({ size }: { size: number }) {
  const s = size >= 48 ? 14 : size >= 32 ? 11 : 9;
  return (
    <svg className="ex-lnk" viewBox="0 0 10 10" width={s} height={s}>
      <rect width="10" height="10" fill="#fff" stroke="#999" strokeWidth="0.6" />
      <path d="M2.5 7.5 7 3M4 3h3v3" fill="none" stroke="#1565c0" strokeWidth="1.3" />
    </svg>
  );
}

export default function ExplorerApp() {
  const { id, win, focused, setTitle, close } = useWindow();
  const { lang, open } = useOS();
  const tr = lang === "tr";
  const locale = tr ? "tr-TR" : "en-US";
  useFS();
  const clip = useSyncExternalStore(shellClipboard.subscribe, shellClipboard.get, () => null);
  const openPath = useOpenPath();

  const [hist, setHist] = useState(() => ({ stack: [startLoc(win.arg)], i: 0 }));
  const [arg, setArg] = useState(win.arg);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [sel, setSel] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [lead, setLead] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [addr, setAddr] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const [colW, setColW] = useState<Partial<Record<SortKey, number>>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number; base: string[] } | null>(null);
  const [expanded, setExpanded] = useState(() => new Set(["fav", "pc"]));
  const [drop, setDrop] = useState<string | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const typed = useRef({ s: "", t: 0 });

  const go = (to: string, select: string[] = []) => {
    setHist((h) => (h.stack[h.i] === to ? h : { stack: [...h.stack.slice(0, h.i + 1), to], i: h.i + 1 }));
    setSel(select);
    setAnchor(select[0] ?? null);
    setLead(select[0] ?? null);
    setRenaming(null);
    setQuery("");
    setAddr(null);
  };
  // A single-instance launch patches the window's arg: navigate there.
  if (win.arg !== arg) {
    setArg(win.arg);
    go(startLoc(win.arg));
  }

  const loc = hist.stack[hist.i];
  // A folder deleted from under us falls back to the nearest folder that's still there.
  let here = loc;
  while (!here.startsWith("::") && !fs.isDir(here)) {
    const up = dirname(here);
    here = up === here ? PC : up;
  }
  const isPath = !here.startsWith("::");
  const inBin = isPath && under(here, BIN);
  const writable = isPath && !inBin;
  const searching = query.trim() !== "";
  const name = locName(here, lang);
  const title = searching ? (tr ? `${name} içinde arama sonuçları` : `Search Results in ${name}`) : name;
  const viewKey = searching ? "::search" : lc(here);
  const layout = prefs.views[viewKey] ?? (searching ? "details" : defaultLayout(here));

  useEffect(() => setTitle(title), [title, setTitle]);
  useEffect(() => {
    if (!here.startsWith("::")) rememberPlace(here);
  }, [here]);
  // Braces matter: scrollTo() returns a Promise in new Chrome, and React would call it as a cleanup.
  useEffect(() => {
    content.current?.scrollTo(0, 0);
  }, [here, searching]);
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* not remembered */
    }
  }, [prefs]);
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  const setLayout = (l: Layout) => setPrefs((p) => ({ ...p, views: { ...p.views, [viewKey]: l } }));

  // ---------- rows ----------
  const row = (p: string, group?: number): Row | null => {
    const n = fs.get(p);
    return n ? { p, n, label: itemLabel(n, lang, prefs.ext), group } : null;
  };
  let rows: Row[];
  if (searching) {
    const needle = query.trim().toLocaleLowerCase(locale);
    const roots = isPath ? [here] : fs.drives().map((d) => normalize(d.name));
    rows = [];
    const walk = (dir: string) => {
      for (const n of fs.list(dir, prefs.hidden)) {
        if (rows.length >= 500) return;
        const p = join(dir, n.name);
        if (same(p, BIN) && !inBin) continue;
        const label = itemLabel(n, lang, prefs.ext);
        if (label.toLocaleLowerCase(locale).includes(needle)) rows.push({ p, n, label });
        if (n.children) walk(p);
      }
    };
    roots.forEach(walk);
  } else if (here === PC)
    rows = [...KNOWN_ORDER.map((p) => row(p, 0)), ...fs.drives().map((d) => row(normalize(d.name), 1))].filter(
      (r): r is Row => !!r,
    );
  else if (here === RECENT) rows = recent.map((p) => row(p)).filter((r): r is Row => !!r);
  else if (here === NET) rows = [];
  else rows = fs.list(here, prefs.hidden || inBin).map((n) => row(join(here, n.name))!);

  const sortVal = (r: Row): string | number => {
    switch (sort.key) {
      case "modified":
        return r.n.modified;
      case "type":
        return typeLabel(r.n, lang);
      case "size":
        return fs.size(r.n);
      case "orig":
        return r.n.orig ? dirname(r.n.orig) : "";
      case "deleted":
        return r.n.deleted ?? 0;
      case "folder":
        return dirname(r.p);
      default:
        return r.label;
    }
  };
  if (here !== PC || searching)
    rows.sort((a, b) => {
      const d = (isDir(a.n) ? 0 : 1) - (isDir(b.n) ? 0 : 1);
      if (d) return d;
      const x = sortVal(a);
      const y = sortVal(b);
      const c = typeof x === "number" ? x - (y as number) : x.localeCompare(String(y), locale, { numeric: true });
      return (sort.desc ? -c : c) || a.label.localeCompare(b.label, locale, { numeric: true });
    });

  const selRows = rows.filter((r) => sel.includes(r.p));
  const paths = selRows.map((r) => r.p);
  const cutSet = clip?.cut ? clip.paths : [];

  // ---------- actions ----------
  const selectOne = (p: string) => {
    setSel([p]);
    setAnchor(p);
    setLead(p);
    content.current?.querySelector(`[data-p="${CSS.escape(p)}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const range = (a: string, b: string) => {
    const i = rows.findIndex((r) => r.p === a);
    const j = rows.findIndex((r) => r.p === b);
    if (i < 0 || j < 0) return [b];
    return rows.slice(Math.min(i, j), Math.max(i, j) + 1).map((r) => r.p);
  };
  const jump = (i: number) => {
    setHist((h) => ({ ...h, i }));
    setSel([here]);
    setAnchor(here);
    setLead(here);
    setRenaming(null);
    setQuery("");
    setAddr(null);
  };
  const back = () => hist.i > 0 && jump(hist.i - 1);
  const fwd = () => hist.i < hist.stack.length - 1 && jump(hist.i + 1);
  const crumbs = crumbsOf(here);
  const upTo = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  const up = () => upTo && go(upTo, [here]);
  const refresh = () => setSel((s) => s.filter((p) => fs.exists(p)));

  const activate = (p: string) => {
    if (under(p, BIN) && !same(p, BIN)) return showProperties(id, p, lang);
    if (!openPath(p, { navigate: (to) => go(to) })) sound.error();
  };
  const openSel = () => {
    if (paths.length === 1) activate(paths[0]);
    else paths.forEach((p) => openPath(p));
  };
  const canRename = (r: Row) => !under(r.p, BIN) && r.n.kind !== "drive" && !r.n.display;
  const startRename = (p: string) => {
    const r = rows.find((x) => x.p === p);
    if (r && canRename(r)) {
      selectOne(p);
      setRenaming(p);
    }
  };
  const commitRename = async (r: Row, v: string | null) => {
    setRenaming(null);
    if (!v || v === r.label) return;
    // The extension was hidden in the label: keep it.
    const tail = r.n.name.slice(r.label.length);
    const next = !r.n.display && r.n.name.startsWith(r.label) && tail.startsWith(".") ? v + tail : v;
    try {
      fs.rename(r.p, next);
      selectOne(join(dirname(r.p), next));
    } catch (err) {
      const bad = (err as Error).message === "badname";
      await msgBox(id, {
        title: tr ? "Öğeyi Yeniden Adlandır" : "Rename Item",
        text: bad
          ? tr
            ? 'Dosya adı şu karakterlerden hiçbirini içeremez:\n\\ / : * ? " < > |'
            : "A file name can't contain any of the following characters:\n\\ / : * ? \" < > |"
          : tr
            ? `Bu konumda "${next}" adlı bir dosya zaten var.`
            : `There is already a file with the name "${next}" in this location.`,
        icon: bad ? "error" : "warning",
        buttons: [tr ? "Tamam" : "OK"],
      });
    }
  };
  const created = (p: string) => {
    setQuery("");
    setSel([p]);
    setAnchor(p);
    setLead(p);
    setRenaming(p);
  };
  const newFolder = () => {
    if (!writable) return;
    const p = join(here, fs.uniqueName(here, tr ? "Yeni klasör" : "New folder"));
    fs.mkdir(p);
    created(p);
  };
  const copy = () => paths.length && shellClipboard.set(paths, false);
  const cut = () => paths.length && !inBin && shellClipboard.set(paths, true);
  const paste = () => {
    if (!writable || !clip) return;
    const out = shellClipboard.paste(here);
    if (out.length) {
      setSel(out);
      setAnchor(out[0]);
    }
  };
  const pasteShortcut = () => writable && clip?.paths.forEach((p) => makeShortcut(p, here, lang));
  const copyPath = () =>
    void navigator.clipboard?.writeText(paths.map((p) => `"${p}"`).join("\r\n")).catch(() => undefined);
  const del = () => paths.length && void confirmDelete(paths, { lang, owner: id });
  const sendTo = (dir: string, move: boolean) => {
    for (const p of paths) {
      try {
        if (move) fs.move(p, dir);
        else fs.copy(p, dir);
      } catch {
        /* into itself */
      }
    }
  };
  const properties = () => {
    if (paths.length) showProperties(id, paths[0], lang);
    else if (isPath) showProperties(id, here, lang);
    else if (here === PC) open({ kind: "app", app: "control", param: "system" });
  };
  const editSel = () => {
    const r = selRows[0];
    if (r?.n.kind === "img") open({ kind: "app", app: "paint", param: r.p });
    else if (r) open({ kind: "app", app: "notepad", param: r.p });
  };
  const restore = (ps: string[]) => ps.forEach((p) => fs.restore(basename(p)));
  const emptyBin = async () => {
    const n = fs.binCount();
    if (!n) return;
    const r = await msgBox(id, {
      title: n > 1 ? (tr ? "Birden Çok Öğeyi Sil" : "Delete Multiple Items") : tr ? "Dosyayı Sil" : "Delete File",
      text:
        n > 1
          ? tr
            ? `Bu ${n} öğeyi kalıcı olarak silmek istediğinizden emin misiniz?`
            : `Are you sure you want to permanently delete these ${n} items?`
          : tr
            ? "Bu öğeyi kalıcı olarak silmek istediğinizden emin misiniz?"
            : "Are you sure you want to permanently delete this item?",
      icon: "warning",
      buttons: [tr ? "Evet" : "Yes", tr ? "Hayır" : "No"],
    });
    if (r === 0) {
      fs.emptyBin();
      sound.recycle();
    }
  };
  const newWindow = () => wm.launch("explorer", { arg: here });

  const submitAddr = async (text: string) => {
    const t = text.trim();
    setAddr(null);
    if (!t) return;
    const names: Record<string, string> = {
      "this pc": PC,
      "bu bilgisayar": PC,
      computer: PC,
      network: NET,
      ağ: NET,
      "recycle bin": BIN,
      "geri dönüşüm kutusu": BIN,
    };
    const special = names[t.toLocaleLowerCase(locale)];
    if (special) return go(special);
    if (/^https?:\/\//i.test(t)) return open({ kind: "app", app: "ie", param: t });
    const p = resolve(isPath ? here : HOME, t.replace(/^%userprofile%/i, HOME));
    if (fs.isDir(p)) return go(p);
    if (fs.exists(p)) return activate(p);
    await msgBox(id, {
      title: tr ? "Dosya Gezgini" : "File Explorer",
      text: tr
        ? `Windows '${t}' öğesini bulamıyor. Yazımı denetleyip yeniden deneyin.`
        : `Windows can't find '${t}'. Check the spelling and try again.`,
      icon: "error",
      buttons: [tr ? "Tamam" : "OK"],
    });
  };

  // ---------- drag & drop ----------
  const dragOver = (target: string | null) => (e: React.DragEvent) => {
    if (!target || !e.dataTransfer.types.includes(DND_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.ctrlKey && !same(target, BIN) ? "copy" : "move";
    // Only folders you drop *into* light up, not the folder being shown.
    const lit = same(target, here) ? null : target;
    if (drop !== lit) setDrop(lit);
  };
  const dragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
  };
  const dropOn = (target: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrop(null);
    const ps = readDrag(e).filter((p) => !same(p, target));
    if (!ps.length) return;
    if (same(target, BIN)) {
      ps.forEach((p) => {
        try {
          fs.remove(p);
        } catch {
          /* already gone */
        }
      });
      sound.recycle();
      return;
    }
    const moved: string[] = [];
    for (const p of ps) {
      if (same(dirname(p), target) && !e.ctrlKey) continue;
      // Like Windows: move within a drive, copy across drives (Ctrl always copies).
      const copyIt = e.ctrlKey || !same(splitPath(p)[0], splitPath(target)[0]);
      try {
        moved.push(copyIt ? fs.copy(p, target) : fs.move(p, target));
      } catch {
        /* into itself */
      }
    }
    if (same(target, here)) setSel(moved);
  };

  // ---------- selection with the mouse ----------
  const onItemDown = (e: React.PointerEvent, r: Row) => {
    if (renaming === r.p) return;
    setLead(r.p);
    if (e.button === 2) {
      if (!sel.includes(r.p)) {
        setSel([r.p]);
        setAnchor(r.p);
      }
    } else if (e.ctrlKey) {
      setSel((s) => (s.includes(r.p) ? s.filter((x) => x !== r.p) : [...s, r.p]));
      setAnchor(r.p);
    } else if (e.shiftKey) setSel(range(anchor ?? r.p, r.p));
    else if (!sel.includes(r.p)) {
      setSel([r.p]);
      setAnchor(r.p);
    }
  };
  const onBgDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-p], .ex-dh")) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    // Clicks on the scroll bars don't start a selection.
    if (e.clientX - r.left >= el.clientWidth || e.clientY - r.top >= el.clientHeight) return;
    if (!e.ctrlKey) setSel([]);
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    const x = e.clientX - r.left + el.scrollLeft;
    const y = e.clientY - r.top + el.scrollTop;
    setBand({ x0: x, y0: y, x1: x, y1: y, base: e.ctrlKey ? sel : [] });
  };
  const onBgMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!band) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const nb = { ...band, x1: e.clientX - r.left + el.scrollLeft, y1: e.clientY - r.top + el.scrollTop };
    setBand(nb);
    const [l, rt, t, b] = [
      Math.min(nb.x0, nb.x1),
      Math.max(nb.x0, nb.x1),
      Math.min(nb.y0, nb.y1),
      Math.max(nb.y0, nb.y1),
    ];
    const hit = [...el.querySelectorAll<HTMLElement>("[data-p]")]
      .filter((it) => {
        const q = it.getBoundingClientRect();
        const x = q.left - r.left + el.scrollLeft;
        const y = q.top - r.top + el.scrollTop;
        return x < rt && x + q.width > l && y < b && y + q.height > t;
      })
      .map((it) => it.dataset.p!);
    setSel([...band.base.filter((p) => !hit.includes(p)), ...hit.filter((p) => !band.base.includes(p))]);
  };

  // ---------- keyboard ----------
  const moveSel = (dir: "up" | "down" | "left" | "right" | "home" | "end", shift: boolean) => {
    if (!rows.length) return;
    const i = rows.findIndex((r) => r.p === lead);
    let target: Row | undefined;
    // Icon grids step through items left/right (wrapping); List does that up/down; the rest go by geometry.
    const linear = layout === "list" ? dir === "up" || dir === "down" : dir === "left" || dir === "right";
    if (dir === "home") target = rows[0];
    else if (dir === "end") target = rows[rows.length - 1];
    else if (i < 0) target = rows[0];
    else if (linear)
      target = rows[dir === "up" || dir === "left" ? Math.max(0, i - 1) : Math.min(rows.length - 1, i + 1)];
    else {
      const els = new Map(
        [...(content.current?.querySelectorAll<HTMLElement>("[data-p]") ?? [])].map((el) => [el.dataset.p!, el]),
      );
      const mid = (p: string) => {
        const q = els.get(p)?.getBoundingClientRect();
        return q ? { x: q.left + q.width / 2, y: q.top + q.height / 2 } : null;
      };
      const a = mid(rows[i].p);
      let best = Infinity;
      for (const r of rows) {
        const m = mid(r.p);
        if (!a || !m) continue;
        const dx = m.x - a.x;
        const dy = m.y - a.y;
        const [main, cross] =
          dir === "down" ? [dy, dx] : dir === "up" ? [-dy, dx] : dir === "right" ? [dx, dy] : [-dx, dy];
        if (main < 4) continue;
        const score = main + Math.abs(cross) * 3;
        if (score < best) {
          best = score;
          target = r;
        }
      }
    }
    if (!target) return;
    if (shift) {
      setSel(range(anchor ?? rows[Math.max(0, i)].p, target.p));
      setLead(target.p);
      content.current?.querySelector(`[data-p="${CSS.escape(target.p)}"]`)?.scrollIntoView({ block: "nearest" });
    } else selectOne(target.p);
  };
  const typeSelect = (ch: string, now: number) => {
    const t = typed.current;
    t.s = now - t.t > 1000 ? ch : t.s + ch;
    t.t = now;
    const i = Math.max(
      0,
      rows.findIndex((r) => r.p === lead),
    );
    // A repeated first letter cycles through the matches.
    const from = t.s.length === 1 ? i + 1 : i;
    const order = [...rows.slice(from), ...rows.slice(0, from)];
    const hit = order.find((r) => r.label.toLocaleLowerCase(locale).startsWith(t.s));
    if (hit) selectOne(hit.p);
  };
  const keys: Record<string, (e: KeyboardEvent) => void> = {
    "alt+arrowleft": back,
    "alt+arrowright": fwd,
    "alt+arrowup": up,
    backspace: back,
    browserback: back,
    f5: refresh,
    "ctrl+r": refresh,
    "ctrl+n": newWindow,
    "ctrl+w": close,
    "ctrl+shift+n": newFolder,
    "ctrl+f": () => searchBox.current?.focus(),
    "ctrl+e": () => searchBox.current?.focus(),
    f3: () => searchBox.current?.focus(),
    "alt+d": () => setAddr(isPath ? here : name),
    f4: () => setAddr(isPath ? here : name),
    "ctrl+l": () => setAddr(isPath ? here : name),
    "ctrl+a": () => setSel(rows.map((r) => r.p)),
    "ctrl+c": copy,
    "ctrl+x": cut,
    "ctrl+v": paste,
    delete: del,
    f2: () => paths.length === 1 && startRename(paths[0]),
    enter: openSel,
    "alt+enter": properties,
    escape: () => setSel([]),
    home: () => moveSel("home", false),
    end: () => moveSel("end", false),
    "shift+home": () => moveSel("home", true),
    "shift+end": () => moveSel("end", true),
  };
  for (const d of ["up", "down", "left", "right"] as const) {
    keys[`arrow${d}`] = () => moveSel(d, false);
    keys[`shift+arrow${d}`] = () => moveSel(d, true);
  }
  useWinKeys({
    "*": (e, combo) => {
      // Typing in the address bar, the search box or a rename box goes to the text box.
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || (t instanceof HTMLInputElement && t.type !== "checkbox")) return false;
      if (/^[\p{L}\p{N}]$/u.test(combo)) return typeSelect(combo, e.timeStamp);
      if (!keys[combo]) return false;
      keys[combo](e);
    },
  });

  // ---------- menus ----------
  const LAYOUTS: [Layout, string][] = [
    ["large", tr ? "Büyük simgeler" : "Large icons"],
    ["medium", tr ? "Orta simgeler" : "Medium icons"],
    ["small", tr ? "Küçük simgeler" : "Small icons"],
    ["list", tr ? "Liste" : "List"],
    ["details", tr ? "Ayrıntılar" : "Details"],
    ["tiles", tr ? "Döşemeler" : "Tiles"],
  ];
  const sortKeys: [SortKey, string][] = inBin
    ? [
        ["name", tr ? "Ad" : "Name"],
        ["orig", tr ? "Orijinal konum" : "Original Location"],
        ["deleted", tr ? "Silinme tarihi" : "Date Deleted"],
        ["size", tr ? "Boyut" : "Size"],
        ["type", tr ? "Öğe türü" : "Item type"],
        ["modified", tr ? "Değiştirme tarihi" : "Date modified"],
      ]
    : [
        ["name", tr ? "Ad" : "Name"],
        ...(searching ? [["folder", tr ? "Klasör" : "Folder"] as [SortKey, string]] : []),
        ["modified", tr ? "Değiştirme tarihi" : "Date modified"],
        ["type", tr ? "Tür" : "Type"],
        ["size", tr ? "Boyut" : "Size"],
      ];
  const sortMenu: MenuItem[] = [
    ...sortKeys.map(([k, l]) => ({
      label: l,
      radio: true,
      checked: sort.key === k,
      onClick: () => setSort((s) => ({ key: k, desc: s.key === k ? s.desc : false })),
    })),
    { sep: true },
    {
      label: tr ? "Artan" : "Ascending",
      radio: true,
      checked: !sort.desc,
      onClick: () => setSort((s) => ({ ...s, desc: false })),
    },
    {
      label: tr ? "Azalan" : "Descending",
      radio: true,
      checked: sort.desc,
      onClick: () => setSort((s) => ({ ...s, desc: true })),
    },
  ];
  const ctx = { lang, owner: id, open, openPath: activate, rename: startRename };
  const placeMenu = (target: string): MenuItem[] =>
    [...KNOWN_ORDER]
      .filter((p) => fs.exists(p) && !paths.includes(p))
      .map((p) => ({
        label: locName(p, lang),
        icon: <ShellIcon name={locIcon(p)} size={16} />,
        onClick: () => sendTo(p, target === "move"),
      }));
  const newItem = newMenu(here, lang, created) as Extract<MenuItem, { label: string }>;

  const bgMenu = (x: number, y: number) =>
    setMenu({
      x,
      y,
      items: [
        {
          label: tr ? "Görünüm" : "View",
          sub: LAYOUTS.map(([l, label]) => ({
            label,
            radio: true,
            checked: layout === l,
            onClick: () => setLayout(l),
          })),
        },
        { label: tr ? "Sıralama ölçütü" : "Sort by", sub: sortMenu, disabled: here === PC && !searching },
        { label: tr ? "Yenile" : "Refresh", onClick: refresh },
        { sep: true },
        ...(inBin
          ? [
              {
                label: tr ? "Geri Dönüşüm Kutusunu Boşalt" : "Empty Recycle Bin",
                disabled: !rows.length,
                onClick: () => void emptyBin(),
              },
            ]
          : writable
            ? [
                { label: tr ? "Yapıştır" : "Paste", disabled: !clip, onClick: paste },
                { label: tr ? "Kısayolu yapıştır" : "Paste shortcut", disabled: !clip, onClick: pasteShortcut },
                { sep: true } as MenuItem,
                newItem,
              ]
            : []),
        { sep: true },
        {
          label: tr ? "Özellikler" : "Properties",
          onClick: () =>
            isPath
              ? showProperties(id, here, lang)
              : here === PC && open({ kind: "app", app: "control", param: "system" }),
        },
      ],
    });
  const rowMenu = (r: Row, x: number, y: number) => {
    const ps = sel.includes(r.p) ? paths : [r.p];
    if (r.n.kind === "drive")
      return setMenu({
        x,
        y,
        items: [
          { label: tr ? "Aç" : "Open", bold: true, onClick: () => activate(r.p) },
          {
            label: tr ? "Yeni pencerede aç" : "Open in new window",
            onClick: () => wm.launch("explorer", { arg: r.p }),
          },
          { sep: true },
          { label: tr ? "Kopyala" : "Copy", disabled: true },
          { sep: true },
          { label: tr ? "Özellikler" : "Properties", onClick: () => showProperties(id, r.p, lang) },
        ],
      });
    setMenu({ x, y, items: itemMenu(ps, ctx) });
  };
  const treeMenu = (target: string, x: number, y: number) => {
    if (target.startsWith("::"))
      return setMenu({
        x,
        y,
        items: [
          { label: tr ? "Aç" : "Open", bold: true, onClick: () => go(target) },
          {
            label: tr ? "Yeni pencerede aç" : "Open in new window",
            onClick: () => wm.launch("explorer", { arg: target }),
          },
          ...(target === PC
            ? [
                { sep: true } as MenuItem,
                {
                  label: tr ? "Özellikler" : "Properties",
                  onClick: () => open({ kind: "app", app: "control", param: "system" }),
                },
              ]
            : []),
        ],
      });
    setMenu({ x, y, items: itemMenu([target], { ...ctx, openPath: (p) => go(p), rename: () => undefined }) });
  };
  const crumbMenu = (c: string, e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const kids =
      c === PC
        ? [...KNOWN_ORDER.filter((p) => fs.exists(p)), ...fs.drives().map((d) => normalize(d.name))]
        : c.startsWith("::")
          ? []
          : fs
              .list(c, prefs.hidden)
              .filter(isDir)
              .map((n) => join(c, n.name));
    setMenu({
      x: r.left,
      y: r.bottom,
      items: kids.length
        ? kids.map((p) => ({
            label: locName(p, lang),
            icon: <ShellIcon name={locIcon(p)} size={16} />,
            onClick: () => go(p),
          }))
        : [{ label: tr ? "(Boş)" : "(Empty)", disabled: true }],
    });
  };
  const recentMenu = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const items = hist.stack
      .map((l, i) => ({ label: locName(l, lang), radio: true, checked: i === hist.i, onClick: () => jump(i) }))
      .reverse()
      .slice(0, 10);
    setMenu({ x: r.left, y: r.bottom, items });
  };

  // ---------- ribbon ----------
  const hasSel = paths.length > 0;
  const canPaste = !!clip && writable;
  const single = selRows.length === 1 ? selRows[0] : null;
  const view: RibbonTab = {
    id: "view",
    label: tr ? "Görünüm" : "View",
    groups: [
      {
        label: tr ? "Bölmeler" : "Panes",
        items: [
          {
            label: tr ? "Gezinti bölmesi" : "Navigation pane",
            icon: ic("nav", 32),
            big: true,
            active: prefs.nav,
            onClick: () => setPref("nav", !prefs.nav),
          },
          {
            label: tr ? "Önizleme bölmesi" : "Preview pane",
            icon: ic("preview"),
            active: prefs.pane === "preview",
            onClick: () => setPref("pane", prefs.pane === "preview" ? null : "preview"),
          },
          {
            label: tr ? "Ayrıntılar bölmesi" : "Details pane",
            icon: ic("dpane"),
            active: prefs.pane === "details",
            onClick: () => setPref("pane", prefs.pane === "details" ? null : "details"),
          },
        ],
      },
      {
        label: tr ? "Düzen" : "Layout",
        items: LAYOUTS.map(([l, label]) => ({ label, icon: ic(l), active: layout === l, onClick: () => setLayout(l) })),
      },
      {
        label: tr ? "Geçerli görünüm" : "Current view",
        items: [
          {
            label: tr ? "Sıralama ölçütü" : "Sort by",
            icon: ic("sort", 32),
            big: true,
            menu: sortMenu,
            disabled: here === PC && !searching,
          },
        ],
      },
      {
        label: tr ? "Göster/gizle" : "Show/hide",
        items: [
          <label key="ext" className="ex-chk">
            <input type="checkbox" checked={prefs.ext} onChange={(e) => setPref("ext", e.target.checked)} />
            {tr ? "Dosya adı uzantıları" : "File name extensions"}
          </label>,
          <label key="hid" className="ex-chk">
            <input type="checkbox" checked={prefs.hidden} onChange={(e) => setPref("hidden", e.target.checked)} />
            {tr ? "Gizli öğeler" : "Hidden items"}
          </label>,
        ],
      },
    ],
  };
  const home: RibbonTab = {
    id: "home",
    label: tr ? "Giriş" : "Home",
    groups: [
      {
        label: tr ? "Pano" : "Clipboard",
        items: [
          { label: tr ? "Kopyala" : "Copy", icon: ic("copy", 32), big: true, disabled: !hasSel, onClick: copy },
          { label: tr ? "Yapıştır" : "Paste", icon: ic("paste", 32), big: true, disabled: !canPaste, onClick: paste },
          { label: tr ? "Kes" : "Cut", icon: ic("cut"), disabled: !hasSel || inBin, onClick: cut },
          { label: tr ? "Yolu kopyala" : "Copy path", icon: ic("path"), disabled: !hasSel, onClick: copyPath },
          {
            label: tr ? "Kısayolu yapıştır" : "Paste shortcut",
            icon: ic("lnk"),
            disabled: !canPaste,
            onClick: pasteShortcut,
          },
        ],
      },
      {
        label: tr ? "Düzenle" : "Organize",
        items: [
          {
            label: tr ? "Şuraya taşı" : "Move to",
            icon: ic("move", 32),
            big: true,
            disabled: !hasSel || inBin,
            menu: placeMenu("move"),
          },
          {
            label: tr ? "Şuraya kopyala" : "Copy to",
            icon: ic("copyto", 32),
            big: true,
            disabled: !hasSel || inBin,
            menu: placeMenu("copy"),
          },
          { label: tr ? "Sil" : "Delete", icon: ic("del", 32), big: true, disabled: !hasSel, onClick: del },
          {
            label: tr ? "Yeniden adlandır" : "Rename",
            icon: ic("rename", 32),
            big: true,
            disabled: !single || !canRename(single),
            onClick: () => single && startRename(single.p),
          },
        ],
      },
      {
        label: tr ? "Yeni" : "New",
        items: [
          {
            label: tr ? "Yeni klasör" : "New folder",
            icon: ic("newfolder", 32),
            big: true,
            disabled: !writable,
            onClick: newFolder,
          },
          { label: tr ? "Yeni öğe" : "New item", icon: ic("newitem"), disabled: !writable, menu: newItem.sub },
          { label: tr ? "Kolay erişim" : "Easy access", icon: ic("lnk"), disabled: true },
        ],
      },
      {
        label: tr ? "Aç" : "Open",
        items: [
          {
            label: tr ? "Özellikler" : "Properties",
            icon: ic("props", 32),
            big: true,
            disabled: !isPath && !hasSel,
            onClick: properties,
          },
          { label: tr ? "Aç" : "Open", icon: ic("open"), disabled: !hasSel, onClick: openSel },
          {
            label: tr ? "Düzenle" : "Edit",
            icon: ic("edit"),
            disabled: !single || !["txt", "img", "html"].includes(single.n.kind) || inBin,
            onClick: editSel,
          },
          { label: tr ? "Geçmiş" : "History", icon: ic("history"), disabled: true },
        ],
      },
      {
        label: tr ? "Seç" : "Select",
        items: [
          {
            label: tr ? "Tümünü seç" : "Select all",
            icon: ic("selall"),
            disabled: !rows.length,
            onClick: () => setSel(rows.map((r) => r.p)),
          },
          {
            label: tr ? "Hiçbirini seçme" : "Select none",
            icon: ic("selnone"),
            disabled: !hasSel,
            onClick: () => setSel([]),
          },
          {
            label: tr ? "Seçimi ters çevir" : "Invert selection",
            icon: ic("invert"),
            disabled: !rows.length,
            onClick: () => setSel(rows.filter((r) => !sel.includes(r.p)).map((r) => r.p)),
          },
        ],
      },
    ],
  };
  const share: RibbonTab = {
    id: "share",
    label: tr ? "Paylaş" : "Share",
    groups: [
      {
        label: tr ? "Gönder" : "Send",
        items: [
          { label: tr ? "E-posta" : "Email", icon: ic("mail", 32), big: true, disabled: true },
          { label: "Zip", icon: ic("zip", 32), big: true, disabled: true },
          { label: tr ? "Diske yaz" : "Burn to disc", icon: ic("disc"), disabled: true },
          { label: tr ? "Yazdır" : "Print", icon: ic("print"), disabled: true },
          { label: tr ? "Faks" : "Fax", icon: ic("print"), disabled: true },
        ],
      },
      {
        label: tr ? "Paylaşım" : "Share with",
        items: [
          { label: tr ? "Gelişmiş güvenlik" : "Advanced security", icon: ic("shield", 32), big: true, disabled: true },
        ],
      },
    ],
  };
  const manage: RibbonTab = {
    id: "manage",
    label: tr ? "Yönet" : "Manage",
    groups: [
      {
        label: tr ? "Yönet" : "Manage",
        items: [
          {
            label: tr ? "Geri Dönüşüm Kutusunu boşalt" : "Empty Recycle Bin",
            icon: <ShellIcon name="recycle-empty" size={32} />,
            big: true,
            disabled: !rows.length,
            onClick: () => void emptyBin(),
          },
          {
            label: tr ? "Geri Dönüşüm Kutusu özellikleri" : "Recycle Bin properties",
            icon: ic("props", 32),
            big: true,
            onClick: () => showProperties(id, BIN, lang),
          },
        ],
      },
      {
        label: tr ? "Geri yükle" : "Restore",
        items: [
          {
            label: tr ? "Tüm öğeleri geri yükle" : "Restore all items",
            icon: ic("restore", 32),
            big: true,
            disabled: !rows.length,
            onClick: () => restore(rows.map((r) => r.p)),
          },
          {
            label: tr ? "Seçili öğeleri geri yükle" : "Restore the selected items",
            icon: ic("restore", 32),
            big: true,
            disabled: !hasSel,
            onClick: () => restore(paths),
          },
        ],
      },
    ],
  };
  const computer: RibbonTab = {
    id: "computer",
    label: tr ? "Bilgisayar" : "Computer",
    groups: [
      {
        label: tr ? "Konum" : "Location",
        items: [
          { label: tr ? "Özellikler" : "Properties", icon: ic("props", 32), big: true, onClick: properties },
          { label: tr ? "Aç" : "Open", icon: ic("open", 32), big: true, disabled: !hasSel, onClick: openSel },
          { label: tr ? "Yeniden adlandır" : "Rename", icon: ic("rename", 32), big: true, disabled: true },
        ],
      },
      {
        label: tr ? "Ağ" : "Network",
        items: [
          { label: tr ? "Medyaya eriş" : "Access media", icon: <ShellIcon name="devices" size={16} />, disabled: true },
          {
            label: tr ? "Ağ sürücüsüne bağlan" : "Map network drive",
            icon: <ShellIcon name="drive" size={16} />,
            disabled: true,
          },
          {
            label: tr ? "Ağ konumu ekle" : "Add a network location",
            icon: <ShellIcon name="network" size={16} />,
            disabled: true,
          },
        ],
      },
      {
        label: tr ? "Sistem" : "System",
        items: [
          {
            label: tr ? "Ayarları aç" : "Open Settings",
            icon: <ShellIcon name="control" size={32} />,
            big: true,
            onClick: () => open({ kind: "app", app: "settings" }),
          },
          {
            label: tr ? "Program kaldır veya değiştir" : "Uninstall or change a program",
            icon: <ShellIcon name="programs" size={16} />,
            onClick: () => open({ kind: "app", app: "control" }),
          },
          {
            label: tr ? "Sistem özellikleri" : "System properties",
            icon: <ShellIcon name="thispc" size={16} />,
            onClick: () => open({ kind: "app", app: "control", param: "system" }),
          },
          { label: tr ? "Yönet" : "Manage", icon: ic("props"), disabled: true },
        ],
      },
    ],
  };
  const tabs = here === PC ? [computer, view] : inBin ? [home, share, view, manage] : [home, share, view];

  // ---------- items ----------
  const size = layout === "large" ? 96 : layout === "medium" || layout === "tiles" ? 48 : 16;
  const iconEl = (r: Row, s: number) => {
    const img = s >= 48 && r.n.kind === "img" && (r.n.art || r.n.data) ? r.n : null;
    return (
      <span className="ex-icon" style={{ width: s, height: s }}>
        {img ? (
          <span className="ex-thumb">
            {img.art ? (
              <CoverArt seed={img.art.seed} motif={img.art.motif} palette={img.art.palette} variant={img.art.variant} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.data} alt="" />
            )}
          </span>
        ) : (
          <ShellIcon name={r.n.kind === "drive" || !r.n.orig ? nodeIcon(r.n, r.p) : nodeIcon(r.n)} size={s} />
        )}
        {(r.n.kind === "lnk" || r.n.kind === "url") && <LnkArrow size={s} />}
      </span>
    );
  };
  const kb = (n: FNode) => {
    const b = fs.size(n);
    return `${Math.max(Math.ceil(b / 1024), b ? 1 : 0).toLocaleString(locale)} KB`;
  };
  const cols: { key: SortKey; label: string; w: number; get: (r: Row) => string; right?: boolean }[] = [
    { key: "name", label: tr ? "Ad" : "Name", w: inBin || searching ? 200 : 240, get: (r) => r.label },
    ...(inBin
      ? [
          {
            key: "orig" as const,
            label: tr ? "Orijinal Konum" : "Original Location",
            w: 200,
            get: (r: Row) => (r.n.orig ? dirname(r.n.orig) : ""),
          },
          {
            key: "deleted" as const,
            label: tr ? "Silinme Tarihi" : "Date Deleted",
            w: 130,
            get: (r: Row) => (r.n.deleted ? formatStamp(r.n.deleted, lang) : ""),
          },
          { key: "size" as const, label: tr ? "Boyut" : "Size", w: 80, right: true, get: (r: Row) => kb(r.n) },
          { key: "type" as const, label: tr ? "Öğe türü" : "Item type", w: 130, get: (r: Row) => typeLabel(r.n, lang) },
        ]
      : [
          ...(searching
            ? [{ key: "folder" as const, label: tr ? "Klasör" : "Folder", w: 220, get: (r: Row) => dirname(r.p) }]
            : []),
          {
            key: "modified" as const,
            label: tr ? "Değiştirme tarihi" : "Date modified",
            w: 130,
            get: (r: Row) => (r.n.kind === "drive" ? "" : formatStamp(r.n.modified, lang)),
          },
          { key: "type" as const, label: tr ? "Tür" : "Type", w: 140, get: (r: Row) => typeLabel(r.n, lang) },
          {
            key: "size" as const,
            label: tr ? "Boyut" : "Size",
            w: 80,
            right: true,
            get: (r: Row) => (isDir(r.n) ? "" : kb(r.n)),
          },
        ]),
  ];

  const itemEl = (r: Row) => {
    const isSel = sel.includes(r.p);
    const cls = `ex-it ${isSel ? "sel" : ""} ${cutSet.includes(r.p) ? "cut" : ""} ${r.n.hidden ? "hid" : ""} ${drop === r.p ? "drop" : ""}`;
    const folderTarget = isDir(r.n) && !inBin ? r.p : null;
    const nameEl =
      renaming === r.p ? (
        <RenameBox className="ex-rename" initial={r.label} onDone={(v) => void commitRename(r, v)} />
      ) : (
        <span className="ex-name">{r.label}</span>
      );
    const props = {
      "data-p": r.p,
      title: layout === "details" ? undefined : `${r.label}\n${typeLabel(r.n, lang)}`,
      draggable: renaming !== r.p && !inBin && r.n.kind !== "drive",
      onPointerDown: (e: React.PointerEvent) => onItemDown(e, r),
      onClick: (e: React.MouseEvent) => {
        if (!e.ctrlKey && !e.shiftKey && renaming !== r.p) selectOne(r.p);
      },
      onDoubleClick: () => renaming !== r.p && activate(r.p),
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        rowMenu(r, e.clientX, e.clientY);
      },
      onDragStart: (e: React.DragEvent) => {
        const ps = isSel ? paths : [r.p];
        if (!isSel) setSel([r.p]);
        e.dataTransfer.setData(DND_TYPE, JSON.stringify(ps));
        e.dataTransfer.setData("text/plain", ps.join("\n"));
        e.dataTransfer.effectAllowed = "copyMove";
      },
      onDragOver: dragOver(folderTarget),
      onDragLeave: dragLeave,
      onDrop: folderTarget ? dropOn(folderTarget) : undefined,
    };
    if (layout === "details")
      return (
        <div {...props} key={r.p} className={`${cls} ex-row`}>
          {cols.map((c) => (
            <span key={c.key} className={`ex-cell ${c.right ? "r" : ""}`} style={{ width: colW[c.key] ?? c.w }}>
              {c.key === "name" ? (
                <>
                  {iconEl(r, 16)}
                  {nameEl}
                </>
              ) : (
                c.get(r)
              )}
            </span>
          ))}
        </div>
      );
    if (layout === "tiles") {
      const d = r.n.kind === "drive" ? driveFree(r.n) : null;
      return (
        <div {...props} key={r.p} className={`${cls} ex-tile`}>
          {iconEl(r, 48)}
          <span className="ex-tile-txt">
            {nameEl}
            {d ? (
              <>
                <span className={`ex-bar ${d.free / d.total < 0.1 ? "full" : ""}`}>
                  <i style={{ width: `${(1 - d.free / d.total) * 100}%` }} />
                </span>
                <small>
                  {tr
                    ? `${formatSize(d.free, lang)} boş, toplam ${formatSize(d.total, lang)}`
                    : `${formatSize(d.free, lang)} free of ${formatSize(d.total, lang)}`}
                </small>
              </>
            ) : here === PC && !searching ? null : (
              <>
                <small>{typeLabel(r.n, lang)}</small>
                {!isDir(r.n) && <small>{formatSize(fs.size(r.n), lang)}</small>}
              </>
            )}
          </span>
        </div>
      );
    }
    return (
      <div {...props} key={r.p} className={`${cls} ex-ic`}>
        {iconEl(r, size)}
        {nameEl}
      </div>
    );
  };

  const header =
    layout === "details" ? (
      <div className="ex-dh">
        {cols.map((c) => (
          <span
            key={c.key}
            className={`ex-dhc ${c.right ? "r" : ""} ${sort.key === c.key ? "on" : ""}`}
            style={{ width: colW[c.key] ?? c.w }}
            onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : false }))}
          >
            {sort.key === c.key && here !== PC && (
              <svg className="ex-sort" width="8" height="5" viewBox="0 0 8 5">
                <path d={sort.desc ? "M0 0l4 4 4-4" : "M0 5l4-4 4 4"} fill="none" stroke="#97a2b0" />
              </svg>
            )}
            {c.label}
            <i
              className="ex-grip"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const left = e.currentTarget.parentElement!.getBoundingClientRect().left;
                setColW((w) => ({ ...w, [c.key]: Math.max(40, Math.round(e.clientX - left)) }));
              }}
            />
          </span>
        ))}
      </div>
    ) : null;

  const groups: [string, Row[]][] =
    here === PC && !searching
      ? [
          [tr ? "Klasörler" : "Folders", rows.filter((r) => r.group === 0)],
          [tr ? "Aygıtlar ve sürücüler" : "Devices and drives", rows.filter((r) => r.group === 1)],
        ]
      : [["", rows]];

  const empty = !rows.length
    ? here === NET
      ? tr
        ? "Ağ bulma kapalı. Ağ bilgisayarları ve aygıtları görünmüyor."
        : "Network discovery is turned off. Network computers and devices are not visible."
      : searching
        ? tr
          ? "Arama ölçütlerinizle eşleşen öğe yok."
          : "No items match your search."
        : tr
          ? "Bu klasör boş."
          : "This folder is empty."
    : null;

  // ---------- navigation pane ----------
  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const treeRow = (
    key: string,
    target: string | null,
    label: string,
    icon: ShellIconName,
    depth: number,
    kids: (() => ReactNode) | null,
  ): ReactNode => {
    const isOpen = expanded.has(key);
    const dropTarget = target && !target.startsWith("::") ? target : null;
    return (
      <Fragment key={key}>
        <div
          className={`ex-tn ${target && same(target, here) ? "on" : ""} ${dropTarget && drop === dropTarget ? "drop" : ""} ${depth === 0 ? "root" : ""}`}
          style={{ paddingLeft: depth * 14 + 2 }}
          onClick={() => (target ? go(target) : toggle(key))}
          onDoubleClick={() => kids && toggle(key)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (target) treeMenu(target, e.clientX, e.clientY);
          }}
          onDragOver={dragOver(dropTarget)}
          onDragLeave={dragLeave}
          onDrop={dropTarget ? dropOn(dropTarget) : undefined}
        >
          <span
            className={`ex-chev ${isOpen ? "open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (kids) toggle(key);
            }}
          >
            {kids && (
              <svg width="8" height="8" viewBox="0 0 8 8">
                {isOpen ? <path d="M7 1v6H1z" /> : <path d="M2.5.5 6 4 2.5 7.5z" />}
              </svg>
            )}
          </span>
          <ShellIcon name={icon} size={16} />
          <span className="ex-tn-label">{label}</span>
        </div>
        {isOpen && kids?.()}
      </Fragment>
    );
  };
  const folderNode = (root: string, p: string, depth: number): ReactNode => {
    const n = fs.get(p);
    if (!n) return null;
    const subs = fs.list(p, prefs.hidden).filter(isDir);
    return treeRow(
      `${root}|${lc(p)}`,
      p,
      fs.label(n, lang),
      nodeIcon(n, p),
      depth,
      subs.length ? () => subs.map((s) => folderNode(root, join(p, s.name), depth + 1)) : null,
    );
  };
  const tree = (
    <nav className="ex-tree" style={{ width: prefs.navW }}>
      {treeRow("fav", null, tr ? "Sık Kullanılanlar" : "Favorites", "favorites", 0, () => [
        folderNode("fav", KNOWN.desktop, 1),
        folderNode("fav", KNOWN.downloads, 1),
        treeRow("fav|recent", RECENT, locName(RECENT, lang), "clock", 1, null),
      ])}
      {treeRow("pc", PC, locName(PC, lang), "thispc", 0, () => [
        ...KNOWN_ORDER.map((p) => folderNode("pc", p, 1)),
        ...fs.drives().map((d) => folderNode("pc", normalize(d.name), 1)),
      ])}
      {treeRow("net", NET, locName(NET, lang), "network", 0, null)}
    </nav>
  );

  // ---------- side pane ----------
  const pane = (() => {
    if (!prefs.pane) return null;
    const r = single;
    if (prefs.pane === "preview") {
      if (!r || isDir(r.n))
        return (
          <p className="ex-pane-msg">{tr ? "Önizlemek istediğiniz dosyayı seçin." : "Select a file to preview."}</p>
        );
      if (r.n.kind === "img" && (r.n.art || r.n.data))
        return (
          <div className="ex-pane-img">
            {r.n.art ? (
              <CoverArt seed={r.n.art.seed} motif={r.n.art.motif} palette={r.n.art.palette} variant={r.n.art.variant} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.n.data} alt="" />
            )}
          </div>
        );
      if (r.n.kind === "txt" && r.n.text !== undefined)
        return <pre className="ex-pane-text">{r.n.text.slice(0, 4000)}</pre>;
      return <p className="ex-pane-msg">{tr ? "Önizleme yok." : "No preview available."}</p>;
    }
    if (selRows.length > 1)
      return (
        <div className="ex-pane-det">
          <ShellIcon name="file" size={64} />
          <b>{tr ? `${selRows.length} öğe seçildi` : `${selRows.length} items selected`}</b>
        </div>
      );
    const fields: [string, string][] = r
      ? [
          [tr ? "Değiştirme tarihi:" : "Date modified:", formatStamp(r.n.modified, lang)],
          ...(isDir(r.n) ? [] : [[tr ? "Boyut:" : "Size:", formatSize(fs.size(r.n), lang)] as [string, string]]),
          [tr ? "Oluşturma tarihi:" : "Date created:", formatStamp(r.n.created, lang)],
        ]
      : [];
    return (
      <div className="ex-pane-det">
        {r ? iconEl(r, 64) : <ShellIcon name={locIcon(here)} size={64} />}
        <b>{r ? r.label : name}</b>
        <span>{r ? typeLabel(r.n, lang) : tr ? `${rows.length} öğe` : `${rows.length} items`}</span>
        {fields.map(([k, v]) => (
          <span key={k} className="ex-pane-f">
            <em>{k}</em> {v}
          </span>
        ))}
      </div>
    );
  })();

  const selBytes = selRows.every((r) => !isDir(r.n)) ? selRows.reduce((s, r) => s + fs.size(r.n), 0) : 0;

  return (
    <div className={`ex ${focused ? "" : "inactive"} ${inBin ? "ctx" : ""}`}>
      <Ribbon
        tabs={tabs}
        fileLabel={tr ? "Dosya" : "File"}
        fileMenu={[
          { label: tr ? "Yeni pencere aç" : "Open new window", onClick: newWindow, shortcut: "Ctrl+N" },
          { sep: true },
          { label: tr ? "Kapat" : "Close", onClick: close },
        ]}
      />
      <div className="ex-bar-nav">
        <button
          className="ex-nb"
          disabled={hist.i === 0}
          onClick={back}
          title={tr ? "Geri (Alt + Sol Ok)" : "Back (Alt + Left Arrow)"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M14 8H3M7.5 3.5 3 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <button
          className="ex-nb"
          disabled={hist.i >= hist.stack.length - 1}
          onClick={fwd}
          title={tr ? "İleri (Alt + Sağ Ok)" : "Forward (Alt + Right Arrow)"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M2 8h11M8.5 3.5 13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <button className="ex-recent" onClick={recentMenu} title={tr ? "Son konumlar" : "Recent locations"}>
          <svg width="7" height="4" viewBox="0 0 7 4">
            <path d="M0 0h7L3.5 4z" fill="currentColor" />
          </svg>
        </button>
        <button
          className="ex-nb"
          disabled={!upTo}
          onClick={up}
          title={tr ? "Yukarı (Alt + Yukarı Ok)" : "Up (Alt + Up Arrow)"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M8 14V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <div
          className={`ex-addr ${addr !== null ? "edit" : ""}`}
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (addr === null && (t === e.currentTarget || t.classList.contains("ex-crumbs")))
              setAddr(isPath ? here : name);
          }}
        >
          <ShellIcon name={locIcon(here)} size={16} />
          {addr === null ? (
            <div className="ex-crumbs">
              {crumbs.map((c, i) => (
                <Fragment key={c}>
                  <button className="ex-crumb" onClick={() => (i < crumbs.length - 1 || searching ? go(c) : undefined)}>
                    {locName(c, lang)}
                  </button>
                  {(i < crumbs.length - 1 || !searching) && (
                    <button className="ex-crumb-chev" onClick={(e) => crumbMenu(c, e)}>
                      <svg width="5" height="8" viewBox="0 0 5 8">
                        <path d="M1 0l4 4-4 4" fill="none" stroke="currentColor" />
                      </svg>
                    </button>
                  )}
                </Fragment>
              ))}
              {searching && <span className="ex-crumb last">{title}</span>}
            </div>
          ) : (
            <input
              className="ex-addr-in"
              autoFocus
              value={addr}
              spellCheck={false}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setAddr(e.target.value)}
              onBlur={() => setAddr(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitAddr(e.currentTarget.value);
                else if (e.key === "Escape") setAddr(null);
              }}
            />
          )}
          <button className="ex-refresh" onClick={refresh} title={`${tr ? "Yenile" : "Refresh"} (F5)`}>
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M13 8a5 5 0 1 1-1.5-3.6M12 1.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <div className="ex-search">
          <input
            ref={searchBox}
            value={query}
            spellCheck={false}
            placeholder={tr ? `Ara: ${name}` : `Search ${name}`}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel([]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
          />
          {query ? (
            <button onClick={() => setQuery("")} aria-label="clear">
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M1 1l8 8M9 1 1 9" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16">
              <circle cx="9.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M6.3 9.7 1.5 14.5" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          )}
        </div>
      </div>

      <div className="ex-main">
        {prefs.nav && (
          <>
            {tree}
            <div
              className="ex-split"
              onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const left = e.currentTarget.parentElement!.getBoundingClientRect().left;
                setPref("navW", Math.round(Math.max(120, Math.min(420, e.clientX - left))));
              }}
            />
          </>
        )}
        <div
          ref={content}
          className={`ex-content v-${layout}`}
          tabIndex={-1}
          onPointerDown={onBgDown}
          onPointerMove={onBgMove}
          onPointerUp={() => setBand(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!(e.target as HTMLElement).closest("[data-p]")) bgMenu(e.clientX, e.clientY);
          }}
          onDragOver={dragOver(writable || inBin ? here : null)}
          onDragLeave={dragLeave}
          onDrop={writable || inBin ? dropOn(here) : undefined}
        >
          {header}
          {groups.map(([label, list]) =>
            list.length || !label ? (
              <Fragment key={label}>
                {label && (
                  <div className="ex-group">
                    <span>
                      {label} ({list.length})
                    </span>
                    <i />
                  </div>
                )}
                <div className={`ex-items v-${layout}`}>{list.map(itemEl)}</div>
              </Fragment>
            ) : null,
          )}
          {empty && <p className="ex-empty">{empty}</p>}
          {band && Math.abs(band.x1 - band.x0) + Math.abs(band.y1 - band.y0) > 3 && (
            <div
              className="ex-band"
              style={{
                left: Math.min(band.x0, band.x1),
                top: Math.min(band.y0, band.y1),
                width: Math.abs(band.x1 - band.x0),
                height: Math.abs(band.y1 - band.y0),
              }}
            />
          )}
        </div>
        {pane && <aside className="ex-pane">{pane}</aside>}
      </div>

      <StatusBar>
        <span>{tr ? `${rows.length} öğe` : `${rows.length} item${rows.length === 1 ? "" : "s"}`}</span>
        {selRows.length > 0 && (
          <span>
            {tr ? `${selRows.length} öğe seçildi` : `${selRows.length} item${selRows.length === 1 ? "" : "s"} selected`}
            {selBytes > 0 && <span className="ex-sb-size">{formatSize(selBytes, lang)}</span>}
          </span>
        )}
        <span className="ex-sb-views">
          <button
            className={layout === "details" ? "on" : ""}
            onClick={() => setLayout("details")}
            title={tr ? "Her öğe hakkındaki bilgileri gösterir" : "Displays information about each item in the window."}
          >
            {ic("details")}
          </button>
          <button
            className={layout === "large" ? "on" : ""}
            onClick={() => setLayout("large")}
            title={tr ? "Öğeleri büyük küçük resimlerle gösterir" : "Display items by using large thumbnails."}
          >
            {ic("large")}
          </button>
        </span>
      </StatusBar>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
