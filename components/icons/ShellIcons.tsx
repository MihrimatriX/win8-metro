"use client";
/**
 * Colorful desktop (Win32) icons in the Windows 8 style: folders, drives, programs and file types.
 * All original SVG drawings on a 48×48 canvas, in the Windows 7/8 manner: soft vertical gradients,
 * a crisp 1px darker outline (drawn inside the shape, so edges on the 3-unit grid stay sharp at 16px),
 * a light top highlight. Busy icons draw a simplified version at 16–20px.
 * Gradient/clip ids are made unique per instance with useId.
 */
import { useId, type ReactNode } from "react";
import type { ShellIconName } from "@/lib/model";
import { WIN_PANES } from "../Icons";

/** Drawing context handed to every drawer. */
type Ctx = {
  /** Unique id for a gradient or clip path in this icon instance. */
  id: (k: string) => string;
  /** `url(#…)` reference to that id. */
  url: (k: string) => string;
  /** Small rendering (≤ 20px): drop fine detail. */
  sm: boolean;
  /** Outline width in viewBox units: one device pixel up to 48px, 1.5px above. */
  o: number;
};

type Stop = string | [number, string] | [number, string, number];

/** Linear gradient; `v` = x1 y1 x2 y2 (bounding-box fractions, or user units when `user`). */
function lg(c: Ctx, k: string, stops: Stop[], v: [number, number, number, number] = [0, 0, 0, 1], user = false) {
  return (
    <linearGradient
      id={c.id(k)}
      x1={v[0]}
      y1={v[1]}
      x2={v[2]}
      y2={v[3]}
      gradientUnits={user ? "userSpaceOnUse" : undefined}
    >
      {stopsOf(stops)}
    </linearGradient>
  );
}

/** Radial gradient centered at (cx, cy) with radius r and focus (fx, fy), in bounding-box fractions. */
function rg(c: Ctx, k: string, stops: Stop[], cx = 0.5, cy = 0.5, r = 0.5, fx = cx, fy = cy) {
  return (
    <radialGradient id={c.id(k)} cx={cx} cy={cy} r={r} fx={fx} fy={fy}>
      {stopsOf(stops)}
    </radialGradient>
  );
}

function stopsOf(stops: Stop[]) {
  return stops.map((s, i) => {
    const [off, col, op] = typeof s === "string" ? [stops.length === 1 ? 0 : i / (stops.length - 1), s, undefined] : s;
    return <stop key={i} offset={off} stopColor={col} stopOpacity={op} />;
  });
}

/** A filled shape with its outline drawn on the inside (clipped double-width stroke). */
function sh(c: Ctx, k: string, d: string, fill: string, stroke: string, w = c.o) {
  return (
    <>
      <clipPath id={c.id(k)}>
        <path d={d} />
      </clipPath>
      <path d={d} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={w * 2} clipPath={c.url(k)} />
    </>
  );
}

/** Rounded-rectangle path. */
function rr(x: number, y: number, w: number, h: number, r = 0) {
  if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** Circle path (so circles can use the inner-outline helper and even-odd holes). */
function cp(cx: number, cy: number, r: number) {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
}

/** Ellipse path. */
function ep(cx: number, cy: number, rx: number, ry: number) {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
}

/** A one-pixel light line just inside the top edge of a shape (the glassy Win7/8 highlight). */
function hi(c: Ctx, x1: number, x2: number, y: number, color = "#fff", op = 0.8) {
  return <path d={`M${x1} ${y + c.o * 1.5}H${x2}`} stroke={color} strokeWidth={c.o} opacity={op} />;
}

/** Five-pointed star polygon points. */
function star(cx: number, cy: number, R: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

// ───────────────────────────── shared parts ─────────────────────────────

/** A context for a part drawn scaled by `s` (own id namespace, outline kept at one pixel). */
function sub(c: Ctx, k: string, s: number): Ctx {
  return { id: (x) => c.id(k + x), url: (x) => c.url(k + x), sm: c.sm, o: c.o / s };
}

/** The Windows 8 logo (four panes in perspective) in a `s`-unit square at (x, y). */
function winLogo(x: number, y: number, s: number, fill: string) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s / 100})`}>
      {WIN_PANES.map((pts) => (
        <polygon key={pts} points={pts} fill={fill} />
      ))}
    </g>
  );
}

/** Manila folder. `inner` replaces the paper sheets (library folders), `over` is drawn on top. */
function folder(c: Ctx, opt: { inner?: ReactNode; over?: ReactNode; open?: boolean } = {}) {
  const back = "M4.5 9H16.5L19.5 12H43.5Q45 12 45 13.5V40.5Q45 42 43.5 42H4.5Q3 42 3 40.5V10.5Q3 9 4.5 9Z";
  const front = opt.open
    ? "M11 21H45.4Q47 21 46.6 22.5L41.6 40.8Q41.3 42 39.8 42H4.6Q3 42 3.4 40.5L8.8 22.3Q9.3 21 11 21Z"
    : rr(3, 18, 42, 24, 1.5);
  return (
    <>
      {lg(c, "fb", ["#eab340", "#d4952a"])}
      {sh(c, "fbc", back, c.url("fb"), "#ad7720")}
      {opt.inner ?? paper(c, opt.open)}
      {lg(c, "ff", [
        [0, "#ffe9a0"],
        [0.45, "#ffd862"],
        [1, "#f4c044"],
      ])}
      {sh(c, "ffc", front, c.url("ff"), "#c99430")}
      {opt.open ? (
        <path d={`M11 ${21 + c.o * 1.5}H45`} stroke="#fff6d2" strokeWidth={c.o} opacity={0.9} />
      ) : (
        hi(c, 4.5, 43.5, 18, "#fff6d2", 0.95)
      )}
      {opt.over}
    </>
  );
}

/** White paper sheets peeking out of a folder. */
function paper(c: Ctx, open = false) {
  if (c.sm) return <rect x={6} y={15} width={36} height={6} fill="#fff" />;
  return (
    <>
      <path d="M7.5 15.5L39 12.5L40.5 31H8.5Z" fill="#f1f1f1" stroke="#c4c4c4" strokeWidth={c.o * 0.75} />
      <rect x={6.5} y={open ? 14 : 14.5} width={35} height={18} fill="#fff" stroke="#bdbdbd" strokeWidth={c.o * 0.75} />
    </>
  );
}

/** Blank page with a folded top-right corner. */
function page(c: Ctx) {
  return (
    <>
      {lg(c, "pg", ["#ffffff", "#eef0f3"])}
      {sh(c, "pgc", "M9 3H30L39 12V45H9Z", c.url("pg"), "#8c949d")}
      {lg(c, "pgf", ["#ffffff", "#d7dce2"], [1, 0, 0, 1])}
      <path d="M30 3V12H39Z" fill={c.url("pgf")} stroke="#8c949d" strokeWidth={c.o} strokeLinejoin="round" />
    </>
  );
}

/** Horizontal text lines (snapped to whole pixels when small). */
function lines(c: Ctx, x1: number, x2: number | number[], ys: number[], color: string, w = 1.5) {
  return ys.map((y, i) => {
    const xe = Array.isArray(x2) ? x2[i % x2.length] : x2;
    return <path key={i} d={`M${x1} ${y}H${xe}`} stroke={color} strokeWidth={c.sm ? c.o : w} />;
  });
}

/** Flat monitor with a glossy screen: bezel 3..45 × 6..36, screen 6..42 × 9..33, silver stand. */
function monitor(c: Ctx, screen: ReactNode, glare = true) {
  return (
    <>
      {lg(c, "mn", ["#d5dadf", "#8b939b"])}
      <path d="M20 35H28L29 40H19Z" fill={c.url("mn")} />
      {lg(c, "mb", ["#f3f5f7", "#b2b9c0"])}
      {sh(c, "mbc", c.sm ? rr(12, 39, 24, 4.5, 1.5) : rr(12.5, 39, 23, 5, 2.5), c.url("mb"), "#6f7780")}
      {lg(c, "mz", ["#4b525a", "#1b1f23"])}
      {sh(c, "mzc", rr(3, 6, 42, 30, 1.5), c.url("mz"), "#0d0f11")}
      <clipPath id={c.id("ms")}>
        <rect x={6} y={9} width={36} height={24} />
      </clipPath>
      <g clipPath={c.url("ms")}>
        {screen}
        {glare && <path d="M6 9H33L19 33H6Z" fill="#fff" opacity={0.13} />}
      </g>
    </>
  );
}

/** The standard blue Windows screen. */
function blueScreen(c: Ctx) {
  return (
    <>
      {lg(c, "sc", [
        [0, "#5bc2fb"],
        [0.5, "#1e90ff"],
        [1, "#0a56bf"],
      ])}
      <rect x={6} y={9} width={36} height={24} fill={c.url("sc")} />
    </>
  );
}

/** Internet Explorer: the blue "e" with its gold orbit, drawn on the full 48 canvas. */
function ieLogo(c: Ctx, k = "ie") {
  const cx = 24.5;
  const cy = 25.5;
  const r = 10.25;
  const w = 7.2;
  const a = (34 * Math.PI) / 180;
  // The "e": an almost-closed ring stroke plus a bar that runs out to the right edge.
  const arc = `M${cx + r} ${cy + 0.4}A${r} ${r} 0 1 0 ${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const bar = `M${cx - r} ${cy + 0.4}H${cx + r + w / 2}`;
  // The orbit: a crescent (outer minus offset inner ellipse), thick at the top, tilted up to the right.
  const ring = `${ep(24, 24, 23, 10.5)}${ep(23.2, 25.8, 21.2, 7.6)}`;
  const tilt = "rotate(-28 24 24)";
  return (
    <>
      {lg(c, k + "r", [
        [0, "#ffe668"],
        [0.45, "#fdb913"],
        [1, "#e57b00"],
      ])}
      {lg(
        c,
        k + "e",
        [
          [0, "#9ae6ff"],
          [0.3, "#2bb8f5"],
          [0.75, "#0f74d6"],
          [1, "#0a53b8"],
        ],
        [0, cy - 14, 0, cy + 14],
        true,
      )}
      <clipPath id={c.id(k + "f")}>
        <rect x={-10} y={-10} width={68} height={34} transform={tilt} />
      </clipPath>
      <path
        d={ring}
        transform={tilt}
        fillRule="evenodd"
        fill={c.url(k + "r")}
        stroke="#b35d00"
        strokeWidth={c.o * 0.7}
      />
      <path d={`${arc}${bar}`} fill="none" stroke="#0a4a9c" strokeWidth={w + c.o * 1.4} />
      <path d={arc} fill="none" stroke={c.url(k + "e")} strokeWidth={w} />
      <path d={bar} fill="none" stroke={c.url(k + "e")} strokeWidth={w * 0.6} />
      <g clipPath={c.url(k + "f")}>
        <path
          d={ring}
          transform={tilt}
          fillRule="evenodd"
          fill={c.url(k + "r")}
          stroke="#b35d00"
          strokeWidth={c.o * 0.7}
        />
      </g>
    </>
  );
}

