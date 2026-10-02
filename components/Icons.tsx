/** Original line icons in the flat Metro spirit (24×24, stroke = currentColor). No system glyph fonts are used. */
import { useId } from "react";
import type { IconName } from "@/lib/model";

/** A Segoe-style gear: `teeth` square-ish teeth around a ring with a round hole (even-odd). */
function gear(cx: number, cy: number, rOut: number, rIn: number, teeth: number, hole: number) {
  const pts: string[] = [];
  const pitch = (Math.PI * 2) / teeth;
  const at = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  for (let k = 0; k < teeth; k++) {
    const a = k * pitch - Math.PI / 2;
    pts.push(at(rIn, a - pitch * 0.34), at(rOut, a - pitch * 0.2), at(rOut, a + pitch * 0.2), at(rIn, a + pitch * 0.34));
  }
  return `M${pts.join("L")}Z M${cx - hole} ${cy}a${hole} ${hole} 0 1 0 ${hole * 2} 0a${hole} ${hole} 0 1 0 ${-hole * 2} 0Z`;
}
const dot = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
const F = { fill: "currentColor", stroke: "none" } as const;

/** The Windows 8 logo: a four-pane window seen in perspective. */
export const WIN_PANES = [
  "0,12.7 41,7.1 41,47.6 0,47.6",
  "45.5,6.5 100,0 100,47.6 45.5,47.6",
  "0,52.4 41,52.4 41,92.9 0,87.3",
  "45.5,52.4 100,52.4 100,100 45.5,93.5",
];

// The base rectangles wind the same way as the circles (counterclockwise), so the union fills without holes.
const CLOUD_FRONT = `${dot(10.8, 15.6, 3.6)}${dot(14.8, 12.6, 4.8)}${dot(19, 16, 3.2)}M10.8 15.6v3.6H19v-3.6z`;
const CLOUD_BACK = `${dot(5.6, 12.4, 2.8)}${dot(9.4, 9.2, 4)}${dot(13.6, 10.4, 2.6)}M5.6 12.4v2.8h8v-2.8z`;
const IE_E = "M6.6 12.6h10.9a5.45 5.45 0 1 0-1.6 3.86";

