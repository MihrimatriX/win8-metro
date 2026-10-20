"use client";
/**
 * WordPad as in Windows 8.1: the ribbon (File menu, Home and View tabs), a white page on the grey workspace
 * with a ruler, a zoom status bar, and rich-text editing on a contentEditable page.
 * Documents are .rtf nodes in the virtual file system holding HTML; .txt files open (and save) as plain text.
 * The "save changes?" task dialog, Find / Replace, text search and printing come from Notepad.
 */
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useOS } from "@/lib/os";
import { fs, basename, dirname, extname, normalize, KNOWN, type FNode } from "@/lib/fs";
import { wm } from "@/lib/wm";
import { CoverArt } from "../../CoverArt";
import { Ribbon, ContextMenu, Btn, useWindow, useWinKeys, useCloseGuard, type MenuItem, type RibbonTab } from "../ui";
import { fileDialog, msgBox, openDialog, type FileFilter } from "../dialogs";
import { askSave, openFind, printHtml, sameText, searchText, type FindState, type FindTarget } from "./Notepad";
import "./wordpad.css";

type Lang = "tr" | "en";
type Wrap = "none" | "window" | "ruler";
type Units = "cm" | "in";
type Paper = "A4" | "A5" | "Letter" | "Legal";
type Page = {
  paper: Paper;
  orient: "portrait" | "landscape";
  left: number;
  right: number;
  top: number;
  bottom: number;
};
type Prefs = { ruler: boolean; status: boolean; wrap: Wrap; units: Units; page: Page };
type Fmt = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sub: boolean;
  sup: boolean;
  ul: boolean;
  ol: boolean;
  align: "left" | "center" | "right" | "justify";
  font: string;
  size: number;
  line: string;
  after: boolean;
};

const PREFS_KEY = "afu-metro:v2:wordpad";
const MM = 96 / 25.4;
const PAPERS: Record<Paper, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};
const FONTS: Record<string, string> = {
  Arial: `Arial, "Liberation Sans", Helvetica, sans-serif`,
  Calibri: `Calibri, Carlito, "Segoe UI", sans-serif`,
  Cambria: `Cambria, Caladea, Georgia, serif`,
  "Comic Sans MS": `"Comic Sans MS", "Comic Neue", cursive`,
  Consolas: `Consolas, "Liberation Mono", monospace`,
  "Courier New": `"Courier New", Courier, monospace`,
  Georgia: `Georgia, "DejaVu Serif", serif`,
  "Lucida Console": `"Lucida Console", Monaco, monospace`,
  "Segoe UI": `"Segoe UI", Selawik, sans-serif`,
  Tahoma: `Tahoma, Verdana, sans-serif`,
  "Times New Roman": `"Times New Roman", "Liberation Serif", Times, serif`,
  "Trebuchet MS": `"Trebuchet MS", sans-serif`,
  Verdana: `Verdana, "DejaVu Sans", sans-serif`,
};
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const ZOOMS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 500];
const BLOCKS = "p,div,li,h1,h2,h3,h4,h5,h6,blockquote";
/** The page's own look, also used for printing. WordPad's defaults: Calibri 11, 1.15 lines, 10pt after paragraphs. */
const DOC_CSS = `.wp-doc{font:11pt ${FONTS.Calibri};color:#000;white-space:pre-wrap;overflow-wrap:break-word;tab-size:48px}
.wp-doc p,.wp-doc li{margin:0 0 10pt;line-height:1.15}.wp-doc ul,.wp-doc ol{margin:0;padding-left:0.5in}
.wp-doc img{max-width:100%}`;
const EMPTY: Fmt = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  sub: false,
  sup: false,
  ul: false,
  ol: false,
  align: "left",
  font: "Calibri",
  size: 11,
  line: "1.15",
  after: true,
};

function loadPrefs(lang: Lang): Prefs {
  const def: Prefs = {
    ruler: true,
    status: true,
    wrap: "ruler",
    units: lang === "tr" ? "cm" : "in",
    page: {
      paper: lang === "tr" ? "A4" : "Letter",
      orient: "portrait",
      left: 31.75,
      right: 31.75,
      top: 25.4,
      bottom: 25.4,
    },
  };
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    return { ...def, ...raw, page: { ...def.page, ...raw.page } };
  } catch {
    return def;
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Plain text as paragraphs. */
const textToHtml = (t: string) =>
  t
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => `<p>${esc(l) || "<br>"}</p>`)
    .join("");

/** HTML from a file, minus anything that could run or restyle the desktop. */
function sanitize(html: string): string {
  const d = new DOMParser().parseFromString(html, "text/html");
  d.querySelectorAll("script,style,link,meta,base,iframe,frame,object,embed,form,input,button,textarea,select").forEach(
    (e) => e.remove(),
  );
  d.body.querySelectorAll("*").forEach((e) => {
    for (const a of [...e.attributes])
      if (/^on/i.test(a.name) || (/(href|src|action)$/i.test(a.name) && /^\s*(javascript|vbscript):/i.test(a.value)))
        e.removeAttribute(a.name);
  });
  // The page keeps white space (pre-wrap), so source formatting between tags must go.
  const w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
  const blank: Text[] = [];
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    if (!n.data.includes("\n")) continue;
    if (!n.data.trim()) blank.push(n);
    else n.data = n.data.replace(/\s*\n\s*/g, " ");
  }
  blank.forEach((n) => n.remove());
  return d.body.innerHTML;
}

