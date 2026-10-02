/** Original line icons in the flat Metro spirit (24×24, stroke = currentColor). No system glyph fonts are used. */
import type { IconName } from "@/lib/model";

const P: Record<IconName, React.ReactNode> = {
  projects: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      <path d="M9.5 13.5h5" />
    </>
  ),
  profile: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M16.2 14.4c2.6-.2 4.3 1.4 4.8 4.4" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
  reader: (
    <>
      <path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Z" />
      <path d="M17 9h3v8a2 2 0 0 1-2 2" />
      <path d="M7 8.5h7M7 11.5h7M7 14.5h4" />
    </>
  ),
  photos: (
    <>
      <rect x="3" y="5" width="18" height="14" />
      <path d="m3 16 5-5 4 4 3-3 6 6" />
      <circle cx="16" cy="9" r="1.5" />
    </>
  ),
  music: (
    <>
      <path d="M4 13a8 8 0 0 1 16 0" />
      <rect x="3.5" y="13" width="4" height="6.5" />
      <rect x="16.5" y="13" width="4" height="6.5" />
    </>
  ),
  achievements: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v3M8.5 20h7M9.5 17h5v3h-5z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  desktop: (
    <>
      <rect x="3" y="4.5" width="18" height="12" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" />
      <circle cx="12" cy="12" r="6.6" />
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
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v10M7 12h10" transform="rotate(45 12 12)" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  start: (
    <>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" />
      <rect x="3.5" y="13" width="17" height="7.5" />
    </>
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
};

export function Icon({ name, size = 24, className, strokeWidth = 1.6 }: { name: IconName; size?: number | string; className?: string; strokeWidth?: number }) {
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
      {P[name]}
    </svg>
  );
}

/** Original monogram used where the system would show its own logo (boot, phone Start button). */
export function Monogram({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M8 54 26 10h6L14 54Z" fill="currentColor" />
      <path d="M22 54 36 20h6L28 54Z" fill="currentColor" opacity="0.75" />
      <path d="M36 54 46 30h6L42 54Z" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