/** A globe (oceans, two continents, meridians) of radius r. */
function globe(c: Ctx, k: string, cx: number, cy: number, r: number) {
  return (
    <>
      {rg(
        c,
        k,
        [
          [0, "#c7eeff"],
          [0.45, "#47aef2"],
          [1, "#0f56b3"],
        ],
        0.4,
        0.38,
        0.65,
        0.35,
        0.28,
      )}
      <path d={cp(cx, cy, r)} fill={c.url(k)} />
      <clipPath id={c.id(k + "c")}>
        <path d={cp(cx, cy, r)} />
      </clipPath>
      <g clipPath={c.url(k + "c")}>
        <g transform={`translate(${cx} ${cy}) scale(${r / 16})`}>
          {lg(c, k + "l", ["#9be06a", "#3d9a24"])}
          <path
            d="M-10 -12C-5 -14 -1 -11 -3 -6C-5 -3 -2 0 -4 3C-6 7 -5 11 -8 14C-10 9 -12 4 -11 0C-15 -2 -14 -8 -10 -12ZM4 -13C8 -14 13 -11 14 -6C16 -2 12 2 9 1C7 4 8 8 5 12C3 8 2 4 3 0C0 -2 1 -9 4 -13Z"
            fill={c.url(k + "l")}
          />
          {!c.sm && (
            <g fill="none" stroke="#fff" strokeWidth={0.8} opacity={0.35}>
              <ellipse cx={0} cy={0} rx={7} ry={16} />
              <path d="M0 -16V16M-16 0H16M-14 -7.5H14M-14 7.5H14" />
            </g>
          )}
        </g>
        <ellipse cx={cx - r * 0.25} cy={cy - r * 0.5} rx={r * 0.7} ry={r * 0.42} fill="#fff" opacity={0.22} />
      </g>
      <path d={cp(cx, cy, r)} fill="none" stroke="#0c4a93" strokeWidth={c.o} />
    </>
  );
}

/** A person (head and shoulders), 30·s units tall, top-center at (cx, top). */
function person(c: Ctx, k: string, cx: number, top: number, s: number, shirt: [string, string], edge: string) {
  return (
    <g transform={`translate(${cx} ${top}) scale(${s})`}>
      {lg(c, k + "s", shirt)}
      <path
        d="M-11.5 30C-11.5 21 -6.5 16.5 0 16.5C6.5 16.5 11.5 21 11.5 30Z"
        fill={c.url(k + "s")}
        stroke={edge}
        strokeWidth={c.o / s}
      />
      {lg(c, k + "h", ["#ffe2c2", "#e9b17f"])}
      <circle cx={0} cy={8.5} r={7} fill={c.url(k + "h")} stroke="#a86f45" strokeWidth={c.o / s} />
      <path
        d="M-7.2 8.2C-7.6 2.6 -3.6 1.2 0 1.2C4.3 1.2 7.7 3.4 7.2 8.6C5.6 6 2.4 5.2 -0.6 4.6C-2.6 6.2 -4.8 7.4 -7.2 8.2Z"
        fill="#6b4425"
      />
    </g>
  );
}

/** A grey silhouette (the default account picture). */
function silhouette(c: Ctx, k: string) {
  return (
    <>
      {lg(c, k, ["#a9b6c3", "#6e8093"])}
      <circle cx={24} cy={17.5} r={7.5} fill={c.url(k)} />
      <path d="M9.5 45C9.5 33 15.5 27.5 24 27.5C32.5 27.5 38.5 33 38.5 45Z" fill={c.url(k)} />
    </>
  );
}

/** An optical disc with a rainbow sheen. */
function disc(c: Ctx, k: string, cx: number, cy: number, r: number) {
  return (
    <>
      {lg(
        c,
        k,
        [
          [0, "#f4f6f9"],
          [0.25, "#cfe9ff"],
          [0.45, "#f7d5f2"],
          [0.6, "#fff2c4"],
          [0.75, "#d3f3dc"],
          [1, "#aab4bf"],
        ],
        [0, 0, 1, 1],
      )}
      <path
        d={`${cp(cx, cy, r)}${cp(cx, cy, r * 0.16)}`}
        fillRule="evenodd"
        fill={c.url(k)}
        stroke="#7f8b97"
        strokeWidth={c.o}
      />
      {!c.sm && (
        <path
          d={`${cp(cx, cy, r * 0.36)}${cp(cx, cy, r * 0.16)}`}
          fillRule="evenodd"
          fill="#e9edf1"
          stroke="#a3adb7"
          strokeWidth={c.o * 0.6}
          opacity={0.9}
        />
      )}
    </>
  );
}