/** Editor HTML for a file node: HTML for .rtf / .html, paragraphs for anything else. */
function nodeHtml(n: FNode): string {
  const t = n.text ?? "";
  // ponytail: real RTF is reduced to its text; a proper RTF reader if seeded files ever need formatting.
  if (/^\{\\rtf/.test(t))
    return textToHtml(t.replace(/\\par[d]?\b ?/g, "\n").replace(/\{\\\*[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, ""));
  return n.kind === "rtf" || n.kind === "html" ? sanitize(t) : textToHtml(t);
}

/** The document as plain text (one line per paragraph, CRLF). */
const plainText = (d: HTMLElement) =>
  [...d.childNodes]
    .map((n) => (n instanceof HTMLElement ? n.innerText.replace(/\n+$/, "") : (n.textContent ?? "")))
    .join("\n")
    .replace(/\n/g, "\r\n");

/** A picture from the file system as an <img> source (procedural art is rendered to an SVG data URL). */
function imageSrc(n: FNode): string | null {
  if (n.data) return n.data;
  if (!n.art) return null;
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(<CoverArt {...n.art!} />));
  const svg = host.querySelector("svg");
  svg?.setAttribute("width", "320");
  svg?.setAttribute("height", "180");
  const src = svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
    : null;
  root.unmount();
  return src;
}

/** Character offset of a DOM position inside `root`'s text. */
function textOffset(root: Node, node: Node, off: number) {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(node, off);
  return r.toString().length;
}

/** Range over characters [start, end) of `root`'s text. */
function rangeFor(root: Node, start: number, end: number): Range {
  const r = document.createRange();
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let started = false;
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    if (!started && start <= pos + n.length) {
      r.setStart(n, start - pos);
      started = true;
    }
    if (started && end <= pos + n.length) {
      r.setEnd(n, end - pos);
      break;
    }
    pos += n.length;
  }
  return r;
}

/** Paint a Find match while the Find dialog has the focus (CSS Custom Highlight API, where available). */
function mark(r: Range | null) {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  if (r) CSS.highlights.set("wp-find", new Highlight(r));
  else CSS.highlights.delete("wp-find");
}

const toPt = (v: string) => {
  const n = parseFloat(v);
  if (!n) return 0;
  return v.endsWith("px") ? Math.round(n * 1.5) / 2 : v.endsWith("pt") ? n : 0;
};

/** What the ribbon shows for the current selection. */
function readFmt(d: HTMLElement): Fmt {
  const s = window.getSelection();
  let el: Node | null = s?.anchorNode ?? null;
  if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  let font = "";
  let size = 0;
  let block: HTMLElement | null = null;
  for (let e = el as HTMLElement | null; e && e !== d; e = e.parentElement) {
    font ||= e.style?.fontFamily || e.getAttribute("face") || "";
    size ||= toPt(e.style?.fontSize ?? "");
    if (!block && e.matches(BLOCKS)) block = e;
  }
  const q = (c: string) => document.queryCommandState(c);
  return {
    bold: q("bold"),
    italic: q("italic"),
    underline: q("underline"),
    strike: q("strikeThrough"),
    sub: q("subscript"),
    sup: q("superscript"),
    ul: q("insertUnorderedList"),
    ol: q("insertOrderedList"),
    align: q("justifyCenter") ? "center" : q("justifyRight") ? "right" : q("justifyFull") ? "justify" : "left",
    font: font.split(",")[0].replace(/["']/g, "").trim() || "Calibri",
    size: size || 11,
    line: block?.style.lineHeight || "1.15",
    after: block?.style.marginBottom !== "0px",
  };
}

// ---------- icons ----------

const svg = (s: number, body: ReactNode) => (
  <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
    {body}
  </svg>
);
const lines = (rows: [number, number][], y0 = 3) =>
  rows.map(([x, w], i) => <rect key={i} x={x} y={y0 + i * 3} width={w} height="1.4" fill="#3c3c3c" />);
const I = {
  paste: svg(
    32,
    <>
      <rect x="5" y="5" width="18" height="23" rx="1" fill="#c8a165" stroke="#8a6a3a" />
      <rect x="10" y="3" width="8" height="5" rx="1" fill="#e8e8e8" stroke="#777" />
      <rect x="13" y="12" width="15" height="17" fill="#fff" stroke="#6d8fb5" />
      {[16, 19, 22, 25].map((y) => (
        <rect key={y} x="15.5" y={y} width="10" height="1.2" fill="#8aa6c8" />
      ))}
    </>,
  ),
  cut: svg(
    16,
    <g fill="none" stroke="#333" strokeWidth="1.2">
      <circle cx="4.5" cy="12" r="2.2" />
      <circle cx="11.5" cy="12" r="2.2" />
      <path d="M6 10.4 11.5 1.5M10 10.4 4.5 1.5" />
    </g>,
  ),
  copy: svg(
    16,
    <>
      <rect x="1.5" y="1.5" width="8" height="10" fill="#fff" stroke="#6d8fb5" />
      <rect x="6.5" y="4.5" width="8" height="10" fill="#fff" stroke="#6d8fb5" />
      {lines(
        [
          [8, 5],
          [8, 5],
          [8, 5],
        ],
        7.5,
      )}
    </>,
  ),
  outdent: svg(
    16,
    <>
      {lines(
        [
          [1, 14],
          [7, 8],
          [7, 8],
          [1, 14],
        ],
        2.5,
      )}
      <path d="M5 6.5v4l-3.5-2z" fill="#1e70c8" />
    </>,
  ),
  indent: svg(
    16,
    <>
      {lines(
        [
          [1, 14],
          [7, 8],
          [7, 8],
          [1, 14],
        ],
        2.5,
      )}
      <path d="M1.5 6.5v4l3.5-2z" fill="#1e70c8" />
    </>,
  ),
  bullets: svg(
    16,
    <>
      {[3, 8, 13].map((y) => (
        <circle key={y} cx="2.5" cy={y} r="1.4" fill="#1e70c8" />
      ))}
      {[2.3, 7.3, 12.3].map((y) => (
        <rect key={y} x="6" y={y} width="9" height="1.4" fill="#3c3c3c" />
      ))}
    </>,
  ),
  spacing: svg(
    16,
    <>
      {lines(
        [
          [7, 8],
          [7, 8],
          [7, 8],
          [7, 8],
        ],
        2.5,
      )}
      <path d="M3 1.5 5.2 4.5H.8zM3 14.5.8 11.5h4.4z M2.4 4h1.2v8H2.4z" fill="#1e70c8" />
    </>,
  ),
  left: svg(
    16,
    lines(
      [
        [1, 14],
        [1, 9],
        [1, 14],
        [1, 9],
      ],
      2.5,
    ),
  ),
  center: svg(
    16,
    lines(
      [
        [1, 14],
        [3.5, 9],
        [1, 14],
        [3.5, 9],
      ],
      2.5,
    ),
  ),
  right: svg(
    16,
    lines(
      [
        [1, 14],
        [6, 9],
        [1, 14],
        [6, 9],
      ],
      2.5,
    ),
  ),
  justify: svg(
    16,
    lines(
      [
        [1, 14],
        [1, 14],
        [1, 14],
        [1, 14],
      ],
      2.5,
    ),
  ),
  picture: svg(
    32,
    <>
      <rect x="3" y="6" width="26" height="20" fill="#bfe1fb" stroke="#4a7ab0" />
      <circle cx="22" cy="12" r="2.6" fill="#f6c343" />
      <path d="M4 25 12 15l5 6 3-3 8 7z" fill="#4c9a3f" />
    </>,
  ),
  date: svg(
    32,
    <>
      <rect x="3" y="6" width="20" height="19" fill="#fff" stroke="#6d6d6d" />
      <rect x="3" y="6" width="20" height="5" fill="#d9442b" />
      {[14, 18].flatMap((y) =>
        [6, 10, 14, 18].map((x) => <rect key={`${x}${y}`} x={x} y={y} width="2.4" height="2.4" fill="#888" />),
      )}
      <circle cx="22" cy="22" r="7.5" fill="#fff" stroke="#1e70c8" strokeWidth="1.5" />
      <path d="M22 17.5V22h3.5" fill="none" stroke="#333" strokeWidth="1.4" />
    </>,
  ),
  find: svg(
    16,
    <g fill="#3c6ea8" stroke="#244a75">
      <circle cx="4.5" cy="10" r="3.4" fill="#cfe4f8" />
      <circle cx="11.5" cy="10" r="3.4" fill="#cfe4f8" />
      <rect x="6" y="5" width="4" height="4" />
      <rect x="2.5" y="2.5" width="3" height="5" />
      <rect x="10.5" y="2.5" width="3" height="5" />
    </g>,
  ),
  replace: svg(
    16,
    <>
      <text x="0" y="7" fontSize="7.5" fontFamily="Segoe UI, sans-serif" fill="#333">
        ab
      </text>
      <text x="7" y="15" fontSize="7.5" fontFamily="Segoe UI, sans-serif" fill="#1e70c8">
        ac
      </text>
      <path d="M3 9v3.5h3" fill="none" stroke="#1e70c8" />
    </>,
  ),
  selectAll: svg(
    16,
    <>
      <rect x="1.5" y="1.5" width="13" height="13" fill="#e5f1fb" stroke="#1e70c8" strokeDasharray="2 1" />
      {lines(
        [
          [4, 8],
          [4, 8],
          [4, 8],
        ],
        5,
      )}
    </>,
  ),
  zoomIn: svg(
    32,
    <>
      <circle cx="13" cy="13" r="9" fill="#e5f1fb" stroke="#3c6ea8" strokeWidth="2" />
      <path d="M19.5 19.5 28 28" stroke="#5a5a5a" strokeWidth="4" />
      <path d="M8.5 13h9M13 8.5v9" stroke="#1e70c8" strokeWidth="2.4" />
    </>,
  ),
  zoomOut: svg(
    32,
    <>
      <circle cx="13" cy="13" r="9" fill="#e5f1fb" stroke="#3c6ea8" strokeWidth="2" />
      <path d="M19.5 19.5 28 28" stroke="#5a5a5a" strokeWidth="4" />
      <path d="M8.5 13h9" stroke="#1e70c8" strokeWidth="2.4" />
    </>,
  ),
  zoom100: svg(
    32,
    <>
      <rect x="3" y="7" width="26" height="18" fill="#fff" stroke="#6d6d6d" />
      <text
        x="16"
        y="20.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fontFamily="Segoe UI, sans-serif"
        fill="#1e70c8"
      >
        100
      </text>
    </>,
  ),
  wrap: svg(
    32,
    <>
      <rect x="4" y="4" width="22" height="24" fill="#fff" stroke="#6d6d6d" />
      {[8, 12, 20, 24].map((y) => (
        <rect key={y} x="7" y={y} width={y === 12 ? 12 : 16} height="1.6" fill="#555" />
      ))}
      <path d="M20 16h6v-4" fill="none" stroke="#1e70c8" strokeWidth="1.6" />
      <path d="M7 16h12M10 13.5 7 16l3 2.5" fill="none" stroke="#1e70c8" strokeWidth="1.6" />
    </>,
  ),
  units: svg(
    32,
    <>
      <rect x="2" y="11" width="28" height="10" fill="#f6dc8c" stroke="#a48a3c" />
      {[5, 9, 13, 17, 21, 25].map((x, i) => (
        <rect key={x} x={x} y="11" width="1" height={i % 2 ? 3 : 5} fill="#6d5a23" />
      ))}
    </>,
  ),
};

// ---------- small ribbon controls ----------

/** A small ribbon toggle button. Mouse-down doesn't take the focus, so the page keeps its selection. */
function Tb({
  on,
  title,
  onClick,
  children,
}: {
  on?: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className={`wp-tb ${on ? "on" : ""}`} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

/** A menu entry that hands its `pick` value to the dropdown's `onPick`. */
type Pick = { label: string; pick: string; icon?: ReactNode; checked?: boolean; radio?: boolean };

/** A dropdown arrow (or a whole dropdown button) opening a menu under itself. */
function Drop({
  title,
  items,
  onPick,
  children,
}: {
  title: string;
  items: (MenuItem | Pick)[];
  onPick?: (v: string) => void;
  children?: ReactNode;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const menu = items.map((it): MenuItem => ("pick" in it ? { ...it, onClick: () => onPick?.(it.pick) } : it));
  return (
    <>
      <button
        className={`wp-tb ${children ? "" : "wp-arrow"} ${at ? "on" : ""}`}
        title={title}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.left, y: r.bottom });
        }}
      >
        {children}
        <span className="wp-caret">▾</span>
      </button>
      {at && <ContextMenu x={at.x} y={at.y} items={menu} onClose={() => setAt(null)} />}
    </>
  );
}

const swatch = (c: string) => <i className="wp-swatch" style={{ background: c }} />;

// =====================================================================================================

export default function WordPadApp() {
  const { id, win, focused, setTitle } = useWindow();
  const { lang, openApp } = useOS();
  const tr = lang === "tr";
  const L = (a: string, b: string) => (tr ? a : b);
  const untitled = L("Belge", "Document");

  const [initial] = useState(() => {
    const p = win.arg ? normalize(win.arg) : null;
    const n = p ? fs.get(p) : null;
    const ok = !!n && n.kind !== "dir" && n.kind !== "drive";
    return { path: ok ? p : null, html: ok ? nodeHtml(n) : "<p><br></p>", missing: ok ? null : p };
  });
  const [path, setPath] = useState(initial.path);
  const [dirty, setDirty] = useState(false);
  const [prefs, setPrefs] = useState(() => loadPrefs(lang));
  const [zoom, setZoom] = useState(100);
  const [fmt, setFmt] = useState<Fmt>(EMPTY);
  const [color, setColor] = useState("#c00000");
  const [hilite, setHilite] = useState("#ffff00");
  const [ctx, setCtx] = useState<{ x: number; y: number; sel: boolean } | null>(null);
  const doc = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const work = useRef<HTMLDivElement>(null);
  /** The last selection inside the page, put back before every command. */
  const sel = useRef<Range | null>(null);
  /** Fallback clipboard (HTML) when the browser won't let us read the real one. */
  const clip = useRef("");
  const findState = useRef<FindState>({ term: "", repl: "", matchCase: false, up: false, wholeWord: false });
  const appName = "WordPad";

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* not remembered */
    }
  }, [prefs]);
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    setTitle(`${path ? basename(path) : untitled} - WordPad`);
  }, [path, untitled, setTitle]);

  // Load the opening document; complain when the path given isn't there.
  const onMount = useEffectEvent(() => {
    const d = doc.current;
    if (!d) return;
    d.innerHTML = initial.html;
    document.execCommand("defaultParagraphSeparator", false, "p");
    if (initial.missing)
      void msgBox(id, {
        title: appName,
        text: tr ? `${initial.missing} bulunamıyor.` : `Cannot find ${initial.missing}.`,
        icon: "warning",
        buttons: [tr ? "Tamam" : "OK"],
      });
  });
  useEffect(() => onMount(), []);

  // Follow the selection: remember it and light up the ribbon.
  useEffect(() => {
    const on = () => {
      const d = doc.current;
      const s = window.getSelection();
      if (!d || !s?.rangeCount || !d.contains(s.anchorNode)) return;
      sel.current = s.getRangeAt(0).cloneRange();
      mark(null);
      setFmt(readFmt(d));
    };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);

  // ---------- editing ----------

  const select = (r: Range) => {
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    sel.current = r.cloneRange();
  };

  /** Focus the page with its last selection (or the caret at the end). */
  const restore = () => {
    const d = doc.current;
    if (!d) return false;
    if (document.activeElement === d) return true;
    d.focus({ preventScroll: true });
    const r = sel.current && d.contains(sel.current.startContainer) ? sel.current : null;
    if (r) select(r);
    else {
      const end = document.createRange();
      end.selectNodeContents(d);
      end.collapse(false);
      select(end);
    }
    return true;
  };

  // Activating the window puts the caret back on the page.
  const onActivate = useEffectEvent(() => restore());
  useEffect(() => {
    if (focused) onActivate();
  }, [focused]);

  const refresh = () => doc.current && setFmt(readFmt(doc.current));

  const exec = (cmd: string, val?: string) => {
    if (!restore()) return;
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(cmd, false, val);
    refresh();
  };

  /** Run `fn` on the page, then give the keyboard back to whoever had it (the Find dialog). */
  const onPage = (fn: () => void) => {
    const back = document.activeElement as HTMLElement | null;
    restore();
    fn();
    const s = window.getSelection();
    if (s?.rangeCount) sel.current = s.getRangeAt(0).cloneRange();
    if (back && back !== doc.current) back.focus({ preventScroll: true });
  };

  const setSize = (pt: number) => {
    const d = doc.current;
    if (!d || !restore()) return;
    // ponytail: with nothing selected the size isn't remembered for typing; a typing-style span if that matters.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("fontSize", false, "7");
    const made: HTMLElement[] = [];
    d.querySelectorAll('font[size="7"]').forEach((f) => {
      const sp = document.createElement("span");
      sp.style.fontSize = `${pt}pt`;
      sp.append(...f.childNodes);
      sp.querySelectorAll<HTMLElement>("[style]").forEach((x) => x.style.removeProperty("font-size"));
      f.replaceWith(sp);
      made.push(sp);
    });
    if (made.length) {
      const r = document.createRange();
      r.setStartBefore(made[0]);
      r.setEndAfter(made[made.length - 1]);
      select(r);
      setDirty(true);
    }
    refresh();
  };
  const grow = (dir: 1 | -1) => {
    const next = dir > 0 ? SIZES.find((s) => s > fmt.size) : [...SIZES].reverse().find((s) => s < fmt.size);
    if (next) setSize(next);
  };

  /** The paragraphs the selection touches (wrapping loose text in one first). */
  const blocks = (): HTMLElement[] => {
    const d = doc.current;
    const r = restore() ? sel.current : null;
    if (!d || !r) return [];
    const find = () =>
      [...d.querySelectorAll<HTMLElement>(BLOCKS)].filter((b) => r.intersectsNode(b) && !b.querySelector(BLOCKS));
    let out = find();
    if (!out.length) {
      document.execCommand("formatBlock", false, "p");
      out = find();
    }
    return out;
  };
  const lineSpacing = (v: string) => {
    blocks().forEach((b) => (b.style.lineHeight = v));
    setDirty(true);
    refresh();
  };
  const spaceAfter = (on: boolean) => {
    blocks().forEach((b) => (b.style.marginBottom = on ? "" : "0px"));
    setDirty(true);
    refresh();
  };

  const list = (type: string | null) => {
    if (type === null) {
      if (fmt.ul) exec("insertUnorderedList");
      if (fmt.ol) exec("insertOrderedList");
      return;
    }
    if (type === "disc") return void (!fmt.ul && exec("insertUnorderedList"));
    if (!fmt.ol) exec("insertOrderedList");
    const a = window.getSelection()?.anchorNode;
    const ol = (a instanceof Element ? a : a?.parentElement)?.closest("ol");
    if (ol) ol.style.listStyleType = type;
    setDirty(true);
  };

  const copyHtml = () => {
    const r = sel.current;
    if (!r || r.collapsed) return;
    const box = document.createElement("div");
    box.append(r.cloneContents());
    clip.current = box.innerHTML;
  };

  const edit = {
    cut: () => (copyHtml(), exec("cut")),
    copy: () => (copyHtml(), exec("copy")),
    paste: async () => {
      let html = "";
      let text = "";
      try {
        for (const it of await navigator.clipboard.read()) {
          if (it.types.includes("text/html")) html = await (await it.getType("text/html")).text();
          else if (it.types.includes("text/plain")) text = await (await it.getType("text/plain")).text();
        }
      } catch {
        html = clip.current; // no permission: use what was copied here
      }
      if (html) exec("insertHTML", sanitize(html));
      else if (text) exec("insertText", text);
    },
    selectAll: () => {
      const d = doc.current;
      if (!d || !restore()) return;
      const r = document.createRange();
      r.selectNodeContents(d);
      select(r);
    },
  };

  // ---------- files ----------

  const filters: FileFilter[] = [
    { label: L("Zengin Metin Biçimi (RTF) (*.rtf)", "Rich Text Format (RTF) (*.rtf)"), exts: ["rtf"] },
    { label: L("Metin Belgesi (*.txt)", "Text Document (*.txt)"), exts: ["txt"] },
    { label: L("Tüm Belgeler (*.*)", "All Documents (*.*)"), exts: ["*"] },
  ];

  const load = (p: string | null, html: string) => {
    const d = doc.current;
    if (!d) return;
    d.innerHTML = html;
    sel.current = null;
    setPath(p);
    setDirty(false);
    work.current?.scrollTo(0, 0);
    restore();
  };

  const writeTo = async (p: string): Promise<boolean> => {
    const d = doc.current;
    if (!d) return false;
    const txt = extname(p) === "txt";
    if (txt) {
      const r = await msgBox(id, {
        title: appName,
        text: tr
          ? "Belgeyi Yalnızca Metin biçiminde kaydetmek üzeresiniz; bu, tüm biçimlendirmeyi kaldıracaktır. Bunu yapmak istediğinizden emin misiniz?"
          : "You are about to save the document in a Text-Only format, which will remove all formatting. Are you sure you want to do this?",
        icon: "warning",
        buttons: tr ? ["Evet", "Hayır"] : ["Yes", "No"],
      });
      if (r !== 0) return false;
    }
    try {
      fs.write(p, { text: txt ? plainText(d) : d.innerHTML });
    } catch {
      await msgBox(id, {
        title: appName,
        text: tr
          ? `${p}\nBelge kaydedilemedi. Klasör bulunamadı.`
          : `${p}\nThe document could not be saved. The folder doesn't exist.`,
        icon: "error",
        buttons: [L("Tamam", "OK")],
      });
      return false;
    }
    setPath(p);
    setDirty(false);
    return true;
  };

  const saveAs = async (): Promise<boolean> => {
    const p = await fileDialog(id, {
      mode: "save",
      lang,
      filters,
      name: path ? basename(path) : untitled,
      dir: path ? dirname(path) : KNOWN.documents,
    });
    return p ? writeTo(p) : false;
  };
  const save = async () => (path ? writeTo(path) : saveAs());

  const confirmSave = async (): Promise<boolean> => {
    if (!dirty) return true;
    const name = path ? basename(path) : untitled;
    const r = await askSave(
      id,
      appName,
      tr ? `Değişiklikleri ${name} dosyasına kaydetmek istiyor musunuz?` : `Do you want to save changes to ${name}?`,
      lang,
    );
    if (r === 0) return save();
    return r === 1;
  };
  useCloseGuard(confirmSave, dirty);

  const newDoc = async () => {
    if (await confirmSave()) load(null, "<p><br></p>");
  };

  const openDoc = async () => {
    if (!(await confirmSave())) return;
    const p = await fileDialog(id, { mode: "open", lang, filters, dir: path ? dirname(path) : KNOWN.documents });
    const n = p ? fs.get(p) : null;
    if (p && n && n.kind !== "dir" && n.kind !== "drive") load(normalize(p), nodeHtml(n));
  };

  const pageSize = () => {
    const [w, h] = PAPERS[prefs.page.paper];
    return prefs.page.orient === "portrait" ? [w, h] : [h, w];
  };

  const print = () => {
    const pg = prefs.page;
    printHtml(
      path ? basename(path) : untitled,
      `<div class="wp-doc">${doc.current?.innerHTML ?? ""}</div>`,
      `@page{size:${pageSize().join("mm ")}mm;margin:${pg.top}mm ${pg.right}mm ${pg.bottom}mm ${pg.left}mm}body{margin:0}${DOC_CSS}`,
    );
  };

  const pageDlg = () =>
    openDialog(id, {
      title: L("Sayfa Yapısı", "Page Setup"),
      w: 470,
      h: 300,
      render: (close) => (
        <PageDlg
          lang={lang}
          page={prefs.page}
          close={close}
          apply={(p) => {
            setPref("page", p);
            close();
          }}
        />
      ),
    });

  const picture = async () => {
    const p = await fileDialog(id, {
      mode: "open",
      lang,
      title: L("Resim Seç", "Select Picture"),
      dir: KNOWN.pictures,
      filters: [
        {
          label: L("Tüm Resimler", "All Pictures") + " (*.png;*.jpg;*.gif;*.bmp)",
          exts: ["png", "jpg", "jpeg", "gif", "bmp", "webp"],
        },
      ],
    });
    const n = p ? fs.get(p) : null;
    const src = n ? imageSrc(n) : null;
    if (src) exec("insertImage", src);
  };

  const dateDlg = () =>
    openDialog(id, {
      title: L("Tarih ve Saat", "Date and Time"),
      w: 300,
      h: 300,
      render: (close) => (
        <DateDlg
          lang={lang}
          close={close}
          pick={(s) => {
            close();
            exec("insertText", s);
          }}
        />
      ),
    });

  // ---------- find / replace ----------

  const target = (): FindTarget => ({
    find: (term, o) => {
      const d = doc.current;
      if (!d) return false;
      const s = sel.current;
      const from = s && d.contains(s.endContainer) ? textOffset(d, s.endContainer, s.endOffset) : 0;
      const i = searchText(d.textContent ?? "", term, from, o, lang);
      if (i < 0) return false;
      const r = rangeFor(d, i, i + term.length);
      sel.current = r;
      mark(r);
      // Scroll the workspace (only) so the match is in view.
      const w = work.current;
      const a = r.getBoundingClientRect();
      const b = w?.getBoundingClientRect();
      if (w && b && (a.top < b.top || a.bottom > b.bottom)) w.scrollTop += a.top - b.top - b.height / 3;
      if (w && b && (a.left < b.left || a.right > b.right)) w.scrollLeft += a.left - b.left - 40;
      return true;
    },
    replace: (term, repl, o) => {
      const r = sel.current;
      if (r && !r.collapsed && sameText(r.toString(), term, o, lang))
        onPage(() => document.execCommand(repl ? "insertText" : "delete", false, repl));
      return target().find(term, o);
    },
    replaceAll: (term, repl, o) => {
      const d = doc.current;
      if (!d) return 0;
      let n = 0;
      onPage(() => {
        for (let at = 0, i = searchText(d.textContent ?? "", term, 0, o, lang); i >= 0; n++) {
          select(rangeFor(d, i, i + term.length));
          document.execCommand(repl ? "insertText" : "delete", false, repl);
          at = i + repl.length;
          i = searchText(d.textContent ?? "", term, at, o, lang);
        }
      });
      mark(null);
      return n;
    },
  });
  const notFound = () => L("WordPad belgeyi aramayı bitirdi.", "WordPad has finished searching the document.");
  const find = (replace: boolean) =>
    openFind(id, { replace, lang, appName, notFound, state: findState.current, target, wholeWord: true });
  const findNext = () => {
    const st = findState.current;
    if (!st.term) return void find(false);
    if (!target().find(st.term, st))
      void msgBox(id, { title: appName, text: notFound(), icon: "info", buttons: [L("Tamam", "OK")] });
  };

  // ---------- zoom ----------

  const zoomStep = (dir: 1 | -1) =>
    setZoom((z) => (dir > 0 ? (ZOOMS.find((x) => x > z) ?? 500) : ([...ZOOMS].reverse().find((x) => x < z) ?? 10)));

  useWinKeys({
    "ctrl+n": () => void newDoc(),
    "ctrl+o": () => void openDoc(),
    "ctrl+s": () => void save(),
    "ctrl+p": () => print(),
    "ctrl+f": () => void find(false),
    "ctrl+h": () => void find(true),
    f3: () => findNext(),
    "ctrl+a": () => edit.selectAll(),
    "ctrl+b": () => exec("bold"),
    "ctrl+i": () => exec("italic"),
    "ctrl+u": () => exec("underline"),
    "ctrl+=": () => exec("subscript"),
    "ctrl+shift++": () => exec("superscript"),
    "ctrl+l": () => exec("justifyLeft"),
    "ctrl+e": () => exec("justifyCenter"),
    "ctrl+r": () => exec("justifyRight"),
    "ctrl+j": () => exec("justifyFull"),
    "ctrl+z": () => exec("undo"),
    "ctrl+y": () => exec("redo"),
  });

  // ---------- ribbon ----------

  const COLORS: [string, string, string][] = [
    ["#000000", "Siyah", "Black"],
    ["#7f7f7f", "Gri-50%", "Gray-50%"],
    ["#880015", "Koyu kırmızı", "Dark red"],
    ["#c00000", "Kırmızı", "Red"],
    ["#ff7f27", "Turuncu", "Orange"],
    ["#ffc000", "Altın", "Gold"],
    ["#22b14c", "Yeşil", "Green"],
    ["#00a2e8", "Turkuaz", "Turquoise"],
    ["#3f48cc", "Çivit mavisi", "Indigo"],
    ["#a349a4", "Mor", "Purple"],
  ];
  const HILITES: [string, string, string][] = [
    ["#ffff00", "Sarı", "Yellow"],
    ["#00ff00", "Parlak yeşil", "Bright green"],
    ["#00ffff", "Turkuaz", "Turquoise"],
    ["#ff00ff", "Pembe", "Pink"],
    ["#0000ff", "Mavi", "Blue"],
    ["#ff0000", "Kırmızı", "Red"],
    ["#c0c0c0", "Gri-25%", "Gray-25%"],
  ];
  const colorItems = (list: [string, string, string][]) =>
    list.map(([c, t, e]): Pick => ({ label: L(t, e), icon: swatch(c), pick: c }));
  const applyColor = (c: string) => (setColor(c), exec("foreColor", c));
  const applyHilite = (c: string) => (setHilite(c), exec("hiliteColor", c));
  const fontVal = Object.keys(FONTS).find((f) => f.toLowerCase() === fmt.font.toLowerCase()) ?? fmt.font;
  const sizes = SIZES.includes(fmt.size) ? SIZES : [...SIZES, fmt.size].sort((a, b) => a - b);
  const numbering: [string, string, string][] = [
    ["decimal", "1, 2, 3", "1, 2, 3"],
    ["lower-alpha", "a, b, c", "a, b, c"],
    ["upper-alpha", "A, B, C", "A, B, C"],
    ["lower-roman", "i, ii, iii", "i, ii, iii"],
    ["upper-roman", "I, II, III", "I, II, III"],
  ];

  const fontGroup = (
    <div className="wp-rows">
      <div className="wp-row">
        <select
          className="w8-select wp-font"
          value={fontVal}
          title={L("Yazı tipi ailesi", "Font family")}
          onChange={(e) => exec("fontName", FONTS[e.target.value] ?? e.target.value)}
        >
          {(Object.keys(FONTS).includes(fontVal) ? Object.keys(FONTS) : [fontVal, ...Object.keys(FONTS)]).map((f) => (
            <option key={f} value={f} style={{ fontFamily: FONTS[f] }}>
              {f}
            </option>
          ))}
        </select>
        <select
          className="w8-select wp-size"
          value={fmt.size}
          title={L("Yazı tipi boyutu", "Font size")}
          onChange={(e) => setSize(Number(e.target.value))}
        >
          {sizes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Tb title={L("Yazı tipini büyüt", "Grow font")} onClick={() => grow(1)}>
          <span className="wp-glyph">
            A<sup>▲</sup>
          </span>
        </Tb>
        <Tb title={L("Yazı tipini küçült", "Shrink font")} onClick={() => grow(-1)}>
          <span className="wp-glyph small">
            A<sup>▼</sup>
          </span>
        </Tb>
      </div>
      <div className="wp-row">
        <Tb on={fmt.bold} title={L("Kalın (Ctrl+B)", "Bold (Ctrl+B)")} onClick={() => exec("bold")}>
          <b className="wp-glyph">{L("K", "B")}</b>
        </Tb>
        <Tb on={fmt.italic} title={L("İtalik (Ctrl+I)", "Italic (Ctrl+I)")} onClick={() => exec("italic")}>
          <i className="wp-glyph serif">{L("T", "I")}</i>
        </Tb>
        <Tb
          on={fmt.underline}
          title={L("Altı çizili (Ctrl+U)", "Underline (Ctrl+U)")}
          onClick={() => exec("underline")}
        >
          <u className="wp-glyph">{L("A", "U")}</u>
        </Tb>
        <Tb on={fmt.strike} title={L("Üstü çizili", "Strikethrough")} onClick={() => exec("strikeThrough")}>
          <s className="wp-glyph small">abc</s>
        </Tb>
        <Tb on={fmt.sub} title={L("Alt simge (Ctrl+=)", "Subscript (Ctrl+=)")} onClick={() => exec("subscript")}>
          <span className="wp-glyph small">
            x<sub>2</sub>
          </span>
        </Tb>
        <Tb
          on={fmt.sup}
          title={L("Üst simge (Ctrl+Shift++)", "Superscript (Ctrl+Shift++)")}
          onClick={() => exec("superscript")}
        >
          <span className="wp-glyph small">
            x<sup>2</sup>
          </span>
        </Tb>
        <span className="wp-split">
          <Tb title={L("Metin vurgu rengi", "Text highlight color")} onClick={() => applyHilite(hilite)}>
            <span className="wp-glyph small wp-color" style={{ borderColor: hilite }}>
              ab
            </span>
          </Tb>
          <Drop
            title={L("Metin vurgu rengi", "Text highlight color")}
            items={[
              { label: L("Renk yok", "No color"), onClick: () => exec("hiliteColor", "transparent") },
              { sep: true },
              ...colorItems(HILITES),
            ]}
            onPick={applyHilite}
          />
        </span>
        <span className="wp-split">
          <Tb title={L("Metin rengi", "Text color")} onClick={() => applyColor(color)}>
            <span className="wp-glyph wp-color" style={{ borderColor: color }}>
              A
            </span>
          </Tb>
          <Drop
            title={L("Metin rengi", "Text color")}
            items={[
              { label: L("Otomatik", "Automatic"), icon: swatch("#000"), onClick: () => applyColor("#000000") },
              { sep: true },
              ...colorItems(COLORS),
            ]}
            onPick={applyColor}
          />
        </span>
      </div>
    </div>
  );

  const paraGroup = (
    <div className="wp-rows">
      <div className="wp-row">
        <Tb title={L("Girintiyi azalt", "Decrease indent")} onClick={() => exec("outdent")}>
          {I.outdent}
        </Tb>
        <Tb title={L("Girintiyi artır", "Increase indent")} onClick={() => exec("indent")}>
          {I.indent}
        </Tb>
        <span className="wp-split">
          <Tb
            on={fmt.ul || fmt.ol}
            title={L("Liste başlat", "Start a list")}
            onClick={() => exec("insertUnorderedList")}
          >
            {I.bullets}
          </Tb>
          <Drop
            title={L("Liste başlat", "Start a list")}
            items={[
              { label: L("Yok", "None"), checked: !fmt.ul && !fmt.ol, radio: true, onClick: () => list(null) },
              { label: L("Madde imi", "Bullet"), checked: fmt.ul, radio: true, onClick: () => list("disc") },
              ...numbering.map(([t, a, b]): Pick => ({ label: L(a, b), pick: t })),
            ]}
            onPick={list}
          />
        </span>
        <Drop
          title={L("Satır aralığı", "Line spacing")}
          items={[
            ...["1.0", "1.15", "1.5", "2.0"].map((v): Pick => ({
              label: v,
              radio: true,
              checked: parseFloat(fmt.line) === parseFloat(v),
              pick: v,
            })),
            { sep: true },
            {
              label: L("Paragrafların sonuna 10pt boşluk ekle", "Add 10pt space after paragraphs"),
              checked: fmt.after,
              onClick: () => spaceAfter(!fmt.after),
            },
          ]}
          onPick={(v) => lineSpacing(String(parseFloat(v)))}
        >
          {I.spacing}
        </Drop>
      </div>
      <div className="wp-row">
        <Tb
          on={fmt.align === "left"}
          title={L("Metni sola hizala (Ctrl+L)", "Align text left (Ctrl+L)")}
          onClick={() => exec("justifyLeft")}
        >
          {I.left}
        </Tb>
        <Tb
          on={fmt.align === "center"}
          title={L("Ortala (Ctrl+E)", "Center (Ctrl+E)")}
          onClick={() => exec("justifyCenter")}
        >
          {I.center}
        </Tb>
        <Tb
          on={fmt.align === "right"}
          title={L("Metni sağa hizala (Ctrl+R)", "Align text right (Ctrl+R)")}
          onClick={() => exec("justifyRight")}
        >
          {I.right}
        </Tb>
        <Tb
          on={fmt.align === "justify"}
          title={L("İki yana yasla (Ctrl+J)", "Justify (Ctrl+J)")}
          onClick={() => exec("justifyFull")}
        >
          {I.justify}
        </Tb>
      </div>
    </div>
  );

  const check = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label className="wp-check">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  const tabs: RibbonTab[] = [
    {
      id: "home",
      label: L("Giriş", "Home"),
      groups: [
        {
          label: L("Pano", "Clipboard"),
          items: [
            { label: L("Yapıştır", "Paste"), icon: I.paste, big: true, onClick: () => void edit.paste() },
            { label: L("Kes", "Cut"), icon: I.cut, onClick: edit.cut, title: L("Kes (Ctrl+X)", "Cut (Ctrl+X)") },
            {
              label: L("Kopyala", "Copy"),
              icon: I.copy,
              onClick: edit.copy,
              title: L("Kopyala (Ctrl+C)", "Copy (Ctrl+C)"),
            },
          ],
        },
        { label: L("Yazı Tipi", "Font"), items: [fontGroup] },
        { label: L("Paragraf", "Paragraph"), items: [paraGroup] },
        {
          label: L("Ekle", "Insert"),
          items: [
            { label: L("Resim", "Picture"), icon: I.picture, big: true, onClick: () => void picture() },
            { label: L("Tarih ve saat", "Date and time"), icon: I.date, big: true, onClick: dateDlg },
          ],
        },
        {
          label: L("Düzenleme", "Editing"),
          items: [
            {
              label: L("Bul", "Find"),
              icon: I.find,
              onClick: () => void find(false),
              title: L("Bul (Ctrl+F)", "Find (Ctrl+F)"),
            },
            {
              label: L("Değiştir", "Replace"),
              icon: I.replace,
              onClick: () => void find(true),
              title: L("Değiştir (Ctrl+H)", "Replace (Ctrl+H)"),
            },
            {
              label: L("Tümünü seç", "Select all"),
              icon: I.selectAll,
              onClick: edit.selectAll,
              title: L("Tümünü seç (Ctrl+A)", "Select all (Ctrl+A)"),
            },
          ],
        },
      ],
    },
    {
      id: "view",
      label: L("Görünüm", "View"),
      groups: [
        {
          label: L("Yakınlaştırma", "Zoom"),
          items: [
            { label: L("Yakınlaştır", "Zoom in"), icon: I.zoomIn, big: true, onClick: () => zoomStep(1) },
            { label: L("Uzaklaştır", "Zoom out"), icon: I.zoomOut, big: true, onClick: () => zoomStep(-1) },
            { label: "%100", icon: I.zoom100, big: true, onClick: () => setZoom(100) },
          ],
        },
        {
          label: L("Göster veya gizle", "Show or hide"),
          items: [
            <div key="sh" className="wp-checks">
              {check(L("Cetvel", "Ruler"), prefs.ruler, (v) => setPref("ruler", v))}
              {check(L("Durum çubuğu", "Status bar"), prefs.status, (v) => setPref("status", v))}
            </div>,
          ],
        },
        {
          label: L("Ayarlar", "Settings"),
          items: [
            {
              label: L("Sözcük kaydırma", "Word wrap"),
              icon: I.wrap,
              big: true,
              menu: (
                [
                  ["none", "Kaydırma yok", "No wrap"],
                  ["window", "Pencereye göre kaydır", "Wrap to window"],
                  ["ruler", "Cetvele göre kaydır", "Wrap to ruler"],
                ] as [Wrap, string, string][]
              ).map(([v, a, b]) => ({
                label: L(a, b),
                radio: true,
                checked: prefs.wrap === v,
                onClick: () => setPref("wrap", v),
              })),
            },
            {
              label: L("Ölçü birimleri", "Measurement units"),
              icon: I.units,
              big: true,
              menu: (
                [
                  ["in", "İnç", "Inches"],
                  ["cm", "Santimetre", "Centimeters"],
                ] as [Units, string, string][]
              ).map(([v, a, b]) => ({
                label: L(a, b),
                radio: true,
                checked: prefs.units === v,
                onClick: () => setPref("units", v),
              })),
            },
          ],
        },
      ],
    },
  ];

  const fileMenu: MenuItem[] = [
    { label: L("Yeni", "New"), shortcut: "Ctrl+N", onClick: () => void newDoc() },
    { label: L("Aç", "Open"), shortcut: "Ctrl+O", onClick: () => void openDoc() },
    { label: L("Kaydet", "Save"), shortcut: "Ctrl+S", onClick: () => void save() },
    { label: L("Farklı kaydet", "Save as"), onClick: () => void saveAs() },
    { sep: true },
    { label: L("Yazdır", "Print"), shortcut: "Ctrl+P", onClick: print },
    { label: L("Sayfa yapısı", "Page setup"), onClick: pageDlg },
    { sep: true },
    {
      label: L("WordPad Hakkında", "About WordPad"),
      onClick: () => wm.launch("winver", { arg: "wordpad", owner: id }),
    },
    { sep: true },
    { label: L("Çıkış", "Exit"), onClick: () => void wm.requestClose(id) },
  ];

  // ---------- page geometry ----------

  const pg = prefs.page;
  const [pw] = pageSize();
  const pagePx = pw * MM;
  const z = zoom / 100;
  const page: React.CSSProperties = {
    zoom: z,
    padding: `${pg.top * MM}px ${pg.right * MM}px ${pg.bottom * MM}px ${pg.left * MM}px`,
    width: prefs.wrap === "ruler" ? pagePx : undefined,
  };

  return (
    <div className="wp">
      {/* Find's match (CSS Custom Highlight API). Inline because Turbopack's CSS parser rejects ::highlight(). */}
      <style>{"::highlight(wp-find){background:#3399ff;color:#fff}"}</style>
      <div
        onMouseDown={(e) => {
          // Ribbon buttons act on the page's selection, so they must not take the focus.
          if ((e.target as HTMLElement).closest("button")) e.preventDefault();
        }}
      >
        <Ribbon
          tabs={tabs}
          fileLabel={L("Dosya", "File")}
          fileMenu={fileMenu}
          right={
            <button
              className="wp-help"
              title={L("Yardım", "Help")}
              onClick={() =>
                openApp(
                  "ie",
                  `https://www.bing.com/search?q=${encodeURIComponent(tr ? "windows 8.1 wordpad yardım" : "get help with wordpad in windows 8.1")}`,
                )
              }
            >
              ?
            </button>
          }
        />
      </div>
      {prefs.ruler && (
        <div className="wp-ruler" ref={ruler}>
          <div className={`wp-canvas ${prefs.wrap === "ruler" ? "" : "left"}`}>
            <Ruler
              width={pagePx}
              left={pg.left * MM}
              right={pg.right * MM}
              unit={prefs.units === "cm" ? 10 * MM : 96}
              z={z}
            />
          </div>
        </div>
      )}
      <div
        ref={work}
        className="wp-work"
        onScroll={(e) => {
          if (ruler.current) ruler.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <div className={`wp-canvas ${prefs.wrap === "ruler" ? "" : "left"}`}>
          <div
            className={`wp-page wrap-${prefs.wrap}`}
            style={page}
            onMouseDown={(e) => {
              // Clicks in the margins put the caret in the text.
              if (e.target === e.currentTarget) {
                e.preventDefault();
                restore();
              }
            }}
          >
            <div
              ref={doc}
              className="wp-doc"
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onInput={() => setDirty(true)}
              onFocus={() => mark(null)}
              onCopy={copyHtml}
              onCut={copyHtml}
              onKeyDown={(e) => {
                if (e.key === "Tab" && !e.ctrlKey && !e.altKey) {
                  e.preventDefault();
                  exec(e.shiftKey ? "outdent" : "insertText", e.shiftKey ? undefined : "\t");
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtx({ x: e.clientX, y: e.clientY, sel: !window.getSelection()?.isCollapsed });
              }}
            />
          </div>
        </div>
      </div>
      {prefs.status && (
        <div className="wp-status">
          <span className="wp-zoom-pct">{zoom}%</span>
          <button className="wp-zoom-btn" title={L("Uzaklaştır", "Zoom out")} onClick={() => zoomStep(-1)}>
            −
          </button>
          <input
            className="wp-zoom"
            type="range"
            min={10}
            max={500}
            step={10}
            value={zoom}
            aria-label={L("Yakınlaştırma", "Zoom")}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <button className="wp-zoom-btn" title={L("Yakınlaştır", "Zoom in")} onClick={() => zoomStep(1)}>
            +
          </button>
        </div>
      )}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { label: L("Kes", "Cut"), onClick: edit.cut, disabled: !ctx.sel },
            { label: L("Kopyala", "Copy"), onClick: edit.copy, disabled: !ctx.sel },
            { label: L("Yapıştır", "Paste"), onClick: () => void edit.paste() },
            { sep: true },
            { label: L("Tümünü seç", "Select all"), onClick: edit.selectAll },
          ]}
        />
      )}
    </div>
  );
}