/** Glyphs are drawings; the few that need a mask get a per-instance id prefix. */
const P: Record<IconName, React.ReactNode | ((uid: string) => React.ReactNode)> = {
  // ---- App glyphs, drawn after Segoe UI Symbol: even strokes, square ends, solid fills. ----
  projects: (
    <>
      <path {...F} fillRule="evenodd" d="M4.5 8.5h15l-1 12.5h-13zM9.3 12.3h2.4v2.4H9.3zM12.3 12.3h2.4v2.4h-2.4zM9.3 15.3h2.4v2.4H9.3zM12.3 15.3h2.4v2.4h-2.4z" />
      <path d="M8.6 8.5V7a3.4 3.4 0 0 1 6.8 0v1.5" strokeWidth="1.5" />
    </>
  ),
  profile: (
    <g strokeWidth="1.5">
      <circle cx="9.5" cy="8.6" r="3.3" />
      <path d="M3.4 20.2c0-3.7 2.7-6.4 6.1-6.4s6.1 2.7 6.1 6.4" />
      <circle cx="16.6" cy="7.6" r="2.6" />
      <path d="M15.6 12.6c3-.5 5.4 1.8 5.6 5.6" />
    </g>
  ),
  mail: (
    <g strokeWidth="1.5">
      <rect x="3" y="6" width="18" height="12.5" />
      <path d="m3 6.6 9 7 9-7" />
    </g>
  ),
  reader: (
    <>
      <path d="M3.5 7h9M3.5 11h9M3.5 15h9M3.5 19h6" strokeWidth="1.6" />
      <path {...F} d="M15 3.5h5.5V20l-2.75-2.4L15 20z" />
    </>
  ),
  photos: (
    <>
      <rect x="3" y="5" width="18" height="14" strokeWidth="1.5" />
      <path {...F} d="M4.5 17.6 9.4 11l3.5 4 2.5-2.6 4.1 5.2z" />
      <path {...F} d={dot(16, 8.7, 1.4)} />
    </>
  ),
  music: (
    <>
      <path d="M5.2 15v-2.6a6.8 6.8 0 0 1 13.6 0V15" strokeWidth="1.7" />
      <rect {...F} x="3.4" y="13.2" width="4" height="6.8" rx="0.8" />
      <rect {...F} x="16.6" y="13.2" width="4" height="6.8" rx="0.8" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5.5" width="18" height="13" strokeWidth="1.5" />
      <path {...F} d="M3 8.2h18M3 15.8h18" stroke="currentColor" strokeWidth="1" />
      <path {...F} d="M10.2 9.3v5.4l4.4-2.7z" />
    </>
  ),
  achievements: (
    <path
      {...F}
      fillRule="evenodd"
      d="M8 7.5h8c2.6 0 4.1 2 4.6 4.5l1 4.6c.4 2-1 3.2-2.6 2.5-1-.5-2-1.8-3-3.3H8c-1 1.5-2 2.8-3 3.3-1.6.7-3-.5-2.6-2.5l1-4.6C3.9 9.5 5.4 7.5 8 7.5ZM7 9.8h1.6V11h1.2v1.6H8.6v1.2H7v-1.2H5.8V11H7ZM15.45 10.4a.75.75 0 1 0 1.5 0a.75.75 0 1 0-1.5 0ZM16.85 11.8a.75.75 0 1 0 1.5 0a.75.75 0 1 0-1.5 0ZM14.05 11.8a.75.75 0 1 0 1.5 0a.75.75 0 1 0-1.5 0ZM15.45 13.2a.75.75 0 1 0 1.5 0a.75.75 0 1 0-1.5 0Z"
    />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" strokeWidth="1.5" />
      <rect {...F} x="3.5" y="5" width="17" height="3.4" />
      <path
        {...F}
        d="M6 10.4h2.2v2.2H6zM9.3 10.4h2.2v2.2H9.3zM12.6 10.4h2.2v2.2h-2.2zM15.9 10.4h2.2v2.2h-2.2zM6 13.7h2.2v2.2H6zM9.3 13.7h2.2v2.2H9.3zM12.6 13.7h2.2v2.2h-2.2zM15.9 13.7h2.2v2.2h-2.2zM6 17h2.2v1.6H6zM9.3 17h2.2v1.6H9.3z"
      />
    </>
  ),
  desktop: (
    <>
      <rect x="3" y="4.5" width="18" height="12" strokeWidth="1.5" />
      <path d="M9 20.5h6M12 16.5v4" strokeWidth="1.5" />
    </>
  ),
  settings: <path {...F} fillRule="evenodd" d={gear(12, 12, 9.6, 7.3, 8, 3.1)} />,
  weather: (
    <>
      <path {...F} d={dot(12, 12, 4.2)} />
      <path d="M12 2.3v3M12 18.7v3M2.3 12h3M18.7 12h3M5.1 5.1l2.1 2.1M16.8 16.8l2.1 2.1M18.9 5.1l-2.1 2.1M7.2 16.8l-2.1 2.1" strokeWidth="1.8" />
    </>
  ),
  news: (
    <>
      <path d="M3.5 5.5h13.8v13.2A1.4 1.4 0 0 0 18.7 20H5A1.5 1.5 0 0 1 3.5 18.5z" strokeWidth="1.5" />
      <path d="M17.3 9h3.2v9.6a1.4 1.4 0 0 1-2.8 0" strokeWidth="1.5" />
      <rect {...F} x="6" y="8" width="4.8" height="4" />
      <path d="M12.6 8.6h2.4M12.6 11.4h2.4M6 14.6h9M6 17.2h9" strokeWidth="1.2" />
    </>
  ),
  sports: (
    <>
      <path {...F} d="M7.5 3.8h9v5.7a4.5 4.5 0 0 1-9 0z" />
      <path d="M7.5 5.8H4.8v1.6A3.1 3.1 0 0 0 7.9 10.5M16.5 5.8h2.7v1.6a3.1 3.1 0 0 1-3.1 3.1" strokeWidth="1.4" />
      <path {...F} d="M11 13.8h2v3.6h-2zM8 17.4h8V20H8z" />
    </>
  ),
  finance: (
    <>
      <path d="M3.5 20h17M3.5 4v16" strokeWidth="1.4" />
      <path d="m6 16 4.2-4.6 3.4 2.9 5.6-6.4" strokeWidth="1.8" />
      <path d="M15.8 7.6h3.6v3.6" strokeWidth="1.8" />
    </>
  ),
  travel: (
    <>
      <rect x="3.5" y="8" width="17" height="11.6" rx="1" strokeWidth="1.5" />
      <path d="M9 8V5.4h6V8" strokeWidth="1.5" />
      <path d="M7.6 8v11.6M16.4 8v11.6" strokeWidth="1.2" />
    </>
  ),
  maps: (
    <>
      <path d="m3 6.4 5.6-2 6.8 2 5.6-2v13.2l-5.6 2-6.8-2-5.6 2z" strokeWidth="1.5" />
      <path d="M8.6 4.4v13.2M15.4 6.4v13.2" strokeWidth="1.2" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="7.8" width="18" height="12.2" rx="1" strokeWidth="1.5" />
      <path d="m8.4 7.8 1.4-2.4h4.4l1.4 2.4" strokeWidth="1.5" />
      <circle cx="12" cy="13.9" r="3.4" strokeWidth="1.5" />
      <rect {...F} x="16.8" y="9.8" width="2" height="1.3" />
    </>
  ),
  alarms: (
    <>
      <circle cx="12" cy="13" r="6.8" strokeWidth="1.5" />
      <path d="M12 9.4V13l2.6 1.8" strokeWidth="1.5" />
      <path {...F} d="M2.9 8.4A4.4 4.4 0 0 1 8.6 3.4zM21.1 8.4a4.4 4.4 0 0 0-5.7-5z" />
      <path d="m7.4 18.3-1.7 2.2M16.6 18.3l1.7 2.2" strokeWidth="1.5" />
    </>
  ),
  soundrec: (
    <>
      <rect {...F} x="9.4" y="2.8" width="5.2" height="10.8" rx="2.6" />
      <path d="M6.4 10.8a5.6 5.6 0 0 0 11.2 0" strokeWidth="1.5" />
      <path d="M12 16.6v3.6M8.6 20.4h6.8" strokeWidth="1.5" />
    </>
  ),
  // Two clouds; the back one is cut away around the front one so they read as separate shapes.
  skydrive: (uid) => (
    <>
      <mask id={`${uid}sk`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <path d={CLOUD_FRONT} fill="#000" stroke="#000" strokeWidth="2.6" />
      </mask>
      <path {...F} d={CLOUD_BACK} mask={`url(#${uid}sk)`} />
      <path {...F} d={CLOUD_FRONT} />
    </>
  ),
  // The "e" with its orbit; the ring is broken where it crosses the letter, like the monochrome IE glyph.
  ie: (uid) => (
    <>
      <mask id={`${uid}ie`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <path d={IE_E} fill="none" stroke="#000" strokeWidth="5" />
      </mask>
      <path d={IE_E} strokeWidth="2.6" />
      <ellipse cx="12" cy="12.6" rx="10.6" ry="4.1" transform="rotate(-30 12 12.6)" strokeWidth="1.5" mask={`url(#${uid}ie)`} />
    </>
  ),
  calculator: (
    <>
      <rect x="5.5" y="3" width="13" height="18" rx="0.8" strokeWidth="1.5" />
      <rect {...F} x="7.8" y="5.3" width="8.4" height="3" />
      <path {...F} d="M8 10.6h1.8v1.8H8zM11.1 10.6h1.8v1.8h-1.8zM14.2 10.6H16v1.8h-1.8zM8 13.6h1.8v1.8H8zM11.1 13.6h1.8v1.8h-1.8zM14.2 13.6H16v1.8h-1.8zM8 16.6h1.8v1.8H8zM11.1 16.6h1.8v1.8h-1.8zM14.2 16.6H16v1.8h-1.8z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" strokeWidth="1.5" />
      <path d="M9.4 9.4a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.3 1.1-1.3 2v.8" strokeWidth="1.6" />
      <path {...F} d={dot(12, 17.2, 1)} />
    </>
  ),
  search: (
    <>
      <circle cx="14" cy="10" r="6" />
      <path d="m9.7 14.3-6 6" />
    </>
  ),
  share: (
    <>
      <path d="M18.4 7.6A7.8 7.8 0 1 0 19.8 12" strokeWidth="1.6" />
      <path d="M14.6 7.2h4.2V3" strokeWidth="1.6" />
      <path {...F} d={dot(12, 12, 2.1)} />
    </>
  ),
  start: (
    <g transform="translate(3.2 3.2) scale(0.176)">
      {WIN_PANES.map((pts) => (
        <polygon key={pts} points={pts} fill="currentColor" stroke="none" />
      ))}
    </g>
  ),
  devices: (
    <>
      <rect x="3" y="4" width="13" height="10" />
      <path d="M6 18h7M9.5 14v4" />
      <rect x="17" y="8" width="4" height="11" />
    </>
  ),
  power: (
    <>
      <path d="M12 3v8" />
      <path d="M7 6.3a7.5 7.5 0 1 0 10 0" />
    </>
  ),
  back: <path d="M20 12H5M11 5l-7 7 7 7" />,
  forward: <path d="M4 12h15M13 5l7 7-7 7" />,
  down: <path d="M12 4v15M5 13l7 7 7-7" />,
  up: <path d="M12 20V5M5 11l7-7 7 7" />,
  play: <path d="M8 5v14l11-7L8 5Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" strokeWidth="3" />
    </>
  ),
  next: <path d="M6 6v12l8-6-8-6ZM17 6v12" />,
  prev: <path d="M18 6v12l-8-6 8-6ZM7 6v12" />,
  github: (
    <path d="M12 3a9 9 0 0 0-2.85 17.54c.45.08.6-.2.6-.43v-1.6c-2.5.54-3.03-1.06-3.03-1.06-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.07 1.38.93 1.38.93.8 1.38 2.1.98 2.62.75.08-.58.31-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.15.08-2.38 0 0 .76-.24 2.47.92a8.6 8.6 0 0 1 4.5 0c1.72-1.16 2.47-.92 2.47-.92.49 1.23.18 2.15.09 2.38.58.63.92 1.44.92 2.42 0 3.46-2.1 4.22-4.1 4.44.32.28.61.83.61 1.67v2.47c0 .24.16.52.61.43A9 9 0 0 0 12 3Z" />
  ),
  linkedin: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" />
      <path d="M8 10.5V17M8 7.2v.3M11.5 17v-6.5M11.5 13c0-1.6 1-2.6 2.4-2.6s2.1 1 2.1 2.6v4" />
    </>
  ),
  x: <path d="M4 4l16 16M20 4 4 20" />,
  blog: (
    <>
      <path d="M5 19c3-1 4-3 5-6l6-6 2 2-6 6c-3 1-5 2-6 5" />
      <path d="m14 9 1 1" />
    </>
  ),
  cv: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4M9 12h7M9 15h7M9 18h4" />
    </>
  ),
  close: <path d="M5 5l14 14M19 5 5 19" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  folder: <path d="M3 6h7l2 2h9v11H3z" />,
  file: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" />
      <path d="m4 17 5-5 4 4 2-2 5 5" />
    </>
  ),
  pc: (
    <>
      <rect x="3" y="4" width="18" height="12" />
      <path d="M2 20h20" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" />
      <path d="M6 10h1M9 10h1M12 10h1M15 10h1M18 10h0M7 14h10" />
    </>
  ),
  mouse: (
    <>
      <rect x="6.5" y="3" width="11" height="18" rx="5.5" />
      <path d="M12 3v6" />
    </>
  ),
  touch: (
    <>
      <path d="M9 11V5a1.5 1.5 0 0 1 3 0v6M12 10V9a1.5 1.5 0 0 1 3 0v2M15 11a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4.2-2.3L5 15.4a1.5 1.5 0 0 1 2.4-1.8L9 15" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </>
  ),
  bell: (
    <>
      <path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" />
      <path d="M10 21h4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h4l5-4v13l-5-4H4z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5h4l5-4v13l-5-4H4z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </>
  ),
  motion: (
    <>
      <path d="M3 8h10M3 12h14M3 16h8" />
      <circle cx="18" cy="8" r="2" />
    </>
  ),
  brush: (
    <>
      <path d="M14 4 20 10 11 19 5 13z" />
      <path d="M5 13c-2 1-2 4-2 7 3 0 6 0 7-2" />
    </>
  ),
  pin: (
    <>
      <path d="M9 3h6l-1 6 3 3H7l3-3-1-6Z" />
      <path d="M12 12v9" />
    </>
  ),
  unpin: (
    <>
      <path d="M9 3h6l-1 6 3 3H7l3-3-1-6Z" />
      <path d="M12 12v9M4 4l16 16" />
    </>
  ),
  resize: (
    <>
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.8-4.4 4-7 8-7s7.2 2.6 8 7" />
    </>
  ),
  wifi: (
    <>
      <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19" r="0.6" fill="currentColor" />
    </>
  ),
  battery: (
    <>
      <rect x="2.5" y="7.5" width="17" height="9" />
      <path d="M21.5 10.5v3" />
      <rect x="4.5" y="9.5" width="10" height="5" fill="currentColor" stroke="none" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  new: <path d="M12 4v16M4 12h16" />,
  send: <path d="M3 11.5 21 4l-6 17-3.5-7.5L3 11.5ZM11.5 13.5 21 4" />,
  reply: (
    <>
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h10a6 6 0 0 1 6 6v1" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h16M9 6V4h6v2M6 6l1 15h10l1-15" />
    </>
  ),
  maximize: <rect x="4.5" y="4.5" width="15" height="15" />,
  restore: (
    <>
      <rect x="4.5" y="8.5" width="11" height="11" />
      <path d="M8.5 8.5v-4h11v11h-4" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M20 4v5h-5" />
    </>
  ),
  record: <path {...F} d={dot(12, 12, 6.5)} />,
  stop: <rect {...F} x="6" y="6" width="12" height="12" />,
  location: (
    <>
      <path d="M12 21s-6.5-6.4-6.5-11a6.5 6.5 0 0 1 13 0c0 4.6-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  "camera-switch": (
    <>
      <path d="M4 9.5a8 8 0 0 1 14.4-3.3M20 14.5a8 8 0 0 1-14.4 3.3" />
      <path d="M18.8 2.8v3.8H15M5.2 21.2v-3.8H9" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4h3M9.5 2.5h5M19 6l-1.5 1.5" />
    </>
  ),
  stopwatch: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5 15 10.5M12 2.5v3.5M10 2.5h4" />
    </>
  ),
  edit: <path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11L4 20ZM14 7l3 3" />,
  save: (
    <>
      <path d="M4 4h13l3 3v13H4z" />
      <path d="M8 4v5h7V4M7 20v-6h10v6" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h1M4 12h1M4 18h1" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
    </>
  ),
  flag: <path d="M5 21V4M5 4c5-2 9 2 14 0v9c-5 2-9-2-14 0" />,
  ease: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="7.3" r="1.2" fill="currentColor" stroke="none" />
      <path d="M7 10h10M12 10v4l-3 4M12 14l3 4" />
    </>
  ),
};

export function Icon({ name, size = 24, className, strokeWidth = 1.6 }: { name: IconName; size?: number | string; className?: string; strokeWidth?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const glyph = P[name];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {typeof glyph === "function" ? glyph(uid) : glyph}
    </svg>
  );
}

/** The Windows 8 logo (boot screen, Start button, charms). */
export function WinLogo({ size = 64, className, color = "currentColor" }: { size?: number; className?: string; color?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {WIN_PANES.map((pts) => (
        <polygon key={pts} points={pts} fill={color} />
      ))}
    </svg>
  );
}

/** Kept for older imports: the boot logo is the Windows logo now. */
export const Monogram = WinLogo;