/** Two beamed eighth notes. */
function notes(c: Ctx, k: string, fill: [string, string], edge: string) {
  return (
    <>
      {lg(c, k, fill)}
      <path
        d="M17 13.5L36 9V33.5A5 4 0 1 1 32.5 29.6V17.4L20.5 20.2V37.5A5 4 0 1 1 17 33.6Z"
        fill={c.url(k)}
        stroke={edge}
        strokeWidth={c.o}
        strokeLinejoin="round"
      />
    </>
  );
}

/** A film strip with two blue frames, in a 30×20 box at (x, y). */
function film(c: Ctx, k: string, x: number, y: number) {
  const holes = [];
  for (let i = 0; i < 6; i++)
    holes.push(
      <rect key={i} x={x + 2 + i * 4.8} y={y + 1.3} width={2.4} height={2} rx={0.4} fill="#d8dde2" />,
      <rect key={`b${i}`} x={x + 2 + i * 4.8} y={y + 16.7} width={2.4} height={2} rx={0.4} fill="#d8dde2" />,
    );
  return (
    <>
      <rect x={x} y={y} width={30} height={20} rx={1} fill="#25292e" stroke="#0e1012" strokeWidth={c.o} />
      {!c.sm && holes}
      {lg(c, k, ["#8fd5ff", "#1b74d1"])}
      <rect x={x + 2} y={y + 4.5} width={12} height={11} fill={c.url(k)} />
      <rect x={x + 16} y={y + 4.5} width={12} height={11} fill={c.url(k)} />
    </>
  );
}

/** A landscape picture (sky, sun, two hills) filling the given rectangle. */
function landscape(c: Ctx, k: string, x: number, y: number, w: number, h: number) {
  return (
    <>
      <clipPath id={c.id(k + "c")}>
        <rect x={x} y={y} width={w} height={h} />
      </clipPath>
      <g clipPath={c.url(k + "c")}>
        {lg(c, k + "s", ["#3c9ff0", "#bfe6ff"])}
        <rect x={x} y={y} width={w} height={h} fill={c.url(k + "s")} />
        <circle cx={x + w * 0.74} cy={y + h * 0.3} r={h * 0.14} fill="#fff4b0" />
        {lg(c, k + "g", ["#8ad44e", "#2f8a1f"])}
        <path
          d={`M${x} ${y + h * 0.62}Q${x + w * 0.3} ${y + h * 0.32} ${x + w * 0.62} ${y + h * 0.7}Q${x + w * 0.82} ${y + h * 0.5} ${x + w} ${y + h * 0.58}V${y + h}H${x}Z`}
          fill={c.url(k + "g")}
        />
        <path
          d={`M${x} ${y + h * 0.86}Q${x + w * 0.5} ${y + h * 0.66} ${x + w} ${y + h * 0.84}V${y + h}H${x}Z`}
          fill="#3e9a26"
          opacity={0.85}
        />
      </g>
    </>
  );
}

/** The shortcut overlay: a small white box with a blue curved arrow, bottom-left. */
function shortcut(c: Ctx) {
  return (
    <>
      {sh(c, "lk", rr(1.5, 30, 16.5, 16.5, 1.5), "#fff", "#6d7884")}
      <path d="M6 43.5C6 38 8.5 35.8 13 35.8" fill="none" stroke="#1a6fd1" strokeWidth={2.6} />
      <path d="M11.8 32L16.2 35.8L11.8 39.6Z" fill="#1a6fd1" />
    </>
  );
}

/** Hard-disk box: top face 24..33, front face 33..42 (both on the 16px grid). */
function driveBox(c: Ctx) {
  return (
    <>
      {lg(c, "dt", ["#fbfcfd", "#cdd3d9"])}
      {sh(c, "dtc", "M8.5 24H39.5L45 33H3Z", c.url("dt"), "#6b737c")}
      {lg(c, "df", [
        [0, "#aeb6be"],
        [0.5, "#8d959e"],
        [1, "#6c747d"],
      ])}
      {sh(c, "dfc", "M3 33H45V40.5Q45 42 43.5 42H4.5Q3 42 3 40.5Z", c.url("df"), "#4f565e")}
      {hi(c, 4.5, 43.5, 33, "#e8ecef", 0.7)}
      {c.sm ? (
        <rect x={36} y={36} width={3} height={3} fill="#5df04a" />
      ) : (
        <>
          <path d="M7.5 37.5H30" stroke="#5a6169" strokeWidth={1.5} />
          <path d="M7.5 39H30" stroke="#bfc6cc" strokeWidth={0.75} />
          <rect x={36} y={35.5} width={4.5} height={2.5} rx={0.6} fill="#57e244" stroke="#2f8a22" strokeWidth={0.6} />
        </>
      )}
    </>
  );
}

/** Round message-box badge (info/error/question). */
function badge(c: Ctx, top: string, bottom: string, edge: string, glyph: ReactNode) {
  return (
    <>
      {lg(c, "bd", [top, bottom])}
      {sh(c, "bdc", cp(24, 24, 21), c.url("bd"), edge)}
      {!c.sm && <ellipse cx={24} cy={14} rx={15} ry={9} fill="#fff" opacity={0.18} />}
      {glyph}
    </>
  );
}

/** A small analog clock face. */
function clockFace(c: Ctx, k: string, cx: number, cy: number, r: number) {
  const ticks = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const big = i % 3 === 0;
    const r1 = r * (big ? 0.68 : 0.76);
    const r2 = r * 0.86;
    if (c.sm && !big) continue;
    ticks.push(
      <path
        key={i}
        d={`M${(cx + r1 * Math.sin(a)).toFixed(2)} ${(cy - r1 * Math.cos(a)).toFixed(2)}L${(cx + r2 * Math.sin(a)).toFixed(2)} ${(cy - r2 * Math.cos(a)).toFixed(2)}`}
        stroke="#4a525b"
        strokeWidth={big ? r * 0.09 : r * 0.05}
      />,
    );
  }
  return (
    <>
      {lg(c, k + "r", ["#f4f6f8", "#8e98a3"])}
      <path d={cp(cx, cy, r)} fill={c.url(k + "r")} stroke="#56606a" strokeWidth={c.o} />
      {rg(c, k + "f", [
        [0, "#ffffff"],
        [0.8, "#f4f7fa"],
        [1, "#d5dde5"],
      ])}
      <circle cx={cx} cy={cy} r={r * 0.88} fill={c.url(k + "f")} stroke="#9aa4ae" strokeWidth={c.o * 0.6} />
      {ticks}
      <path
        d={`M${cx} ${cy}L${cx - r * 0.42} ${cy - r * 0.26}`}
        stroke="#1f2328"
        strokeWidth={r * 0.11}
        strokeLinecap="round"
      />
      <path
        d={`M${cx} ${cy}L${cx + r * 0.36} ${cy - r * 0.56}`}
        stroke="#1f2328"
        strokeWidth={r * 0.08}
        strokeLinecap="round"
      />
      {!c.sm && (
        <path
          d={`M${cx - r * 0.12} ${cy + r * 0.2}L${cx + r * 0.3} ${cy - r * 0.5}`}
          stroke="#d83b2b"
          strokeWidth={r * 0.035}
        />
      )}
      <circle cx={cx} cy={cy} r={r * 0.08} fill="#1f2328" />
    </>
  );
}

// ───────────────────────────── the icons ─────────────────────────────