// ---------- ruler ----------

/** The ruler over the page: grey margins, numbers every unit counted from the left margin, indent markers. */
function Ruler({
  width,
  left,
  right,
  unit,
  z,
}: {
  width: number;
  left: number;
  right: number;
  unit: number;
  z: number;
}) {
  const ticks: ReactNode[] = [];
  const q = unit / 4;
  for (let t = -Math.floor(left / q); left + t * q <= width; t++) {
    const x = (left + t * q) * z;
    if (t % 4 === 0) {
      if (t)
        ticks.push(
          <text key={t} x={x} y="13" textAnchor="middle">
            {Math.abs(t / 4)}
          </text>,
        );
    } else ticks.push(<rect key={t} x={x} y={t % 2 ? 8 : 6} width="1" height={t % 2 ? 2 : 6} />);
  }
  const l = left * z;
  const r = (width - right) * z;
  return (
    <svg className="wp-ruler-svg" width={width * z} height="20" aria-hidden="true">
      <rect x="0" y="2" width={width * z} height="15" fill="#d9dadb" />
      <rect x={l} y="2" width={Math.max(0, r - l)} height="15" fill="#fff" />
      <g fill="#555" fontSize="9" fontFamily="Segoe UI, sans-serif">
        {ticks}
      </g>
      <path d={`M${l - 4} 2h8l-4 5zM${l - 4} 17h8l-4-5z`} fill="#f4f4f4" stroke="#7a7a7a" />
      <path d={`M${r - 4} 17h8l-4-5z`} fill="#f4f4f4" stroke="#7a7a7a" />
    </svg>
  );
}

