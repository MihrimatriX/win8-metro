"use client";
/**
 * Paint as in Windows 8.1: the ribbon (Home / View, plus the Text tab while a text box is open), a bitmap on the
 * blue-grey workspace with drag handles, pencil / brushes / fill / text / eraser / color picker / magnifier,
 * outlined and filled shapes, rectangular selections that float and move, clipboard, undo / redo,
 * Resize and Skew, Rotate / Flip, zoom and a status bar. Pictures are read from and saved to the virtual
 * file system as PNG / JPEG data URLs; the procedural pictures (CoverArt) are rasterized on open.
 */
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOS } from "@/lib/os";
import { fs, basename, dirname, normalize, KNOWN, type ArtSpec } from "@/lib/fs";
import { wm } from "@/lib/wm";
import { CoverArt } from "../../CoverArt";
import { Ribbon, Btn, useWindow, useWinKeys, useCloseGuard, type MenuItem, type RibbonTab } from "../ui";
import { fileDialog, msgBox, openDialog, type FileFilter } from "../dialogs";
import { askSave, printHtml } from "./Notepad";
import "./paint.css";

type Lang = "tr" | "en";
type Pt = [number, number];
type Tool = "pencil" | "fill" | "text" | "eraser" | "picker" | "zoom" | "brush" | "select" | "shape";
type Brush = "brush" | "cal1" | "cal2" | "air";
type Rect = { x: number; y: number; w: number; h: number };
/** A selection; `float` holds its pixels once they've been lifted off the picture (moved, pasted, rotated…). */
type Sel = Rect & { float: HTMLCanvasElement | null };
type Src = { data?: string; art?: ArtSpec };
type Drag = { kind: string; start: Pt; last: Pt; fg: string; bg: string; sel?: Sel; axis?: string };
type Font = { family: string; size: number; bold: boolean; italic: boolean; underline: boolean; opaque: boolean };

const W0 = 640;
const H0 = 400;
const ZOOMS = [0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8];
const UNDO_CAP = 30;
/** Line widths per Size choice; the pencil and the eraser have their own scales, like the real Size list. */
const SIZES = { pencil: [1, 2, 3, 4], eraser: [4, 6, 8, 10], line: [1, 3, 5, 8] };
/** The 20 colors of the Windows 7 / 8 Paint palette. */
// prettier-ignore
const PALETTE = [
  "#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27", "#fff200", "#22b14c", "#00a2e8", "#3f48cc", "#a349a4",
  "#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e", "#efe4b0", "#b5e61d", "#99d9ea", "#7092be", "#c8bfe7",
];
// prettier-ignore
const FONTS = ["Arial", "Calibri", "Cambria", "Comic Sans MS", "Courier New", "Georgia", "Segoe UI", "Tahoma",
  "Times New Roman", "Trebuchet MS", "Verdana"];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

// ---------- shapes ----------

const ring = (n: number, r: (i: number) => number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return [0.5 + r(i) * Math.cos(a), 0.5 + r(i) * Math.sin(a)];
  });
// prettier-ignore
const ARROW: Pt[] = [[0, 0.25], [0.6, 0.25], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.75], [0, 0.75]];
/** Polygon shapes are points in a unit box, stretched over what the user drags. */
// prettier-ignore
const SHAPES: { id: string; tr: string; en: string; pts?: Pt[] }[] = [
  { id: "line", tr: "Çizgi", en: "Line" },
  { id: "oval", tr: "Oval", en: "Oval" },
  { id: "rect", tr: "Dikdörtgen", en: "Rectangle" },
  { id: "round", tr: "Yuvarlatılmış dikdörtgen", en: "Rounded rectangle" },
  { id: "tri", tr: "Üçgen", en: "Triangle", pts: [[0.5, 0], [1, 1], [0, 1]] },
  { id: "rtri", tr: "Dik üçgen", en: "Right triangle", pts: [[0, 0], [1, 1], [0, 1]] },
  { id: "diamond", tr: "Elmas", en: "Diamond", pts: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]] },
  { id: "penta", tr: "Beşgen", en: "Pentagon", pts: ring(5, () => 0.5) },
  { id: "hexa", tr: "Altıgen", en: "Hexagon", pts: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]] },
  { id: "rarrow", tr: "Sağ ok", en: "Right arrow", pts: ARROW },
  { id: "larrow", tr: "Sol ok", en: "Left arrow", pts: ARROW.map(([x, y]) => [1 - x, y]) },
  { id: "uarrow", tr: "Yukarı ok", en: "Up arrow", pts: ARROW.map(([x, y]) => [y, 1 - x]) },
  { id: "darrow", tr: "Aşağı ok", en: "Down arrow", pts: ARROW.map(([x, y]) => [y, x]) },
  { id: "star4", tr: "Dört köşeli yıldız", en: "Four-point star", pts: ring(8, (i) => (i % 2 ? 0.18 : 0.5)) },
  { id: "star5", tr: "Beş köşeli yıldız", en: "Five-point star", pts: ring(10, (i) => (i % 2 ? 0.2 : 0.5)) },
  { id: "star6", tr: "Altı köşeli yıldız", en: "Six-point star", pts: ring(12, (i) => (i % 2 ? 0.28 : 0.5)) },
];

function drawShape(
  g: CanvasRenderingContext2D,
  id: string,
  a: Pt,
  b: Pt,
  lw: number,
  line: string | null,
  fill: string | null,
) {
  g.lineWidth = lw;
  g.lineCap = g.lineJoin = "round";
  g.beginPath();
  if (id === "line") {
    g.moveTo(...a);
    g.lineTo(...b);
    g.strokeStyle = line ?? fill ?? "#000";
    g.stroke();
    return;
  }
  // The outline sits inside the dragged box.
  const i = line ? lw / 2 : 0;
  const x = Math.min(a[0], b[0]) + i;
  const y = Math.min(a[1], b[1]) + i;
  const w = Math.max(0, Math.abs(b[0] - a[0]) - 2 * i);
  const h = Math.max(0, Math.abs(b[1] - a[1]) - 2 * i);
  const pts = SHAPES.find((s) => s.id === id)?.pts;
  if (id === "oval") g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
  else if (id === "rect") g.rect(x, y, w, h);
  else if (id === "round") g.roundRect(x, y, w, h, Math.min(w, h, 60) / 4);
  else pts?.forEach(([px, py], k) => g[k ? "lineTo" : "moveTo"](x + px * w, y + py * h));
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (line) {
    g.strokeStyle = line;
    g.stroke();
  }
}

// ---------- pixels ----------