const DRAW: Record<ShellIconName, (c: Ctx) => ReactNode> = {
  // ── Folders ──
  folder: (c) => folder(c),
  "folder-open": (c) => folder(c, { open: true }),
  "folder-documents": (c) =>
    folder(c, {
      inner: (
        <>
          <g transform="rotate(-7 22 20)">{sh(c, "d1", rr(9, 6, 24, 26), "#f4f4f4", "#9aa3ad")}</g>
          {sh(c, "d2", rr(15, 5, 24, 26), "#fff", "#8e98a2")}
          {!c.sm && lines(c, 18.5, [35.5, 32, 35.5], [9.5, 12.5, 15.5], "#7f9fc4", 1.2)}
          {c.sm && <path d="M18 10.5H36" stroke="#7f9fc4" strokeWidth={c.o} />}
        </>
      ),
    }),
  "folder-pictures": (c) =>
    folder(c, {
      inner: (
        <g transform="rotate(-5 24 18)">
          {sh(c, "pf", rr(8, 3, 32, 25), "#fff", "#8a939c")}
          {landscape(c, "pl", 10.5, 5.5, 27, 20)}
        </g>
      ),
    }),
  "folder-music": (c) =>
    folder(c, {
      inner: <>{disc(c, "md", 24, 17, 13.5)}</>,
      over: c.sm ? undefined : (
        <g transform="translate(12.5 18.5) scale(0.48)">{notes(c, "mn2", ["#58c4fa", "#1666c9"], "#0d4d99")}</g>
      ),
    }),
  "folder-videos": (c) => folder(c, { inner: <g transform="rotate(-4 24 16)">{film(c, "vf", 9, 4)}</g> }),
  "folder-downloads": (c) =>
    folder(c, {
      over: (
        <>
          {lg(c, "ar", ["#9be36b", "#2f9a1e"])}
          {sh(c, "arc", "M19.5 4.5H28.5V21H35.5L24 34.5L12.5 21H19.5Z", c.url("ar"), "#237416")}
          {!c.sm && <path d="M21 7.5H27" stroke="#d9ffc4" strokeWidth={c.o} opacity={0.8} />}
        </>
      ),
    }),
  "folder-desktop": (c) =>
    folder(c, {
      inner: (
        <>
          {lg(c, "dk", ["#5ac3fb", "#0c5ec6"])}
          {sh(c, "dkc", rr(7.5, 4.5, 33, 24, 1), c.url("dk"), "#0b468f")}
          {!c.sm && <path d="M9 6H28L17 27H9Z" fill="#fff" opacity={0.15} />}
          {!c.sm && winLogo(20, 9, 8, "#fff")}
        </>
      ),
    }),
  "folder-user": (c) =>
    folder(c, {
      inner: (
        <>
          {paper(c)}
          {person(c, "pu", 24, 4.5, 0.62, ["#5fb2f2", "#1d66c2"], "#164d8f")}
        </>
      ),
    }),
  libraries: (c) => (
    <>
      <g transform="translate(15 1.5) scale(0.68)">{folder(sub(c, "l3", 0.68), { inner: <></> })}</g>
      <g transform="translate(9 8.25) scale(0.68)">{folder(sub(c, "l2", 0.68), { inner: <></> })}</g>
      <g transform="translate(3 15) scale(0.68)">{folder(sub(c, "l1", 0.68))}</g>
    </>
  ),
  favorites: (c) => (
    <>
      {lg(c, "st", [
        [0, "#fff09a"],
        [0.5, "#fcc419"],
        [1, "#e58e00"],
      ])}
      {sh(c, "stc", `M${star(24, 25.5, 22.5, 9.5).replace(/ /g, "L")}Z`, c.url("st"), "#ad6a00")}
      {!c.sm && (
        <path
          d={`M${star(24, 25.5, 22.5, 9.5).split(" ").slice(0, 2).join("L")}L24 25.5Z`}
          fill="#fff"
          opacity={0.25}
        />
      )}
    </>
  ),

  // ── Computer, drives, network ──
  thispc: (c) => monitor(c, blueScreen(c)),
  drive: (c) => driveBox(c),
  "drive-system": (c) => (
    <>
      {driveBox(c)}
      {lg(c, "wl", ["#3ccbff", "#0a74d4"], [0, 0, 1, 1])}
      {winLogo(c.sm ? 13.5 : 13, c.sm ? 3 : 2, c.sm ? 21 : 21, c.url("wl"))}
    </>
  ),
  dvd: (c) => (
    <>
      <clipPath id={c.id("dvc")}>
        <rect x={0} y={0} width={48} height={30} />
      </clipPath>
      <g clipPath={c.url("dvc")}>{disc(c, "dv", 24, 21, 17)}</g>
      {driveBox(c)}
      {!c.sm && <rect x={9} y={27} width={30} height={2.2} rx={1} fill="#4b535b" opacity={0.7} />}
    </>
  ),
  network: (c) => (
    <>
      {globe(c, "ng", 28.5, 19.5, 16.5)}
      <g transform="translate(1.5 21) scale(0.52)">{monitor(c, blueScreen(c))}</g>
    </>
  ),
  homegroup: (c) => (
    <>
      {rg(
        c,
        "ho",
        [
          [0, "#c9f0ff"],
          [0.5, "#3eaaf0"],
          [1, "#0d57b4"],
        ],
        0.4,
        0.35,
        0.7,
        0.35,
        0.25,
      )}
      {sh(c, "hoc", cp(24, 21, 18), c.url("ho"), "#0c4a93")}
      {!c.sm && <ellipse cx={20} cy={12} rx={11} ry={6} fill="#fff" opacity={0.25} />}
      {person(c, "h1", 13, 21.5, 0.68, ["#b2ec7d", "#3c9f20"], "#2a7016")}
      {person(c, "h3", 35, 21.5, 0.68, ["#ffd36b", "#e48a0a"], "#a65f00")}
      {person(c, "h2", 24, 17.5, 0.82, ["#7cc8ff", "#1660c4"], "#0d4790")}
    </>
  ),
  "recycle-empty": (c) => recycle(c, false),
  "recycle-full": (c) => recycle(c, true),

  // ── Programs ──
  explorer: (c) =>
    folder(c, {
      over: (
        <>
          {lg(c, "xb", ["#55b8f6", "#0f68c3"])}
          {sh(c, "xbc", "M3 30H45V40.5Q45 42 43.5 42H4.5Q3 42 3 40.5Z", c.url("xb"), "#0b4f9c")}
          {hi(c, 4.5, 43.5, 30, "#bfe6ff", 0.8)}
          {!c.sm && <rect x={19.5} y={34.5} width={9} height={3} rx={1.5} fill="#0b4f9c" opacity={0.6} />}
        </>
      ),
    }),
  ie: (c) => ieLogo(c),
  notepad: (c) => {
    const rings = [];
    for (let x = 12; x <= 36; x += c.sm ? 6 : 4.8)
      rings.push(
        <rect
          key={x}
          x={x - 1}
          y={2}
          width={2.2}
          height={8.5}
          rx={1.1}
          fill="#f2f4f6"
          stroke="#5f6a75"
          strokeWidth={c.o * 0.8}
        />,
      );
    return (
      <>
        {lg(c, "np", ["#ffffff", "#e3eef8"])}
        {sh(c, "npc", rr(7.5, 6, 33, 39, 1.5), c.url("np"), "#6b7a89")}
        {lg(c, "nb", ["#7cc4f6", "#2a76c9"])}
        {sh(c, "nbc", "M9 7.5H39V13.5H9Z", c.url("nb"), "#235fa5", c.o * 0.6)}
        {lines(c, 12, 36, c.sm ? [22.5, 28.5, 34.5, 40.5] : [19.5, 24, 28.5, 33, 37.5], "#94bfe6", 1.2)}
        {!c.sm && <path d="M15 15V43.5" stroke="#e9a3a3" strokeWidth={0.9} />}
        {rings}
      </>
    );
  },
  wordpad: (c) => (
    <>
      {page(c)}
      {lg(c, "wa", ["#55a6f2", "#1350b5"])}
      {sh(c, "wac", rr(12, 7.5, 13.5, 13.5, 1.5), c.url("wa"), "#0e3f8f")}
      <path
        d={c.sm ? "M14.5 19.5L18.75 9L23 19.5M16 16H21.5" : "M14.5 18.8L18.75 9.8L23 18.8M16.2 15.6H21.3"}
        fill="none"
        stroke="#fff"
        strokeWidth={c.sm ? 2.4 : 2}
        strokeLinejoin="round"
      />
      {lines(c, 28.5, 34.5, c.sm ? [] : [11, 15, 19], "#2f6fc8", 1.4)}
      {lines(c, 12, [34.5, 31.5, 34.5, 27], c.sm ? [28.5, 34.5, 40.5] : [25.5, 30, 34.5, 39], "#2f6fc8", 1.4)}
    </>
  ),
  paint: (c) => (
    <>
      {lg(c, "pp", ["#fdf3e1", "#e6c897"])}
      {sh(
        c,
        "ppc",
        "M5 28C3 16 14 7.5 26 8C38 8.5 46 16 44 26C43 31.5 37 31 33.5 32.5C30.5 34 33.5 38.5 30 41.5C26 45 14 44 9 39C6.5 36.5 5.5 32 5 28ZM34 25A3.5 3 0 1 0 41 25A3.5 3 0 1 0 34 25Z",
        c.url("pp"),
        "#a07b47",
      )}
      {[
        ["#ff5a4a", "#c3170a", 11, 25],
        ["#ffd84a", "#d69c00", 15.5, 16],
        ["#7fdc4a", "#2d8f17", 24.5, 13],
        ["#59b6ff", "#1158c2", 33.5, 15.5],
      ].map(([a, b, x, y], i) => (
        <g key={i}>
          {rg(c, `pd${i}`, [a as string, b as string], 0.4, 0.35, 0.65)}
          <circle cx={x} cy={y} r={c.sm ? 4 : 3.6} fill={c.url(`pd${i}`)} />
        </g>
      ))}
      <g transform="rotate(42 30 30)">
        {lg(c, "ph", ["#3b8be0", "#1452a8"], [0, 0, 1, 0])}
        <rect
          x={27}
          y={18}
          width={5}
          height={24}
          rx={2.2}
          fill={c.url("ph")}
          stroke="#0d3c7d"
          strokeWidth={c.o * 0.8}
        />
        <rect x={27.5} y={13} width={4} height={6} fill="#c9d0d7" stroke="#6b737c" strokeWidth={c.o * 0.6} />
        <path d="M27.5 13.5C27.5 9 28.5 5.5 29.5 3C30.5 5.5 31.5 9 31.5 13.5Z" fill="#3a2a1c" />
        <path d="M28.4 8.5C28.6 6.5 29 4.6 29.5 3C30 4.6 30.4 6.5 30.6 8.5Z" fill="#e5392a" />
      </g>
    </>
  ),
  calc: (c) => {
    const keys = [];
    const cols = c.sm ? [12, 21, 30] : [11.5, 18, 24.5, 31];
    const rows = c.sm ? [24, 33] : [21, 26.5, 32, 37.5];
    const kw = c.sm ? 6 : 5;
    for (let r = 0; r < rows.length; r++)
      for (let k = 0; k < cols.length; k++) {
        const eq = r === rows.length - 1 && k === cols.length - 1;
        keys.push(
          <rect
            key={`${r}${k}`}
            x={cols[k]}
            y={rows[r]}
            width={kw}
            height={c.sm ? 6 : 4}
            rx={c.sm ? 0 : 0.8}
            fill={eq ? c.url("ck2") : c.url("ck")}
            stroke={eq ? "#a85a00" : "#7d8792"}
            strokeWidth={c.sm ? 0 : 0.75}
          />,
        );
      }
    return (
      <>
        {lg(c, "cb", ["#f4f6f8", "#b9c1ca"])}
        {sh(c, "cbc", rr(7.5, 3, 33, 42, 3), c.url("cb"), "#59626c")}
        {hi(c, 10.5, 37.5, 3, "#fff", 0.9)}
        {lg(c, "cl", ["#f4f9fd", "#c8dced"])}
        {sh(c, "clc", rr(10.5, 6, 27, 10.5, 1), c.url("cl"), "#6f8194")}
        {!c.sm && <path d="M30.5 9H34V13.5H30.5Z" fill="none" stroke="#2c3742" strokeWidth={1.1} />}
        {lg(c, "ck", ["#ffffff", "#d6dce2"])}
        {lg(c, "ck2", ["#ffc56b", "#f08a0c"])}
        {keys}
      </>
    );
  },
  cmd: (c) => (
    <>
      {lg(c, "ct", ["#e9edf1", "#b7c0c9"])}
      {sh(c, "ctc", rr(3, 6, 42, 36, 1.5), c.url("ct"), "#4b545d")}
      {lg(c, "cc", ["#2a2a2a", "#050505"])}
      <rect x={c.o + 3} y={12} width={42 - c.o * 2} height={30 - c.o} fill={c.url("cc")} />
      {!c.sm && <rect x={35} y={7.8} width={2.4} height={2.4} fill="#5d6770" />}
      {!c.sm && <rect x={39} y={7.8} width={2.4} height={2.4} fill="#c8453a" />}
      {c.sm ? (
        <>
          <path d="M10.5 19.5L16.5 24L10.5 28.5" fill="none" stroke="#e8e8e8" strokeWidth={3} strokeLinecap="square" />
          <rect x={19.5} y={27} width={9} height={3} fill="#e8e8e8" />
        </>
      ) : (
        <g fill="none" stroke="#d4d4d4" strokeWidth={1.5}>
          <path d="M12.75 17.25H9.75V23.25H12.75" />
          <path d="M15 18.5V20M15 21.75V23.25" />
          <path d="M17 16.5L21 24" />
          <path d="M22.5 17.25L26.25 20.25L22.5 23.25" />
          <rect x={28} y={22.5} width={4.5} height={1.5} fill="#f2f2f2" stroke="none" />
        </g>
      )}
    </>
  ),
  taskmgr: (c) =>
    monitor(
      c,
      <>
        <rect x={6} y={9} width={36} height={24} fill="#0b1a10" />
        {!c.sm && (
          <g stroke="#1f5a2c" strokeWidth={0.6}>
            <path d="M6 15H42M6 21H42M6 27H42M12 9V33M18 9V33M24 9V33M30 9V33M36 9V33" />
          </g>
        )}
        {lg(c, "tg", [
          [0, "#3fe85a", 0.55],
          [1, "#3fe85a", 0.05],
        ])}
        <path d="M6 28L11 25L15 27L20 17L25 22L29 14L34 20L38 16L42 18V33H6Z" fill={c.url("tg")} />
        <path
          d="M6 28L11 25L15 27L20 17L25 22L29 14L34 20L38 16L42 18"
          fill="none"
          stroke="#58ff6e"
          strokeWidth={c.sm ? 2.4 : 1.6}
          strokeLinejoin="round"
        />
      </>,
      false,
    ),
  control: (c) =>
    monitor(
      c,
      <>
        {lg(c, "cs", ["#ffffff", "#d7e7f5"])}
        <rect x={6} y={9} width={36} height={24} fill={c.url("cs")} />
        {lg(c, "c1", ["#7fdc4a", "#2d8f17"])}
        {lg(c, "c2", ["#59b6ff", "#1158c2"])}
        {lg(c, "c3", ["#ffd84a", "#e08f00"])}
        <rect x={9} y={21} width={4.5} height={10.5} fill={c.url("c1")} />
        <rect x={15} y={15} width={4.5} height={16.5} fill={c.url("c2")} />
        <rect x={21} y={24} width={4.5} height={7.5} fill={c.url("c3")} />
        <circle cx={34.5} cy={19.5} r={6} fill={c.url("c2")} />
        <path d="M34.5 19.5V13.5A6 6 0 0 1 40.5 19.5Z" fill={c.url("c3")} />
        <path d="M34.5 19.5H40.5A6 6 0 0 1 36 25.3Z" fill={c.url("c1")} />
      </>,
    ),
  minesweeper: (c) => {
    const spikes = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      spikes.push(
        <path
          key={i}
          d={`M24 24L${(24 + 15.5 * Math.cos(a)).toFixed(2)} ${(24 + 15.5 * Math.sin(a)).toFixed(2)}`}
          stroke="#111"
          strokeWidth={i % 2 ? 2.4 : 3}
        />,
      );
    }
    return (
      <>
        {lg(c, "mt", ["#dcebfa", "#8fb6e2"])}
        {sh(c, "mtc", rr(3, 3, 42, 42, 4.5), c.url("mt"), "#4f7fb4")}
        {hi(c, 7.5, 40.5, 3, "#fff", 0.9)}
        {spikes}
        {rg(
          c,
          "mb",
          [
            [0, "#7a7a7a"],
            [0.5, "#262626"],
            [1, "#000"],
          ],
          0.42,
          0.4,
          0.6,
          0.35,
          0.3,
        )}
        <circle cx={24} cy={24} r={10.5} fill={c.url("mb")} />
        <circle cx={20.5} cy={20.5} r={c.sm ? 3 : 2.6} fill="#fff" opacity={0.95} />
      </>
    );
  },
  run: (c) => (
    <>
      {sh(c, "rw", rr(3, 9, 36, 33, 1.5), "#fdfdfd", "#5b6874")}
      {lg(c, "rt", ["#5aaaf0", "#2066c0"])}
      <rect x={3 + c.o} y={9 + c.o} width={36 - c.o * 2} height={6} fill={c.url("rt")} />
      {!c.sm && lines(c, 7.5, [21, 27, 18], [21, 25.5, 30], "#b6bec7", 1.2)}
      {lg(c, "ra", ["#9be36b", "#2f9a1e"], [0, 1, 1, 0])}
      {sh(c, "rac", "M19.5 37.5L31 26L27 22H42V37L38 33L26.5 44.5Z", c.url("ra"), "#237416")}
    </>
  ),
  windows: (c) => (
    <>
      {lg(c, "wn", ["#42ccff", "#0a78d6"], [0, 0, 1, 1])}
      {winLogo(5, 5, 38, c.url("wn"))}
    </>
  ),

  // ── Files ──
  file: (c) => page(c),
  "file-txt": (c) => (
    <>
      {page(c)}
      {lines(
        c,
        13.5,
        [34.5, 34.5, 28.5, 34.5, 31.5, 25.5],
        c.sm ? [16.5, 22.5, 28.5, 34.5, 40.5] : [16.5, 21, 25.5, 30, 34.5, 39],
        "#9aa3ac",
        1.3,
      )}
    </>
  ),
  "file-rtf": (c) => (
    <>
      {page(c)}
      {c.sm ? (
        <path d="M13.5 16.5H25.5" stroke="#2058b8" strokeWidth={3} />
      ) : (
        <path d="M13.5 15H26" stroke="#2058b8" strokeWidth={3} />
      )}
      {lines(c, 13.5, [34.5, 30, 34.5, 27], c.sm ? [22.5, 28.5, 34.5, 40.5] : [22.5, 27, 31.5, 36], "#3c7fdb", 1.4)}
      {!c.sm && <path d="M13.5 40.5H24" stroke="#e05a2a" strokeWidth={1.4} />}
    </>
  ),
  "file-img": (c) => (
    <>
      {!c.sm && <rect x={4.5} y={10.5} width={42} height={33} fill="#000" opacity={0.12} />}
      {sh(c, "if", rr(3, 9, 42, 33), "#fff", "#7c8690")}
      {landscape(c, "il", c.sm ? 6 : 6, 12, 36, 27)}
      {!c.sm && <rect x={6} y={12} width={36} height={27} fill="none" stroke="#9aa4ae" strokeWidth={0.6} />}
    </>
  ),
  "file-url": (c) => (
    <>
      <g transform="translate(3 0) scale(0.9)">{ieLogo(c)}</g>
      {shortcut(c)}
    </>
  ),
  "file-exe": (c) => (
    <>
      {lg(c, "xw", ["#ffffff", "#e9edf1"])}
      {sh(c, "xwc", rr(3, 6, 42, 36, 1.5), c.url("xw"), "#5d6a77")}
      {lg(c, "xt", ["#4ea4f2", "#1b5fbf"])}
      <rect x={3 + c.o} y={6 + c.o} width={42 - c.o * 2} height={7.5 - c.o} fill={c.url("xt")} />
      {!c.sm && <rect x={37.5} y={8.25} width={4.5} height={3} rx={0.5} fill="#e04a3f" />}
      {!c.sm && <rect x={6} y={13.5} width={36} height={0.8} fill="#c5ccd3" />}
    </>
  ),
  "file-html": (c) => (
    <>
      {page(c)}
      {!c.sm && lines(c, 13.5, [27, 22.5], [15, 19.5], "#b0b8c0", 1.3)}
      <g transform={c.sm ? "translate(12 15) scale(0.62)" : "translate(13.5 18) scale(0.56)"}>{ieLogo(c)}</g>
    </>
  ),
  "file-audio": (c) => (
    <>
      {page(c)}
      <g transform={c.sm ? "translate(5 9) scale(0.85)" : "translate(6 9) scale(0.8)"}>
        {notes(c, "an", ["#ffb24a", "#e0590e"], "#9c3c06")}
      </g>
    </>
  ),
  "file-video": (c) => (
    <>
      {page(c)}
      <g transform={c.sm ? "translate(9 18) scale(0.9)" : "translate(10.5 21) scale(0.8)"}>
        {film(sub(c, "fv", c.sm ? 0.9 : 0.8), "f", 0, 0)}
      </g>
    </>
  ),
  "file-lnk": (c) => (
    <>
      {page(c)}
      {shortcut(c)}
    </>
  ),

  // ── Message boxes, security ──
  "msg-info": (c) =>
    badge(
      c,
      "#5fb6f6",
      "#1a62c4",
      "#11498f",
      <>
        <circle cx={24} cy={13.5} r={3.4} fill="#fff" />
        <path d="M19.5 20.5H27V33.5H29.5V36.5H18.5V33.5H21V23.5H19.5Z" fill="#fff" />
      </>,
    ),
  "msg-warning": (c) => (
    <>
      {lg(c, "wt", [
        [0, "#ffe679"],
        [0.6, "#ffcb2b"],
        [1, "#f2ad00"],
      ])}
      {sh(
        c,
        "wtc",
        "M20.9 5.6C22.4 2.6 25.6 2.6 27.1 5.6L45.4 39.2C46.8 41.8 45.6 43.5 42.8 43.5H5.2C2.4 43.5 1.2 41.8 2.6 39.2Z",
        c.url("wt"),
        "#b07c06",
      )}
      <path d="M21.2 14.5H26.8L25.6 30.5H22.4Z" fill="#1d1d1d" />
      <circle cx={24} cy={36} r={2.8} fill="#1d1d1d" />
    </>
  ),
  "msg-error": (c) =>
    badge(
      c,
      "#f7695e",
      "#c8261a",
      "#8f160d",
      <path d="M16.5 16.5L31.5 31.5M31.5 16.5L16.5 31.5" stroke="#fff" strokeWidth={4.6} strokeLinecap="round" />,
    ),
  "msg-question": (c) =>
    badge(
      c,
      "#5fb6f6",
      "#1a62c4",
      "#11498f",
      <>
        <path
          d="M18.2 18C18.2 13.6 21 11.3 24.3 11.3C28.2 11.3 30.4 13.8 30.4 16.8C30.4 20.4 27.1 21.5 25.6 23C24.6 24 24.4 25.2 24.4 27.6"
          fill="none"
          stroke="#fff"
          strokeWidth={4.4}
          strokeLinecap="round"
        />
        <circle cx={24.4} cy={34.2} r={2.9} fill="#fff" />
      </>,
    ),
  shield: (c) => {
    const d = "M24 2.5C30 6 36.5 7.5 43.5 7.5V21.5C43.5 33 35 41 24 46C13 41 4.5 33 4.5 21.5V7.5C11.5 7.5 18 6 24 2.5Z";
    return (
      <>
        <clipPath id={c.id("sc")}>
          <path d={d} />
        </clipPath>
        {lg(c, "sb", ["#4a9bf0", "#1550ad"])}
        {lg(c, "sy", ["#ffe47a", "#f2ad0a"])}
        <g clipPath={c.url("sc")}>
          <rect x={0} y={0} width={24} height={24} fill={c.url("sb")} />
          <rect x={24} y={0} width={24} height={24} fill={c.url("sy")} />
          <rect x={0} y={24} width={24} height={24} fill={c.url("sy")} />
          <rect x={24} y={24} width={24} height={24} fill={c.url("sb")} />
          {!c.sm && <path d="M4 4H44V16C30 13 18 16 4 22Z" fill="#fff" opacity={0.18} />}
        </g>
        <path d={d} fill="none" stroke="#33404d" strokeWidth={c.o * 2} clipPath={c.url("sc")} />
      </>
    );
  },

  // ── Control Panel ──
  user: (c) => (
    <>
      {!c.sm && <rect x={8} y={5} width={36} height={42} fill="#000" opacity={0.12} />}
      {sh(c, "uf", rr(6, 3, 36, 42), "#fff", "#7c8690")}
      {lg(c, "ub", ["#eef2f6", "#c3ced9"])}
      <rect x={9} y={6} width={30} height={36} fill={c.url("ub")} />
      <clipPath id={c.id("uc")}>
        <rect x={9} y={6} width={30} height={36} />
      </clipPath>
      <g clipPath={c.url("uc")}>{silhouette(c, "us")}</g>
    </>
  ),
  accounts: (c) => (
    <>
      {person(c, "a2", 31.5, 6, 1, ["#9be36b", "#2f8f1c"], "#22691a")}
      {person(c, "a1", 18, 15, 1.08, ["#69b8f7", "#1658bd"], "#0f438f")}
    </>
  ),
  display: (c) =>
    monitor(
      c,
      <>
        {blueScreen(c)}
        {!c.sm && (
          <>
            <rect x={6} y={30} width={36} height={3} fill="#0a2a55" opacity={0.75} />
            {sh(c, "dw", rr(15, 13.5, 18, 12), "#fff", "#3d5f86", c.o * 0.6)}
            <rect x={15.5} y={14} width={17} height={2.5} fill="#2e86e0" />
          </>
        )}
      </>,
    ),
  personalize: (c) => (
    <>
      {monitor(
        c,
        <>
          {lg(
            c,
            "pw",
            [
              [0, "#5c2d91"],
              [0.45, "#d0347a"],
              [1, "#ffb43a"],
            ],
            [0, 0, 1, 1],
          )}
          <rect x={6} y={9} width={36} height={24} fill={c.url("pw")} />
          {!c.sm && <path d="M6 28Q18 17 30 24T42 18V33H6Z" fill="#ffd36b" opacity={0.6} />}
        </>,
      )}
      {!c.sm && (
        <>
          {sh(c, "s1", rr(30, 27, 7.5, 7.5, 1), "#e8392c", "#8f1c13")}
          {sh(c, "s2", rr(34.5, 31.5, 7.5, 7.5, 1), "#2ba344", "#176026")}
          {sh(c, "s3", rr(39, 36, 7.5, 7.5, 1), "#2a74d8", "#164a96")}
        </>
      )}
    </>
  ),
  clock: (c) => clockFace(c, "ck", 24, 24, 21),
  programs: (c) => (
    <>
      {disc(c, "pd", 27, 17, 14)}
      {lg(c, "pb", ["#e7bf86", "#c08443"])}
      {sh(c, "pbc", "M4.5 24H34.5V45H4.5Z", c.url("pb"), "#83561f")}
      {lg(c, "ps", ["#c99a5d", "#93622a"])}
      {sh(c, "psc", "M34.5 24L43.5 19.5V39L34.5 45Z", c.url("ps"), "#6f4719")}
      <path
        d="M4.5 24L12 18H42L34.5 24Z"
        fill="#dcb47c"
        stroke="#83561f"
        strokeWidth={c.o}
        strokeLinejoin="round"
        opacity={0.95}
      />
      {!c.sm && (
        <rect x={8} y={30} width={14} height={8} fill="#fff" opacity={0.85} stroke="#a0763c" strokeWidth={0.6} />
      )}
    </>
  ),
  sound: (c) => (
    <>
      {lg(c, "sp", ["#7a838d", "#33393f"])}
      {sh(c, "spc", rr(9, 3, 30, 42, 3), c.url("sp"), "#1c2024")}
      {hi(c, 12, 36, 3, "#c9d0d6", 0.6)}
      {rg(c, "sw", [
        [0, "#9aa3ad"],
        [0.55, "#2b3035"],
        [0.8, "#4d555d"],
        [1, "#c5ccd3"],
      ])}
      <circle cx={24} cy={30} r={10.5} fill={c.url("sw")} stroke="#15181b" strokeWidth={c.o} />
      <circle cx={24} cy={30} r={3.2} fill="#1b1e21" />
      <circle cx={24} cy={12.5} r={4.5} fill={c.url("sw")} stroke="#15181b" strokeWidth={c.o} />
    </>
  ),
  mouse: (c) => (
    <>
      {!c.sm && <path d="M24 13.5C24 8 27 5 33 4.5S42 3 44 1" fill="none" stroke="#3b4148" strokeWidth={1.4} />}
      {lg(c, "mo", ["#ffffff", "#c9d0d7"], [0, 0, 1, 1])}
      {sh(
        c,
        "moc",
        "M24 12C31.5 12 36 17 36 25.5V33C36 40.5 31 45 24 45C17 45 12 40.5 12 33V25.5C12 17 16.5 12 24 12Z",
        c.url("mo"),
        "#5c6670",
      )}
      <path d="M12.5 25.5H35.5M24 12.5V25.5" stroke="#8a949e" strokeWidth={c.o * 0.8} />
      <rect x={22.5} y={16} width={3} height={6} rx={1.5} fill="#3b4148" />
    </>
  ),
  keyboard: (c) => {
    const keys = [];
    if (!c.sm) {
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 10; k++)
          keys.push(
            <rect
              key={`${r}-${k}`}
              x={5.4 + k * 3.9 + r * 0.9}
              y={19.5 + r * 4.2}
              width={3.1}
              height={3.2}
              rx={0.5}
              fill="#fff"
              stroke="#8f99a3"
              strokeWidth={0.5}
            />,
          );
      keys.push(
        <rect
          key="sp"
          x={13.5}
          y={32.1}
          width={21}
          height={3.2}
          rx={0.5}
          fill="#fff"
          stroke="#8f99a3"
          strokeWidth={0.5}
        />,
      );
    }
    return (
      <>
        {lg(c, "kb", ["#e9edf1", "#a6afb8"])}
        {sh(c, "kbc", rr(1.5, 16.5, 45, 22.5, 3), c.url("kb"), "#4f5862")}
        {hi(c, 4.5, 43.5, 16.5, "#fff", 0.9)}
        {c.sm ? (
          <g fill="#fff">
            <rect x={6} y={21} width={36} height={3} />
            <rect x={6} y={27} width={36} height={3} />
            <rect x={12} y={33} width={24} height={2} />
          </g>
        ) : (
          keys
        )}
      </>
    );
  },
  power: (c) => (
    <>
      {lg(c, "pb", ["#f1f3f5", "#a9b2bb"])}
      {sh(c, "pbc", rr(3, 9, 36, 24, 3), c.url("pb"), "#4f5862")}
      <rect x={39} y={16.5} width={4.5} height={9} rx={1} fill="#7d8792" stroke="#4f5862" strokeWidth={c.o} />
      {lg(c, "pg", ["#a6ef6e", "#2f9a1e"])}
      <rect x={6} y={12} width={22.5} height={18} rx={1} fill={c.url("pg")} />
      {hi(c, 7, 27, 12, "#e4ffd2", 0.8)}
      {!c.sm && (
        <>
          <path d="M37.5 37.5C42 37.5 45 40 46 46" fill="none" stroke="#2c3238" strokeWidth={2.4} />
          <path d="M22.5 35.2H27M22.5 39.8H27" stroke="#b9c0c7" strokeWidth={1.8} />
          {lg(c, "pl", ["#5c646c", "#22272c"])}
          {sh(c, "plc", rr(26, 32, 12, 11, 2.5), c.url("pl"), "#121518")}
        </>
      )}
    </>
  ),
  fonts: (c) => (
    <>
      {lg(c, "fa", ["#ffb24a", "#e0590e"])}
      <path
        d="M30 42L36.5 21H40.5L47 42H43.2L41.8 37.5H35.2L33.8 42ZM36.2 34.2H40.8L38.5 26.6Z"
        fillRule="evenodd"
        fill={c.url("fa")}
        stroke="#9c3c06"
        strokeWidth={c.o * 0.7}
      />
      {lg(c, "fb", ["#5aa8f4", "#1347a8"])}
      <path
        d="M2 42L14.5 5H21.5L34 42H27L24.3 33.5H11.7L9 42ZM13.7 27.5H22.3L18 14Z"
        fillRule="evenodd"
        fill={c.url("fb")}
        stroke="#0d377f"
        strokeWidth={c.o}
        strokeLinejoin="round"
      />
    </>
  ),
  region: (c) => (
    <>
      {globe(c, "rg", 21, 21, 18)}
      {clockFace(c, "rc", 35, 35, 12)}
    </>
  ),
  ease: (c) =>
    badge(
      c,
      "#56b1f4",
      "#145cbf",
      "#0e448c",
      <>
        <circle cx={24} cy={12.5} r={3.4} fill="#fff" />
        <path
          d="M12.5 18.5L24 20.5L35.5 18.5M24 20.5V28M24 28L18.5 37.5M24 28L29.5 37.5"
          fill="none"
          stroke="#fff"
          strokeWidth={3.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>,
    ),
  devices: (c) => (
    <>
      <g transform="translate(15 0) scale(0.68)">{monitor(c, blueScreen(c))}</g>
      {lg(c, "pr", ["#f0f2f4", "#a3acb5"])}
      <rect x={9} y={18} width={18} height={10} fill="#fff" stroke="#8a939c" strokeWidth={c.o} />
      {!c.sm && lines(c, 12, [22.5, 19.5], [21, 24], "#9aa3ac", 1)}
      {sh(c, "prc", rr(3, 25.5, 30, 15, 2.5), c.url("pr"), "#4f5862")}
      {hi(c, 5, 31, 25.5, "#fff", 0.9)}
      <rect x={7.5} y={36} width={21} height={6} fill="#fff" stroke="#8a939c" strokeWidth={c.o} />
      {!c.sm && <rect x={27} y={29} width={3} height={2} rx={0.5} fill="#57e244" />}
    </>
  ),
  update: (c) => (
    <>
      {lg(c, "ua", ["#7fdc4a", "#2a8a17"])}
      {lg(c, "ub", ["#4aa8f2", "#1555b7"])}
      <path
        d="M8.2 21A16.5 16.5 0 0 1 37.5 12.5L41 9V22.5H27.5L32.4 17.6A10 10 0 0 0 15.1 21Z"
        fill={c.url("ua")}
        stroke="#22691a"
        strokeWidth={c.o}
        strokeLinejoin="round"
      />
      <path
        d="M39.8 27A16.5 16.5 0 0 1 10.5 35.5L7 39V25.5H20.5L15.6 30.4A10 10 0 0 0 32.9 27Z"
        fill={c.url("ub")}
        stroke="#0f438f"
        strokeWidth={c.o}
        strokeLinejoin="round"
      />
    </>
  ),
};