// ---------- Date and Time ----------

function DateDlg({ lang, pick, close }: { lang: Lang; pick: (s: string) => void; close: () => void }) {
  const tr = lang === "tr";
  const [formats] = useState(() => {
    const d = new Date();
    const loc = tr ? "tr-TR" : "en-US";
    const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleString(loc, o);
    return [
      f({ day: "2-digit", month: "2-digit", year: "numeric" }),
      f({ day: "numeric", month: "numeric", year: "numeric" }),
      f({ day: "2-digit", month: "2-digit", year: "2-digit" }),
      d.toISOString().slice(0, 10),
      f({ day: "numeric", month: "long", year: "numeric" }),
      f({ weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      f({ month: "long", year: "numeric" }),
      f({ hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      f({ hour: "2-digit", minute: "2-digit" }),
    ];
  });
  const [on, setOn] = useState(0);
  useWinKeys({ escape: close, enter: () => pick(formats[on]) });
  return (
    <div className="np-dlg wp-date">
      <span>{tr ? "Kullanılabilir biçimler:" : "Available formats:"}</span>
      <div className="np-list wp-date-list" role="listbox">
        {formats.map((s, i) => (
          <div
            key={s}
            role="option"
            aria-selected={i === on}
            className={i === on ? "on" : ""}
            onPointerDown={() => setOn(i)}
            onDoubleClick={() => pick(s)}
          >
            {s}
          </div>
        ))}
      </div>
      <div className="np-dlg-btns">
        <Btn primary onClick={() => pick(formats[on])}>
          {tr ? "Tamam" : "OK"}
        </Btn>
        <Btn onClick={close}>{tr ? "İptal" : "Cancel"}</Btn>
      </div>
    </div>
  );
}

// ---------- Page Setup ----------

function PageDlg({
  lang,
  page,
  apply,
  close,
}: {
  lang: Lang;
  page: Page;
  apply: (p: Page) => void;
  close: () => void;
}) {
  const tr = lang === "tr";
  const L = (a: string, b: string) => (tr ? a : b);
  const [p, setP] = useState(page);
  const set = <K extends keyof Page>(k: K, v: Page[K]) => setP((x) => ({ ...x, [k]: v }));
  const num = (k: "left" | "right" | "top" | "bottom") => (
    <input
      className="w8-input"
      value={p[k]}
      onChange={(e) => set(k, Math.min(100, Number(e.target.value.replace(/[^\d.]/g, "")) || 0))}
    />
  );
  useWinKeys({ escape: close, enter: () => apply(p) });
  const land = p.orient === "landscape";
  const [w, h] = PAPERS[p.paper];
  const [sw, sh] = land ? [h, w] : [w, h];
  const s = 86 / Math.max(sw, sh);
  return (
    <div className="np-dlg np-page">
      <div className="np-page-top">
        <div className="np-page-left">
          <fieldset className="np-group">
            <legend>{L("Kağıt", "Paper")}</legend>
            <label className="np-page-row">
              <span>{L("Boyut:", "Size:")}</span>
              <select className="w8-select" value={p.paper} onChange={(e) => set("paper", e.target.value as Paper)}>
                {Object.keys(PAPERS).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </fieldset>
          <div className="np-page-mid">
            <fieldset className="np-group np-page-orient">
              <legend>{L("Yönlendirme", "Orientation")}</legend>
              <label className="np-check">
                <input type="radio" checked={!land} onChange={() => set("orient", "portrait")} />
                {L("Dikey", "Portrait")}
              </label>
              <label className="np-check">
                <input type="radio" checked={land} onChange={() => set("orient", "landscape")} />
                {L("Yatay", "Landscape")}
              </label>
            </fieldset>
            <fieldset className="np-group np-page-margins">
              <legend>{L("Kenar Boşlukları (milimetre)", "Margins (millimeters)")}</legend>
              <label>
                {L("Sol:", "Left:")} {num("left")}
              </label>
              <label>
                {L("Sağ:", "Right:")} {num("right")}
              </label>
              <label>
                {L("Üst:", "Top:")} {num("top")}
              </label>
              <label>
                {L("Alt:", "Bottom:")} {num("bottom")}
              </label>
            </fieldset>
          </div>
        </div>
        <fieldset className="np-group np-page-preview">
          <legend>{L("Önizleme", "Preview")}</legend>
          <div className="np-page-sheet" style={{ width: sw * s, height: sh * s }}>
            <div
              className="np-page-text"
              style={{ left: p.left * s, right: p.right * s, top: p.top * s, bottom: p.bottom * s }}
            />
          </div>
        </fieldset>
      </div>
      <div className="np-dlg-btns">
        <Btn primary onClick={() => apply(p)}>
          {L("Tamam", "OK")}
        </Btn>
        <Btn onClick={close}>{L("İptal", "Cancel")}</Btn>
      </div>
    </div>
  );
}