const mk = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
const ctxOf = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
const crop = (src: HTMLCanvasElement, r: Rect) => {
  const c = mk(r.w, r.h);
  ctxOf(c).drawImage(src, -r.x, -r.y);
  return c;
};
const hex = (d: ArrayLike<number>) => `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** An aliased line of `s`×`s` squares (pencil, eraser, calligraphy nib), like GDI draws it. */
function plot(g: CanvasRenderingContext2D, a: Pt, b: Pt, s: number, color: string) {
  g.fillStyle = color;
  let [x0, y0] = [Math.floor(a[0]), Math.floor(a[1])];
  const [x1, y1] = [Math.floor(b[0]), Math.floor(b[1])];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  const o = Math.floor(s / 2);
  for (let err = dx + dy; ;) {
    g.fillRect(x0 - o, y0 - o, s, s);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function brushStroke(g: CanvasRenderingContext2D, kind: Brush, a: Pt, b: Pt, w: number, color: string) {
  if (kind === "air") {
    g.fillStyle = color;
    for (let i = 0; i < w * 6; i++) {
      const t = Math.random() * 2 * Math.PI;
      const d = Math.sqrt(Math.random()) * w * 3;
      g.fillRect(Math.floor(b[0] + d * Math.cos(t)), Math.floor(b[1] + d * Math.sin(t)), 1, 1);
    }
  } else if (kind === "brush") {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.lineCap = g.lineJoin = "round";
    g.beginPath();
    g.moveTo(...a);
    g.lineTo(...b);
    g.stroke();
  } else {
    // A slanted flat nib: "/" for calligraphy 1, "\" for 2.
    const v = kind === "cal1" ? -1 : 1;
    for (let k = -w; k <= w; k++)
      plot(g, [a[0] + k / 2, a[1] + (v * k) / 2], [b[0] + k / 2, b[1] + (v * k) / 2], 1, color);
  }
}

function flood(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const { width: w, height: h } = g.canvas;
  const img = g.getImageData(0, 0, w, h);
  const px = new Uint32Array(img.data.buffer);
  const one = new Uint8ClampedArray([1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)).concat(255));
  const fill = new Uint32Array(one.buffer)[0];
  const start = y * w + x;
  const target = px[start];
  if (target === fill) return;
  const stack = [start];
  while (stack.length) {
    const i = stack.pop() as number;
    if (px[i] !== target) continue;
    px[i] = fill;
    const cx = i % w;
    if (cx > 0) stack.push(i - 1);
    if (cx < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * h - w) stack.push(i + w);
  }
  g.putImageData(img, 0, 0);
}

function rotate(src: HTMLCanvasElement, deg: number) {
  const q = deg % 180 !== 0;
  const c = mk(q ? src.height : src.width, q ? src.width : src.height);
  const g = ctxOf(c);
  g.translate(c.width / 2, c.height / 2);
  g.rotate((deg * Math.PI) / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

function flip(src: HTMLCanvasElement, horizontal: boolean) {
  const c = mk(src.width, src.height);
  const g = ctxOf(c);
  g.translate(horizontal ? c.width : 0, horizontal ? 0 : c.height);
  g.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
  g.drawImage(src, 0, 0);
  return c;
}

/** Resize to w×h, then skew by the given degrees; the corners the skew uncovers get Color 2. */
function resizeSkew(src: HTMLCanvasElement, w: number, h: number, ax: number, ay: number, bg: string) {
  const tx = Math.tan((ax * Math.PI) / 180);
  const ty = Math.tan((ay * Math.PI) / 180);
  const c = mk(w + Math.abs(tx) * h, h + Math.abs(ty) * w);
  const g = ctxOf(c);
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.setTransform(1, ty, tx, 1, tx < 0 ? -tx * h : 0, ty < 0 ? -ty * w : 0);
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  return c;
}

/** Break text into the lines the text box shows (word wrap at the box width). */
function wrapLines(g: CanvasRenderingContext2D, s: string, max: number) {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    let line = "";
    for (const word of para.split(/(?<=\s)/)) {
      if (line && g.measureText(line + word).width > max) {
        out.push(line);
        line = word;
      } else line += word;
    }
    out.push(line);
  }
  return out;
}

const fontCss = (f: Font, scale: number) =>
  `${f.italic ? "italic " : ""}${f.bold ? "bold " : ""}${((f.size * 4) / 3) * scale}px "${f.family}", sans-serif`;

/** What an image file in the VFS holds, or null when Paint can't read it. */
function readImage(path: string): Src | null {
  const n = fs.get(path);
  return n?.kind === "img" && (n.data || n.art) ? { data: n.data, art: n.art } : null;
}

/** Fallback clipboard when the browser won't hand us the system one. */
let clip: HTMLCanvasElement | null = null;
const setClip = (c: HTMLCanvasElement) => {
  clip = c;
};

// ---------- icons ----------

const sv = (size: number, body: ReactNode) => (
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    {body}
  </svg>
);
// prettier-ignore
const IC = {
  paste: sv(32, <><rect x="5" y="5" width="18" height="23" rx="1.5" fill="#c8964b" stroke="#8a6230" /><rect x="10" y="3" width="8" height="5" rx="1" fill="#e2e2e2" stroke="#777" /><path d="M14 12h14v17H14z" fill="#fff" stroke="#7a8ea8" /><path d="M17 17h8M17 20h8M17 23h6" stroke="#9aaecb" /></>),
  cut: sv(16, <><circle cx="4.5" cy="12" r="2.5" fill="none" stroke="#3a62a7" strokeWidth="1.4" /><circle cx="11.5" cy="12" r="2.5" fill="none" stroke="#3a62a7" strokeWidth="1.4" /><path d="M6 10 11.5 1.5M10 10 4.5 1.5" stroke="#555" strokeWidth="1.2" /></>),
  copy: sv(16, <><path d="M2.5 1.5h7v9h-7z" fill="#fff" stroke="#7a8ea8" /><path d="M6.5 5.5h7v9h-7z" fill="#fff" stroke="#3a62a7" /><path d="M8 8h4M8 10h4M8 12h3" stroke="#9aaecb" /></>),
  select: sv(32, <><rect x="4.5" y="6.5" width="23" height="18" fill="#fff" stroke="#3a62a7" strokeDasharray="2 2" /></>),
  crop: sv(16, <path d="M4 1v11h11M1 4h11v11" fill="none" stroke="#3a62a7" strokeWidth="1.4" />),
  resize: sv(16, <><rect x="1.5" y="5.5" width="9" height="9" fill="#fff" stroke="#7a8ea8" /><rect x="1.5" y="9.5" width="5" height="5" fill="#9cc3ea" stroke="#3a62a7" /><path d="M8 8l6-6M10 2h4v4" fill="none" stroke="#2c8a2c" strokeWidth="1.3" /></>),
  rotate: sv(16, <><rect x="2.5" y="6.5" width="7" height="8" fill="#fff" stroke="#7a8ea8" /><path d="M6 4a6 6 0 0 1 8 5" fill="none" stroke="#2c8a2c" strokeWidth="1.4" /><path d="M11.5 8.5 14 10.5l1.5-3" fill="none" stroke="#2c8a2c" strokeWidth="1.4" /></>),
  pencil: sv(16, <><path d="M2 14l1-4 8-8 3 3-8 8z" fill="#f2c84b" stroke="#9a7a1c" /><path d="M2 14l1-4 3 3z" fill="#f4dfb4" /><path d="M2 14l.6-1.8 1.2 1.2z" fill="#333" /></>),
  fill: sv(16, <><path d="M2.5 7.5 8 2l5.5 5.5L8 13z" fill="#fff" stroke="#555" /><path d="M2.5 7.5h11L8 13z" fill="#3a8ee6" /><path d="M14 9s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z" fill="#3a8ee6" /></>),
  text: sv(16, <text x="8" y="13.5" textAnchor="middle" fontSize="14" fontFamily="Times New Roman, serif" fontWeight="bold" fill="#3a62a7">A</text>),
  eraser: sv(16, <><path d="M1.5 10.5 8.5 3.5l6 6-4 4h-6z" fill="#f29cb8" stroke="#a5506d" /><path d="M1.5 10.5l3-3 6 6h-6z" fill="#fff" stroke="#a5506d" /></>),
  picker: sv(16, <><path d="M2 14l1-3 6-6 2 2-6 6z" fill="#dfe9f5" stroke="#555" /><path d="M9 3l2-2 4 4-2 2z" fill="#555" /></>),
  zoom: sv(16, <><circle cx="6.5" cy="6.5" r="4.5" fill="#dff0ff" stroke="#555" strokeWidth="1.3" /><path d="M10 10l4.5 4.5" stroke="#555" strokeWidth="2.2" /></>),
  brush: sv(32, <><path d="M20 3l6 6-9 9-6-6z" fill="#9a7a4b" stroke="#5f4a2a" /><path d="M11 12l6 6-3 3c-2 2-5 1-6 4-1-3-4-4-4-4 3-1 2-4 4-6z" fill="#3a8ee6" stroke="#1f5ea8" /></>),
  outline: sv(16, <><rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="#3a62a7" strokeWidth="1.6" /></>),
  fillShape: sv(16, <path d="M2.5 7.5 8 2l5.5 5.5L8 13z" fill="#3a8ee6" stroke="#1f5ea8" />),
  size: sv(32, <><path d="M5 8h22" stroke="#222" /><path d="M5 13h22" stroke="#222" strokeWidth="2" /><path d="M5 19h22" stroke="#222" strokeWidth="3" /><path d="M5 26h22" stroke="#222" strokeWidth="5" /></>),
  editColors: sv(32, <><circle cx="16" cy="16" r="12" fill="url(#ptwheel)" stroke="#888" /><defs><linearGradient id="ptwheel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ed1c24" /><stop offset=".35" stopColor="#fff200" /><stop offset=".65" stopColor="#22b14c" /><stop offset="1" stopColor="#3f48cc" /></linearGradient></defs><circle cx="16" cy="16" r="4" fill="#fff" stroke="#888" /></>),
  zoomIn: sv(32, <><circle cx="13" cy="13" r="9" fill="#dff0ff" stroke="#555" strokeWidth="2" /><path d="M20 20l8 8" stroke="#555" strokeWidth="4" /><path d="M9 13h8M13 9v8" stroke="#2c8a2c" strokeWidth="2.4" /></>),
  zoomOut: sv(32, <><circle cx="13" cy="13" r="9" fill="#dff0ff" stroke="#555" strokeWidth="2" /><path d="M20 20l8 8" stroke="#555" strokeWidth="4" /><path d="M9 13h8" stroke="#c42b1c" strokeWidth="2.4" /></>),
  zoom100: sv(32, <><rect x="3.5" y="5.5" width="25" height="21" fill="#fff" stroke="#7a8ea8" /><text x="16" y="21" textAnchor="middle" fontSize="11" fill="#3a62a7" fontWeight="bold">100</text></>),
  full: sv(32, <><rect x="2.5" y="4.5" width="27" height="19" fill="#3a8ee6" stroke="#333" /><path d="M12 28h8M16 24v4" stroke="#333" strokeWidth="2" /></>),
  undo: sv(16, <path d="M5 4 2 7l3 3M2.5 7H10a4 4 0 0 1 0 8H7" fill="none" stroke="#3a62a7" strokeWidth="1.6" />),
  redo: sv(16, <path d="M11 4l3 3-3 3M13.5 7H6a4 4 0 0 0 0 8h3" fill="none" stroke="#3a62a7" strokeWidth="1.6" />),
  opaque: sv(32, <><rect x="4.5" y="6.5" width="23" height="19" fill="#fff" stroke="#555" /><text x="16" y="22" textAnchor="middle" fontSize="15" fill="#000">A</text></>),
  transparent: sv(32, <><path d="M4.5 6.5h23v19h-23z" fill="none" stroke="#555" strokeDasharray="2 2" /><text x="16" y="22" textAnchor="middle" fontSize="15" fill="#000">A</text></>),
};
const shapeIcon = (s: (typeof SHAPES)[number]) =>
  sv(
    16,
    s.id === "line" ? (
      <path d="M2 14 14 2" stroke="#222" strokeWidth="1.2" />
    ) : s.id === "oval" ? (
      <ellipse cx="8" cy="8" rx="6.5" ry="5" fill="none" stroke="#222" />
    ) : s.id === "rect" || s.id === "round" ? (
      <rect x="1.5" y="3.5" width="13" height="9" rx={s.id === "round" ? 3 : 0} fill="none" stroke="#222" />
    ) : (
      <polygon points={s.pts?.map(([x, y]) => `${1.5 + x * 13},${1.5 + y * 13}`).join(" ")} fill="none" stroke="#222" />
    ),
  );

// =====================================================================================================

export default function PaintApp() {
  const { id, win, focused, setTitle } = useWindow();
  const { lang } = useOS();
  const tr = lang === "tr";
  const L = (a: string, b: string) => (tr ? a : b);
  const untitled = L("Adsız", "Untitled");

  const [path, setPath] = useState<string | null>(() => (win.arg && readImage(win.arg) ? normalize(win.arg) : null));
  const [pending, setPending] = useState<Src | null>(() => (win.arg ? readImage(win.arg) : null));
  const [dims, setDims] = useState({ w: W0, h: H0 });
  const [dirty, setDirty] = useState(false);
  const [hist, setHist] = useState({ u: 0, r: 0 });
  const [tool, setTool] = useState<Tool>("pencil");
  const [shape, setShape] = useState("line");
  const [brush, setBrush] = useState<Brush>("brush");
  const [outline, setOutline] = useState(true);
  const [fillOn, setFillOn] = useState(false);
  const [sz, setSz] = useState(0);
  const [c1, setC1] = useState("#000000");
  const [c2, setC2] = useState("#ffffff");
  const [slot, setSlot] = useState<1 | 2>(1);
  const [custom, setCustom] = useState<string[]>(() => Array(10).fill(""));
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(false);
  const [status, setStatus] = useState(true);
  const [full, setFull] = useState<string | null>(null);
  const [pos, setPos] = useState<Pt | null>(null);
  const [band, setBand] = useState<Rect | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [text, setText] = useState<Rect | null>(null);
  const [font, setFont] = useState<Font>({
    family: "Calibri",
    size: 11,
    bold: false,
    italic: false,
    underline: false,
    opaque: false,
  });
  const [ghost, setGhost] = useState<{ w: number; h: number } | null>(null);

  const cv = useRef<HTMLCanvasElement>(null);
  const ov = useRef<HTMLCanvasElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const work = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const artBox = useRef<HTMLDivElement>(null);
  const colorIn = useRef<HTMLInputElement>(null);
  const undo = useRef<ImageData[]>([]);
  const redo = useRef<ImageData[]>([]);
  const back = useRef<Tool>("pencil");
  const drag = useRef<Drag | null>(null);

  const lw = SIZES.line[sz];
  const openFilters: FileFilter[] = [
    { label: L("Tüm Resim Dosyaları", "All Picture Files"), exts: ["png", "jpg", "jpeg", "gif", "bmp", "webp"] },
    { label: L("Tüm Dosyalar (*.*)", "All Files (*.*)"), exts: ["*"] },
  ];
  const saveFilters: FileFilter[] = [
    { label: "PNG (*.png)", exts: ["png"] },
    { label: "JPEG (*.jpg;*.jpeg)", exts: ["jpg", "jpeg"] },
  ];

  // ---------- canvas plumbing (handlers only) ----------

  const main = () => cv.current as HTMLCanvasElement;
  const g = () => ctxOf(main());
  const snapshot = () => crop(main(), { x: 0, y: 0, w: main().width, h: main().height });

  /** Give the picture a new size, painting `keep` at the top left and `bg` around it. */
  const setCanvas = (width: number, height: number, keep: CanvasImageSource | null, bg: string) => {
    const w = clamp(Math.round(width), 1, 4000);
    const h = clamp(Math.round(height), 1, 4000);
    for (const c of [main(), ov.current]) {
      if (!c) continue;
      c.width = w;
      c.height = h;
    }
    const x = g();
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    if (keep) x.drawImage(keep, 0, 0);
    setDims({ w, h });
  };

  const pushUndo = () => {
    const c = main();
    undo.current.push(g().getImageData(0, 0, c.width, c.height));
    if (undo.current.length > UNDO_CAP) undo.current.shift();
    redo.current = [];
    setHist({ u: undo.current.length, r: 0 });
    setDirty(true);
  };

  const restore = (from: ImageData[], to: ImageData[]) => {
    setSel(null);
    setText(null);
    const img = from.pop();
    if (!img) return;
    const c = main();
    to.push(g().getImageData(0, 0, c.width, c.height));
    if (img.width !== c.width || img.height !== c.height) setCanvas(img.width, img.height, null, "#fff");
    g().putImageData(img, 0, 0);
    setHist({ u: undo.current.length, r: redo.current.length });
    setDirty(true);
  };

  const resetHistory = () => {
    undo.current = [];
    redo.current = [];
    setHist({ u: 0, r: 0 });
  };

  // ---------- selection & text ----------

  const commitSel = () => {
    if (sel?.float) g().drawImage(sel.float, sel.x, sel.y);
    setSel(null);
  };

  const commitText = () => {
    const t = ta.current;
    if (text && t?.value) {
      pushUndo();
      const x = g();
      x.font = fontCss(font, 1);
      x.textBaseline = "top";
      const lh = ((font.size * 4) / 3) * 1.2;
      const lines = wrapLines(x, t.value, text.w);
      if (font.opaque) {
        x.fillStyle = c2;
        x.fillRect(text.x, text.y, text.w, Math.max(text.h, lines.length * lh));
      }
      x.fillStyle = c1;
      lines.forEach((ln, i) => {
        const y = text.y + i * lh;
        x.fillText(ln, text.x, y + lh * 0.1);
        if (font.underline) x.fillRect(text.x, y + lh * 0.95, x.measureText(ln.trimEnd()).width, Math.max(1, lh / 16));
      });
    }
    setText(null);
  };

  /** Stamp a floating selection or an open text box onto the picture. */
  const flush = () => {
    commitText();
    commitSel();
    setBand(null);
  };

  /** Lift the selected pixels off the picture (leaving Color 2 behind). */
  const lift = (s: Sel): Sel & { float: HTMLCanvasElement } => {
    if (s.float) return { ...s, float: s.float };
    pushUndo();
    const float = crop(main(), s);
    const x = g();
    x.fillStyle = c2;
    x.fillRect(s.x, s.y, s.w, s.h);
    return { ...s, float };
  };

  /** Apply a picture transform to the selection, or to the whole picture when nothing is selected. */
  const transform = (fn: (c: HTMLCanvasElement) => HTMLCanvasElement) => {
    commitText();
    if (sel) {
      const s = lift(sel);
      const f = fn(s.float);
      setSel({ ...s, w: f.width, h: f.height, float: f });
      return;
    }
    pushUndo();
    const out = fn(snapshot());
    setCanvas(out.width, out.height, out, c2);
  };

  const pick = (t: Tool) => {
    flush();
    if (t === "picker" && tool !== "picker") back.current = tool;
    setTool(t);
  };

  const pickBrush = (b: Brush) => {
    setBrush(b);
    pick("brush");
  };

  const selectAll = () => {
    flush();
    setTool("select");
    setSel({ x: 0, y: 0, w: main().width, h: main().height, float: null });
  };

  const del = () => {
    if (!sel) return;
    if (!sel.float) {
      pushUndo();
      const x = g();
      x.fillStyle = c2;
      x.fillRect(sel.x, sel.y, sel.w, sel.h);
    }
    setSel(null);
  };

  const copy = () => {
    if (!sel) return;
    const c = sel.float ?? crop(main(), sel);
    setClip(c);
    c.toBlob((b) => {
      try {
        if (b) void navigator.clipboard.write([new ClipboardItem({ "image/png": b })]).catch(() => {});
      } catch {
        /* no system clipboard: Paint's own copy still works */
      }
    });
  };

  const cut = () => {
    copy();
    del();
  };

  const cropToSel = () => {
    if (!sel) return;
    commitText();
    if (!sel.float) pushUndo();
    setCanvas(sel.w, sel.h, sel.float ?? crop(main(), sel), c2);
    setSel(null);
  };

  /** Paste a picture as a floating selection at the top left, enlarging the canvas when it doesn't fit. */
  const pasteImage = (src: CanvasImageSource & { width: number; height: number }) => {
    flush();
    pushUndo();
    const c = main();
    if (src.width > c.width || src.height > c.height)
      setCanvas(Math.max(c.width, src.width), Math.max(c.height, src.height), snapshot(), c2);
    const float = mk(src.width, src.height);
    ctxOf(float).drawImage(src, 0, 0);
    setTool("select");
    setSel({ x: 0, y: 0, w: float.width, h: float.height, float });
  };

  const paste = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) return pasteImage(await createImageBitmap(await item.getType(type)));
      }
    } catch {
      /* no permission: use what was copied here */
    }
    if (clip) pasteImage(clip);
  };

  // Ctrl+V: the paste event carries the system clipboard without a permission prompt.
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("textarea, input")) return;
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
    e.preventDefault();
    if (file) void createImageBitmap(file).then(pasteImage, () => clip && pasteImage(clip));
    else if (clip) pasteImage(clip);
  });
  useEffect(() => {
    if (!focused) return;
    const on = (e: ClipboardEvent) => onPaste(e);
    document.addEventListener("paste", on);
    return () => document.removeEventListener("paste", on);
  }, [focused]);

  // ---------- files ----------

  const loaded = useEffectEvent((img: HTMLImageElement) => {
    setCanvas(img.naturalWidth || 960, img.naturalHeight || 540, img, "#fff");
    resetHistory();
    setDirty(false);
    setPending(null);
  });
  // Load an opened picture; procedural art is serialized from a hidden CoverArt and rasterized.
  useEffect(() => {
    if (!pending) return;
    let src = pending.data;
    if (!src) {
      const svg = artBox.current?.querySelector("svg")?.cloneNode(true) as SVGSVGElement | undefined;
      if (!svg) return;
      svg.setAttribute("width", "960");
      svg.setAttribute("height", "540");
      src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    }
    const img = new Image();
    img.onload = () => loaded(img);
    img.src = src;
  }, [pending]);

  useEffect(() => {
    setTitle(`${path ? basename(path) : untitled} - Paint`);
  }, [path, untitled, setTitle]);

  const badFile = (p: string) =>
    msgBox(id, {
      title: "Paint",
      text: tr
        ? `${basename(p)}\nPaint bu dosyayı okuyamıyor.\nBu geçerli bir bit eşlem dosyası değil veya biçimi şu anda desteklenmiyor.`
        : `${basename(p)}\nPaint cannot read this file.\nThis is not a valid bitmap file, or its format is not currently supported.`,
      icon: "error",
      buttons: [L("Tamam", "OK")],
    });

  // A blank white picture to start with; a path that isn't a readable picture gets Paint's error.
  useEffect(() => {
    for (const c of [cv.current, ov.current]) {
      if (!c) continue;
      c.width = W0;
      c.height = H0;
    }
    const x = g();
    x.fillStyle = "#fff";
    x.fillRect(0, 0, W0, H0);
    if (win.arg && !readImage(win.arg)) void badFile(win.arg);
    // Only for the window's first render and the path it was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeTo = async (p: string) => {
    flush();
    const data = main().toDataURL(/\.jpe?g$/i.test(p) ? "image/jpeg" : "image/png", 0.92);
    try {
      fs.write(p, { kind: "img", data, art: undefined });
    } catch {
      await msgBox(id, {
        title: "Paint",
        text: tr
          ? `${p}\nDosya kaydedilemedi. Klasör bulunamadı.`
          : `${p}\nThe file could not be saved. The folder doesn't exist.`,
        icon: "error",
        buttons: [L("Tamam", "OK")],
      });
      return false;
    }
    setPath(p);
    setDirty(false);
    return true;
  };

  const saveAs = async () => {
    const p = await fileDialog(id, {
      mode: "save",
      lang,
      filters: saveFilters,
      name: path ? basename(path) : untitled,
      dir: path ? dirname(path) : KNOWN.pictures,
    });
    return p ? writeTo(p) : false;
  };
  const save = () => (path ? writeTo(path) : saveAs());

  const confirmSave = async () => {
    if (!dirty) return true;
    const name = path ?? untitled;
    const r = await askSave(
      id,
      "Paint",
      tr ? `Değişiklikleri ${name} dosyasına kaydetmek istiyor musunuz?` : `Do you want to save changes to ${name}?`,
      lang,
    );
    return r === 0 ? save() : r === 1;
  };
  useCloseGuard(confirmSave, dirty);

  const newDoc = async () => {
    if (!(await confirmSave())) return;
    setSel(null);
    setText(null);
    setCanvas(W0, H0, null, "#fff");
    resetHistory();
    setDirty(false);
    setPath(null);
  };

  const openDoc = async () => {
    if (!(await confirmSave())) return;
    const p = await fileDialog(id, {
      mode: "open",
      lang,
      filters: openFilters,
      dir: path ? dirname(path) : KNOWN.pictures,
    });
    if (!p) return;
    const src = readImage(p);
    if (!src) return void badFile(p);
    setSel(null);
    setText(null);
    setPath(normalize(p));
    setPending(src);
  };

  const print = () => {
    flush();
    printHtml(path ? basename(path) : untitled, `<img src="${main().toDataURL()}">`, "img{max-width:100%}");
  };

  // ---------- dialogs ----------

  const propsDlg = () =>
    openDialog(id, {
      title: L("Resim Özellikleri", "Image Properties"),
      w: 330,
      h: 210,
      render: (close) => (
        <PropsDlg
          lang={lang}
          w={dims.w}
          h={dims.h}
          close={close}
          apply={(w, h) => {
            close();
            flush();
            pushUndo();
            setCanvas(w, h, snapshot(), c2);
          }}
        />
      ),
    });

  const resizeDlg = () => {
    const base = sel ?? dims;
    openDialog(id, {
      title: L("Yeniden Boyutlandır ve Eğ", "Resize and Skew"),
      w: 330,
      h: 360,
      render: (close) => (
        <ResizeDlg
          lang={lang}
          w={base.w}
          h={base.h}
          close={close}
          apply={(w, h, ax, ay) => {
            close();
            transform((c) => resizeSkew(c, w, h, ax, ay, c2));
          }}
        />
      ),
    });
  };

  // ---------- zoom ----------

  const zoomBy = (dir: number) => setZoom((z) => ZOOMS[clamp(ZOOMS.indexOf(z) + dir, 0, ZOOMS.length - 1)]);
  useEffect(() => {
    const el = work.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => ZOOMS[clamp(ZOOMS.indexOf(z) + (e.deltaY < 0 ? 1 : -1), 0, ZOOMS.length - 1)]);
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, []);

  // A floating selection is shown on the overlay canvas (shape previews draw there too).
  useEffect(() => {
    const o = ov.current;
    if (!o) return;
    const x = ctxOf(o);
    x.clearRect(0, 0, o.width, o.height);
    if (sel?.float) x.drawImage(sel.float, sel.x, sel.y);
  }, [sel, dims]);

  // ---------- colors ----------

  const setColor = (c: string) => (slot === 1 ? setC1 : setC2)(c);
  const onPicked = useEffectEvent((c: string) => {
    setColor(c);
    setCustom((cs) => [c, ...cs.filter((x) => x !== c)].slice(0, 10));
  });
  useEffect(() => {
    const el = colorIn.current;
    if (!el) return;
    const on = () => onPicked(el.value);
    el.addEventListener("change", on);
    return () => el.removeEventListener("change", on);
  }, []);
  const editColors = () => {
    const el = colorIn.current;
    if (!el) return;
    el.value = slot === 1 ? c1 : c2;
    el.click();
  };

  // ---------- pointer ----------

  const at = (e: React.PointerEvent): Pt => {
    const r = (page.current as HTMLDivElement).getBoundingClientRect();
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
  };
  const rectOf = (a: Pt, b: Pt): Rect => {
    const c = main();
    const x0 = clamp(Math.floor(Math.min(a[0], b[0])), 0, c.width);
    const y0 = clamp(Math.floor(Math.min(a[1], b[1])), 0, c.height);
    const x1 = clamp(Math.ceil(Math.max(a[0], b[0])), 0, c.width);
    const y1 = clamp(Math.ceil(Math.max(a[1], b[1])), 0, c.height);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  /** Shift: squares, circles and 45° lines. */
  const constrain = (a: Pt, b: Pt, shift: boolean): Pt => {
    if (!shift) return b;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (shape === "line") {
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      return [a[0] + len * Math.cos(ang), a[1] + len * Math.sin(ang)];
    }
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    return [a[0] + Math.sign(dx || 1) * d, a[1] + Math.sign(dy || 1) * d];
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.button !== 0 && e.button !== 2) || e.target === ta.current) return;
    const p = at(e);
    const right = e.button === 2;
    const fg = right ? c2 : c1;
    const bg = right ? c1 : c2;
    const c = main();
    const inPic = p[0] >= 0 && p[1] >= 0 && p[0] < c.width && p[1] < c.height;
    const start = (kind: string, extra: Partial<Drag> = {}) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { kind, start: p, last: p, fg, bg, ...extra };
    };
    switch (tool) {
      case "picker": {
        if (!inPic) return;
        (right ? setC2 : setC1)(hex(g().getImageData(Math.floor(p[0]), Math.floor(p[1]), 1, 1).data));
        setTool(back.current);
        return;
      }
      case "zoom":
        return zoomBy(right ? -1 : 1);
      case "fill":
        if (!inPic) return;
        pushUndo();
        return flood(g(), Math.floor(p[0]), Math.floor(p[1]), fg);
      case "text":
        if (text) return commitText();
        return start("band");
      case "select": {
        if (sel && p[0] >= sel.x && p[1] >= sel.y && p[0] < sel.x + sel.w && p[1] < sel.y + sel.h) {
          const s = lift(sel);
          setSel(s);
          return start("move", { sel: s });
        }
        commitSel();
        return start("band");
      }
      case "pencil":
        pushUndo();
        plot(g(), p, p, SIZES.pencil[sz], fg);
        return start("pencil");
      case "eraser":
        pushUndo();
        plot(g(), p, p, SIZES.eraser[sz], c2);
        return start("eraser");
      case "brush":
        pushUndo();
        brushStroke(g(), brush, p, p, lw, fg);
        return start("brush");
      case "shape":
        pushUndo();
        return start("shape");
    }
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = at(e);
    const c = main();
    setPos(p[0] >= 0 && p[1] >= 0 && p[0] < c.width && p[1] < c.height ? [Math.floor(p[0]), Math.floor(p[1])] : null);
    const d = drag.current;
    if (!d) return;
    switch (d.kind) {
      case "pencil":
        plot(g(), d.last, p, SIZES.pencil[sz], d.fg);
        break;
      case "eraser":
        plot(g(), d.last, p, SIZES.eraser[sz], c2);
        break;
      case "brush":
        brushStroke(g(), brush, d.last, p, lw, d.fg);
        break;
      case "shape": {
        const o = ov.current as HTMLCanvasElement;
        const x = ctxOf(o);
        x.clearRect(0, 0, o.width, o.height);
        drawShape(
          x,
          shape,
          d.start,
          constrain(d.start, p, e.shiftKey),
          lw,
          outline ? d.fg : null,
          fillOn ? d.bg : null,
        );
        break;
      }
      case "band":
        setBand(rectOf(d.start, p));
        break;
      case "move":
        if (d.sel)
          setSel({ ...d.sel, x: d.sel.x + Math.round(p[0] - d.start[0]), y: d.sel.y + Math.round(p[1] - d.start[1]) });
        break;
      case "grow":
        setGhost(growTo(d, p));
        break;
    }
    d.last = p;
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const p = at(e);
    if (d.kind === "shape") {
      const o = ov.current as HTMLCanvasElement;
      ctxOf(o).clearRect(0, 0, o.width, o.height);
      drawShape(
        g(),
        shape,
        d.start,
        constrain(d.start, p, e.shiftKey),
        lw,
        outline ? d.fg : null,
        fillOn ? d.bg : null,
      );
    } else if (d.kind === "band") {
      const r = rectOf(d.start, p);
      setBand(null);
      if (tool === "select") setSel(r.w && r.h ? { ...r, float: null } : null);
      else {
        const lh = ((font.size * 4) / 3) * 1.2;
        setText({ x: r.x, y: r.y, w: Math.max(r.w, 120), h: Math.max(r.h, lh) });
      }
    } else if (d.kind === "grow") {
      const s = growTo(d, p);
      pushUndo();
      setCanvas(s.w, s.h, snapshot(), c2);
      setGhost(null);
    }
  };

  const growTo = (d: Drag, p: Pt) => ({
    w: d.axis === "s" ? main().width : Math.max(1, Math.round(p[0])),
    h: d.axis === "e" ? main().height : Math.max(1, Math.round(p[1])),
  });
  const startGrow = (e: React.PointerEvent<HTMLDivElement>) => {
    const axis = e.currentTarget.dataset.axis;
    if (e.button !== 0) return;
    e.stopPropagation();
    flush();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: "grow", axis, start: [0, 0], last: [0, 0], fg: c1, bg: c2 };
    setGhost({ ...dims });
  };

  // ---------- keyboard ----------

  const typing = (e: KeyboardEvent) => /^(TEXTAREA|INPUT|SELECT)$/.test((e.target as HTMLElement).tagName);
  const toggleFont = (k: "bold" | "italic" | "underline") => setFont((f) => ({ ...f, [k]: !f[k] }));
  useWinKeys({
    "ctrl+z": (e) => (typing(e) ? false : restore(undo.current, redo.current)),
    "ctrl+y": (e) => (typing(e) ? false : restore(redo.current, undo.current)),
    "ctrl+a": (e) => (typing(e) ? false : selectAll()),
    "ctrl+c": (e) => (typing(e) || !sel ? false : copy()),
    "ctrl+x": (e) => (typing(e) || !sel ? false : cut()),
    delete: (e) => (typing(e) ? false : del()),
    escape: () => (full ? setFull(null) : flush()),
    "ctrl+n": () => void newDoc(),
    "ctrl+o": () => void openDoc(),
    "ctrl+s": () => void save(),
    "ctrl+p": () => print(),
    "ctrl+e": () => void propsDlg(),
    "ctrl+w": () => resizeDlg(),
    "ctrl+g": () => setGrid((v) => !v),
    "ctrl+pageup": () => zoomBy(1),
    "ctrl+pagedown": () => zoomBy(-1),
    f11: () => (flush(), setFull(main().toDataURL())),
    "ctrl+b": () => (text ? toggleFont("bold") : false),
    "ctrl+i": () => (text ? toggleFont("italic") : false),
    "ctrl+u": () => (text ? toggleFont("underline") : false),
  });

  // ---------- ribbon ----------

  const fileMenu: MenuItem[] = [
    { label: L("Yeni", "New"), shortcut: "Ctrl+N", onClick: () => void newDoc() },
    { label: L("Aç", "Open"), shortcut: "Ctrl+O", onClick: () => void openDoc() },
    { label: L("Kaydet", "Save"), shortcut: "Ctrl+S", onClick: () => void save() },
    { label: L("Farklı kaydet", "Save as"), onClick: () => void saveAs() },
    { sep: true },
    { label: L("Yazdır", "Print"), shortcut: "Ctrl+P", onClick: print },
    { sep: true },
    { label: L("Özellikler", "Properties"), shortcut: "Ctrl+E", onClick: propsDlg },
    { label: L("Paint hakkında", "About Paint"), onClick: () => wm.launch("winver", { arg: "paint", owner: id }) },
    { sep: true },
    { label: L("Çıkış", "Exit"), onClick: () => void wm.requestClose(id) },
  ];

  const tools: { id: Tool; label: string; icon: ReactNode }[] = [
    { id: "pencil", label: L("Kurşun kalem", "Pencil"), icon: IC.pencil },
    { id: "fill", label: L("Renkle doldur", "Fill with color"), icon: IC.fill },
    { id: "text", label: L("Metin", "Text"), icon: IC.text },
    { id: "eraser", label: L("Silgi", "Eraser"), icon: IC.eraser },
    { id: "picker", label: L("Renk seçici", "Color picker"), icon: IC.picker },
    { id: "zoom", label: L("Büyüteç", "Magnifier"), icon: IC.zoom },
  ];
  const isBrush = (b: Brush) => tool === "brush" && brush === b;
  const sizes = tool === "pencil" ? SIZES.pencil : tool === "eraser" ? SIZES.eraser : SIZES.line;
  const swatch = (c: string, key: string | number, title?: string) => (
    <button
      key={key}
      className="pt-sw"
      title={title ?? c}
      disabled={!c}
      onClick={() => setColor(c)}
      style={{ background: c || "#fff" }}
    />
  );
  const colorBtn = (n: 1 | 2, c: string) => (
    <button
      className={`pt-cbig ${slot === n ? "on" : ""}`}
      title={
        n === 1
          ? L("Renk 1 (ön plan rengi)", "Color 1 (foreground color)")
          : L("Renk 2 (arka plan rengi)", "Color 2 (background color)")
      }
      onClick={() => setSlot(n)}
    >
      <span className="pt-cbig-sw" style={{ background: c }} />
      <span>
        {L("Renk", "Color")}
        <br />
        {n}
      </span>
    </button>
  );

  const home: RibbonTab = {
    id: "home",
    label: L("Giriş", "Home"),
    groups: [
      {
        label: L("Pano", "Clipboard"),
        items: [
          { label: L("Yapıştır", "Paste"), icon: IC.paste, big: true, onClick: () => void paste() },
          { label: L("Kes", "Cut"), icon: IC.cut, onClick: cut, disabled: !sel },
          { label: L("Kopyala", "Copy"), icon: IC.copy, onClick: copy, disabled: !sel },
        ],
      },
      {
        label: L("Resim", "Image"),
        items: [
          {
            label: L("Seç", "Select"),
            icon: IC.select,
            big: true,
            active: tool === "select",
            menu: [
              { label: L("Dikdörtgen seçim", "Rectangular selection"), onClick: () => pick("select") },
              { sep: true },
              { label: L("Tümünü seç", "Select all"), shortcut: "Ctrl+A", onClick: selectAll },
              { label: L("Sil", "Delete"), shortcut: "Del", onClick: del, disabled: !sel },
            ],
          },
          { label: L("Kırp", "Crop"), icon: IC.crop, onClick: cropToSel, disabled: !sel },
          { label: L("Yeniden boyutlandır", "Resize"), icon: IC.resize, onClick: resizeDlg },
          {
            label: L("Döndür", "Rotate"),
            icon: IC.rotate,
            menu: [
              { label: L("Sağa 90° döndür", "Rotate right 90°"), onClick: () => transform((c) => rotate(c, 90)) },
              { label: L("Sola 90° döndür", "Rotate left 90°"), onClick: () => transform((c) => rotate(c, 270)) },
              { label: L("180° döndür", "Rotate 180°"), onClick: () => transform((c) => rotate(c, 180)) },
              { label: L("Dikey çevir", "Flip vertical"), onClick: () => transform((c) => flip(c, false)) },
              { label: L("Yatay çevir", "Flip horizontal"), onClick: () => transform((c) => flip(c, true)) },
            ],
          },
        ],
      },
      {
        label: L("Araçlar", "Tools"),
        items: [
          <div key="tools" className="pt-tools">
            {tools.map((t) => (
              <button
                key={t.id}
                className={`pt-tb ${tool === t.id ? "on" : ""}`}
                title={t.label}
                onClick={() => pick(t.id)}
              >
                {t.icon}
              </button>
            ))}
          </div>,
        ],
      },
      {
        label: " ",
        items: [
          {
            label: L("Fırçalar", "Brushes"),
            icon: IC.brush,
            big: true,
            active: tool === "brush",
            // Spelled out: menu closures built in a .map() trip the React Compiler's ref analysis.
            menu: [
              { label: L("Fırça", "Brush"), radio: true, checked: isBrush("brush"), onClick: () => pickBrush("brush") },
              {
                label: L("Kaligrafi fırçası 1", "Calligraphy brush 1"),
                radio: true,
                checked: isBrush("cal1"),
                onClick: () => pickBrush("cal1"),
              },
              {
                label: L("Kaligrafi fırçası 2", "Calligraphy brush 2"),
                radio: true,
                checked: isBrush("cal2"),
                onClick: () => pickBrush("cal2"),
              },
              {
                label: L("Püskürtme boya", "Airbrush"),
                radio: true,
                checked: isBrush("air"),
                onClick: () => pickBrush("air"),
              },
            ],
          },
        ],
      },
      {
        label: L("Şekiller", "Shapes"),
        items: [
          <div key="gal" className="pt-gallery">
            {SHAPES.map((s) => (
              <button
                key={s.id}
                className={`pt-tb ${tool === "shape" && shape === s.id ? "on" : ""}`}
                title={tr ? s.tr : s.en}
                onClick={() => (setShape(s.id), pick("shape"))}
              >
                {shapeIcon(s)}
              </button>
            ))}
          </div>,
          {
            label: L("Anahat", "Outline"),
            icon: IC.outline,
            menu: [
              {
                label: L("Anahat yok", "No outline"),
                radio: true,
                checked: !outline,
                onClick: () => setOutline(false),
              },
              { label: L("Düz renk", "Solid color"), radio: true, checked: outline, onClick: () => setOutline(true) },
            ],
          },
          {
            label: L("Dolgu", "Fill"),
            icon: IC.fillShape,
            menu: [
              { label: L("Dolgu yok", "No fill"), radio: true, checked: !fillOn, onClick: () => setFillOn(false) },
              { label: L("Düz renk", "Solid color"), radio: true, checked: fillOn, onClick: () => setFillOn(true) },
            ],
          },
        ],
      },
      {
        label: "  ",
        items: [
          {
            label: L("Boyut", "Size"),
            icon: IC.size,
            big: true,
            menu: sizes.map((n, i) => ({ label: `${n} px`, radio: true, checked: sz === i, onClick: () => setSz(i) })),
          },
        ],
      },
      {
        label: L("Renkler", "Colors"),
        items: [
          <div key="colors" className="pt-colors">
            {colorBtn(1, c1)}
            {colorBtn(2, c2)}
            <div className="pt-pal">
              {PALETTE.map((c) => swatch(c, c))}
              {custom.map((c, i) => swatch(c, `u${i}`, c || L("Özel renk", "Custom color")))}
            </div>
          </div>,
          { label: L("Renkleri düzenle", "Edit colors"), icon: IC.editColors, big: true, onClick: editColors },
        ],
      },
    ],
  };

  const check = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label key={label} className="pt-chk">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );
  const view: RibbonTab = {
    id: "view",
    label: L("Görünüm", "View"),
    groups: [
      {
        label: L("Yakınlaştır", "Zoom"),
        items: [
          {
            label: L("Yakınlaştır", "Zoom in"),
            icon: IC.zoomIn,
            big: true,
            onClick: () => zoomBy(1),
            disabled: zoom >= 8,
          },
          {
            label: L("Uzaklaştır", "Zoom out"),
            icon: IC.zoomOut,
            big: true,
            onClick: () => zoomBy(-1),
            disabled: zoom <= 0.125,
          },
          { label: L("%100", "100%"), icon: IC.zoom100, big: true, onClick: () => setZoom(1) },
        ],
      },
      {
        label: L("Göster veya gizle", "Show or hide"),
        items: [
          check(L("Kılavuz çizgileri", "Gridlines"), grid, setGrid),
          check(L("Durum çubuğu", "Status bar"), status, setStatus),
        ],
      },
      {
        label: L("Ekran", "Display"),
        items: [
          {
            label: L("Tam ekran", "Full screen"),
            icon: IC.full,
            big: true,
            onClick: () => (flush(), setFull(main().toDataURL())),
          },
        ],
      },
    ],
  };

  const textTab: RibbonTab = {
    id: "text",
    label: L("Metin", "Text"),
    groups: [
      {
        label: L("Yazı tipi", "Font"),
        items: [
          <div key="font" className="pt-font">
            <div>
              <select
                className="w8-select pt-font-fam"
                value={font.family}
                onChange={(e) => setFont((f) => ({ ...f, family: e.target.value }))}
              >
                {FONTS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <select
                className="w8-select"
                value={font.size}
                onChange={(e) => setFont((f) => ({ ...f, size: Number(e.target.value) }))}
              >
                {FONT_SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              {(["bold", "italic", "underline"] as const).map((k, i) => (
                <button
                  key={k}
                  className={`pt-tb pt-fs-${k} ${font[k] ? "on" : ""}`}
                  title={[L("Kalın", "Bold"), L("İtalik", "Italic"), L("Altı çizili", "Underline")][i]}
                  onClick={() => toggleFont(k)}
                >
                  {(tr ? "KTA" : "BIU")[i]}
                </button>
              ))}
            </div>
          </div>,
        ],
      },
      {
        label: L("Arka plan", "Background"),
        items: [
          {
            label: L("Opak", "Opaque"),
            icon: IC.opaque,
            big: true,
            active: font.opaque,
            onClick: () => setFont((f) => ({ ...f, opaque: true })),
          },
          {
            label: L("Saydam", "Transparent"),
            icon: IC.transparent,
            big: true,
            active: !font.opaque,
            onClick: () => setFont((f) => ({ ...f, opaque: false })),
          },
        ],
      },
    ],
  };

  const qat = (
    <span className="pt-qat">
      <button
        title={L("Geri al (Ctrl+Z)", "Undo (Ctrl+Z)")}
        disabled={!hist.u}
        onClick={() => restore(undo.current, redo.current)}
      >
        {IC.undo}
      </button>
      <button
        title={L("Yinele (Ctrl+Y)", "Redo (Ctrl+Y)")}
        disabled={!hist.r}
        onClick={() => restore(redo.current, undo.current)}
      >
        {IC.redo}
      </button>
    </span>
  );

  // ---------- render ----------

  const marquee = band ?? sel;
  const eraserPx = SIZES.eraser[sz] * zoom;
  const showSize = ghost ?? dims;

  return (
    <div className="pt" onContextMenu={(e) => e.preventDefault()}>
      <Ribbon
        key={text ? "text" : "main"}
        initial={text ? "text" : "home"}
        tabs={text ? [home, view, textTab] : [home, view]}
        fileLabel={L("Dosya", "File")}
        fileMenu={fileMenu}
        right={qat}
      />
      <div className="pt-work" ref={work}>
        <div className="pt-pad">
          <div
            ref={page}
            className={`pt-page cur-${tool} ${zoom > 1 ? "px" : ""}`}
            style={{ width: dims.w * zoom, height: dims.h * zoom }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => setPos(null)}
          >
            <canvas ref={cv} />
            <canvas ref={ov} />
            {grid && zoom >= 2 && <div className="pt-grid" style={{ backgroundSize: `${zoom}px ${zoom}px` }} />}
            {marquee && (
              <div
                className={`pt-marq ${sel && !band && tool === "select" ? "sel" : ""}`}
                style={{
                  left: marquee.x * zoom,
                  top: marquee.y * zoom,
                  width: marquee.w * zoom,
                  height: marquee.h * zoom,
                }}
              />
            )}
            {text && (
              <textarea
                ref={ta}
                key={`${text.x},${text.y}`}
                className="pt-text"
                autoFocus
                spellCheck={false}
                style={{
                  left: text.x * zoom,
                  top: text.y * zoom,
                  width: text.w * zoom,
                  minHeight: text.h * zoom,
                  font: fontCss(font, zoom),
                  textDecoration: font.underline ? "underline" : "none",
                  color: c1,
                  background: font.opaque ? c2 : "transparent",
                }}
                rows={1}
                onInput={(e) => {
                  setDirty(true);
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = `${t.scrollHeight}px`;
                }}
              />
            )}
            {tool === "eraser" && pos && (
              <div
                className="pt-ecur"
                style={{
                  left: (pos[0] - Math.floor(SIZES.eraser[sz] / 2)) * zoom,
                  top: (pos[1] - Math.floor(SIZES.eraser[sz] / 2)) * zoom,
                  width: eraserPx,
                  height: eraserPx,
                }}
              />
            )}
            {ghost && <div className="pt-ghost" style={{ width: ghost.w * zoom, height: ghost.h * zoom }} />}
            <div className="pt-h e" data-axis="e" onPointerDown={startGrow} />
            <div className="pt-h s" data-axis="s" onPointerDown={startGrow} />
            <div className="pt-h se" data-axis="se" onPointerDown={startGrow} />
          </div>
        </div>
      </div>
      {status && (
        <div className="pt-status">
          <span className="pt-st">
            {sv(16, <path d="M8 2v12M2 8h12" stroke="#555" />)}
            {pos ? `${pos[0]}, ${pos[1]}px` : ""}
          </span>
          <span className="pt-st">
            {sv(16, <rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="#555" strokeDasharray="2 1" />)}
            {marquee ? `${marquee.w} × ${marquee.h}px` : ""}
          </span>
          <span className="pt-st">
            {sv(16, <rect x="2.5" y="3.5" width="11" height="9" fill="#fff" stroke="#555" />)}
            {`${showSize.w} × ${showSize.h}px`}
          </span>
          <span className="pt-st-fill" />
          <span className="pt-zoom">
            <span className="pt-zoom-pct">
              {L(`%${Math.round(zoom * 1000) / 10}`, `${Math.round(zoom * 1000) / 10}%`)}
            </span>
            <button onClick={() => zoomBy(-1)} aria-label={L("Uzaklaştır", "Zoom out")}>
              −
            </button>
            <input
              type="range"
              min={0}
              max={ZOOMS.length - 1}
              value={ZOOMS.indexOf(zoom)}
              onChange={(e) => setZoom(ZOOMS[Number(e.target.value)])}
            />
            <button onClick={() => zoomBy(1)} aria-label={L("Yakınlaştır", "Zoom in")}>
              +
            </button>
          </span>
        </div>
      )}
      <input ref={colorIn} type="color" className="pt-hidden" tabIndex={-1} aria-hidden="true" />
      {pending?.art && (
        <div ref={artBox} className="pt-hidden">
          <CoverArt {...pending.art} />
        </div>
      )}
      {full &&
        createPortal(
          <div className="pt-full" style={{ backgroundImage: `url(${full})` }} onClick={() => setFull(null)} />,
          document.body,
        )}
    </div>
  );
}

// ---------- dialogs ----------

function PropsDlg({
  lang,
  w,
  h,
  apply,
  close,
}: {
  lang: Lang;
  w: number;
  h: number;
  apply: (w: number, h: number) => void;
  close: () => void;
}) {
  const tr = lang === "tr";
  const [vw, setW] = useState(String(w));
  const [vh, setH] = useState(String(h));
  const ok = () => apply(clamp(Number(vw) || w, 1, 4000), clamp(Number(vh) || h, 1, 4000));
  useWinKeys({ escape: close, enter: ok });
  return (
    <div className="pt-dlg">
      <fieldset className="pt-group">
        <legend>{tr ? "Birimler: Piksel" : "Units: Pixels"}</legend>
        <label className="pt-row">
          <span>{tr ? "Genişlik:" : "Width:"}</span>
          <input className="w8-input" value={vw} onChange={(e) => setW(e.target.value.replace(/\D/g, ""))} autoFocus />
        </label>
        <label className="pt-row">
          <span>{tr ? "Yükseklik:" : "Height:"}</span>
          <input className="w8-input" value={vh} onChange={(e) => setH(e.target.value.replace(/\D/g, ""))} />
        </label>
      </fieldset>
      <div className="pt-dlg-btns">
        <Btn primary onClick={ok}>
          {tr ? "Tamam" : "OK"}
        </Btn>
        <Btn onClick={close}>{tr ? "İptal" : "Cancel"}</Btn>
        <Btn onClick={() => (setW(String(W0)), setH(String(H0)))}>{tr ? "Varsayılan" : "Default"}</Btn>
      </div>
    </div>
  );
}

function ResizeDlg({
  lang,
  w,
  h,
  apply,
  close,
}: {
  lang: Lang;
  w: number;
  h: number;
  apply: (w: number, h: number, ax: number, ay: number) => void;
  close: () => void;
}) {
  const tr = lang === "tr";
  const L = (a: string, b: string) => (tr ? a : b);
  const [pct, setPct] = useState(true);
  const [keep, setKeep] = useState(true);
  const [rh, setRh] = useState("100");
  const [rv, setRv] = useState("100");
  const [sh, setSh] = useState("0");
  const [sv2, setSv2] = useState("0");
  const num = (s: string) => Number(s.replace(/[^\d-]/g, "")) || 0;
  const setHor = (s: string) => {
    setRh(s);
    if (keep) setRv(pct ? s : String(Math.round((num(s) * h) / w)));
  };
  const setVer = (s: string) => {
    setRv(s);
    if (keep) setRh(pct ? s : String(Math.round((num(s) * w) / h)));
  };
  const mode = (p: boolean) => {
    if (p === pct) return;
    setPct(p);
    setRh(p ? String(Math.round((num(rh) / w) * 100)) : String(Math.round((num(rh) * w) / 100)));
    setRv(p ? String(Math.round((num(rv) / h) * 100)) : String(Math.round((num(rv) * h) / 100)));
  };
  const ok = () => {
    const nw = pct ? (w * num(rh)) / 100 : num(rh);
    const nh = pct ? (h * num(rv)) / 100 : num(rv);
    apply(
      clamp(Math.round(nw), 1, 4000),
      clamp(Math.round(nh), 1, 4000),
      clamp(num(sh), -89, 89),
      clamp(num(sv2), -89, 89),
    );
  };
  useWinKeys({ escape: close, enter: ok });
  const field = (label: string, v: string, set: (s: string) => void) => (
    <label className="pt-row">
      <span>{label}</span>
      <input className="w8-input" value={v} onChange={(e) => set(e.target.value.replace(/[^\d-]/g, ""))} />
    </label>
  );
  return (
    <div className="pt-dlg">
      <fieldset className="pt-group">
        <legend>{L("Yeniden boyutlandır", "Resize")}</legend>
        <div className="pt-row">
          <span>{L("Ölçüt:", "By:")}</span>
          <label>
            <input type="radio" checked={pct} onChange={() => mode(true)} /> {L("Yüzde", "Percentage")}
          </label>
          <label>
            <input type="radio" checked={!pct} onChange={() => mode(false)} /> {L("Piksel", "Pixels")}
          </label>
        </div>
        {field(L("Yatay:", "Horizontal:"), rh, setHor)}
        {field(L("Dikey:", "Vertical:"), rv, setVer)}
        <label className="pt-row">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          {L("En boy oranını koru", "Maintain aspect ratio")}
        </label>
      </fieldset>
      <fieldset className="pt-group">
        <legend>{L("Eğ (Derece)", "Skew (Degrees)")}</legend>
        {field(L("Yatay:", "Horizontal:"), sh, setSh)}
        {field(L("Dikey:", "Vertical:"), sv2, setSv2)}
      </fieldset>
      <div className="pt-dlg-btns">
        <Btn primary onClick={ok}>
          {L("Tamam", "OK")}
        </Btn>
        <Btn onClick={close}>{L("İptal", "Cancel")}</Btn>
      </div>
    </div>
  );
}