/** Recycle Bin: a translucent blue-grey mesh bin, optionally with crumpled paper. */
function recycle(c: Ctx, full: boolean) {
  const body = "M7.5 10.5A16.5 5 0 0 0 40.5 10.5L36.3 40.5Q35.8 44.5 24 44.5Q12.2 44.5 11.7 40.5Z";
  const mesh = [];
  if (!c.sm) {
    for (let i = -4; i <= 4; i++) mesh.push(<path key={`v${i}`} d={`M${24 + i * 4} 12L${24 + i * 2.9} 45`} />);
    for (let y = 18; y <= 42; y += 4.8) mesh.push(<path key={`h${y}`} d={`M6 ${y}Q24 ${y + 4.6} 42 ${y}`} />);
  }
  return (
    <>
      {lg(c, "ri", ["#4f6476", "#9fb3c5"])}
      <path d={ep(24, 10.5, 16.5, 5)} fill={c.url("ri")} />
      {full && (
        <g stroke="#6f7b87" strokeWidth={c.o} strokeLinejoin="round">
          {lg(c, "rp", ["#ffffff", "#d3d9df"])}
          <path d="M15 27L18 21L24 23L30 19.5L34.5 25L32 39H17Z" fill="#eef1f4" opacity={0.9} />
          <path d="M10.5 12L11 6L16 4.5L19.5 7L21 3L26 1.5L28.5 5L33 3L37.5 6.5L37.5 12.5L24 20Z" fill={c.url("rp")} />
          {!c.sm && (
            <path
              d="M16 4.5L17 10M21 3L23.5 9.5M28.5 5L28 10.5M33 3L32.5 8.5"
              fill="none"
              stroke="#9aa5b0"
              strokeWidth={c.o * 0.7}
            />
          )}
        </g>
      )}
      {lg(
        c,
        "rb",
        [
          [0, "#8ca2b6", 0.95],
          [0.3, "#dfe9f2", full ? 0.7 : 0.85],
          [0.5, "#f4f8fb", full ? 0.55 : 0.8],
          [0.75, "#c9d7e3", full ? 0.7 : 0.85],
          [1, "#7f97ad", 0.95],
        ],
        [0, 0, 1, 0],
      )}
      <path d={body} fill={c.url("rb")} />
      <clipPath id={c.id("rm")}>
        <path d={body} />
      </clipPath>
      <g clipPath={c.url("rm")} fill="none" stroke="#6f879c" strokeWidth={0.6} opacity={0.55}>
        {mesh}
      </g>
      <path d={body} fill="none" stroke="#5c7387" strokeWidth={c.o} strokeLinejoin="round" />
      <path d={ep(24, 10.5, 16.5, 5)} fill="none" stroke="#5c7387" strokeWidth={c.o * 1.8} />
      <path d={ep(24, 10.5, 16.5, 5)} fill="none" stroke="#e8f0f6" strokeWidth={c.o * 0.7} opacity={0.9} />
    </>
  );
}

/** Every icon name, in drawing order (for pickers and review sheets). */
export const SHELL_ICON_NAMES = Object.keys(DRAW) as ShellIconName[];

/** A colorful Windows 8 desktop icon. */
export function ShellIcon({ name, size = 32, className }: { name: ShellIconName; size?: number; className?: string }) {
  const uid = "si" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const c: Ctx = {
    id: (k) => uid + k,
    url: (k) => `url(#${uid}${k})`,
    sm: size <= 20,
    o: (size > 48 ? 72 : 48) / size,
  };
  const draw = DRAW[name] ?? DRAW.file;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {draw(c)}
    </svg>
  );
}
