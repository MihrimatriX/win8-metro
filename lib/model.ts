/** Static definitions: apps, default Start layout, colors and visitor achievements. */
import type { Key } from "./i18n";
import type { L, Tier } from "./types";
import { projects, socials } from "@/content/portfolio";

export type MetroAppId =
  | "projects" | "profile" | "mail" | "reader" | "photos" | "music" | "achievements" | "calendar" | "desktop" | "settings"
  | "weather" | "news" | "sports" | "finance" | "travel" | "maps" | "camera" | "alarms" | "soundrec" | "video" | "skydrive";
export type DesktopAppId =
  | "explorer" | "ie" | "notepad" | "wordpad" | "paint" | "calc" | "cmd" | "taskmgr" | "control" | "minesweeper" | "run" | "winver";
export type AppId = MetroAppId | DesktopAppId;

export type IconName =
  | "projects" | "profile" | "mail" | "reader" | "photos" | "music" | "achievements" | "calendar" | "desktop" | "settings"
  | "weather" | "news" | "sports" | "finance" | "travel" | "maps" | "camera" | "alarms" | "soundrec" | "video" | "skydrive" | "ie" | "calculator" | "help"
  | "search" | "share" | "start" | "devices" | "power" | "back" | "forward" | "down" | "up" | "play" | "pause" | "next" | "prev"
  | "github" | "linkedin" | "x" | "blog" | "cv" | "close" | "minus" | "plus" | "check" | "folder" | "file" | "image" | "pc"
  | "keyboard" | "mouse" | "touch" | "print" | "link" | "bell" | "globe" | "volume" | "mute" | "motion" | "brush" | "pin"
  | "unpin" | "resize" | "lock" | "user" | "wifi" | "battery" | "star" | "new" | "send" | "reply" | "trash" | "maximize" | "restore" | "refresh"
  | "record" | "stop" | "location" | "camera-switch" | "timer" | "stopwatch" | "edit" | "save" | "list" | "grid" | "flag" | "ease";

/** Colorful desktop (Win32) icon names, drawn in components/icons/ShellIcons.tsx. */
export type ShellIconName =
  | "folder" | "folder-open" | "folder-documents" | "folder-pictures" | "folder-music" | "folder-videos" | "folder-downloads" | "folder-desktop" | "folder-user"
  | "thispc" | "drive" | "drive-system" | "dvd" | "network" | "recycle-empty" | "recycle-full" | "libraries" | "favorites" | "homegroup"
  | "explorer" | "ie" | "notepad" | "wordpad" | "paint" | "calc" | "cmd" | "taskmgr" | "control" | "minesweeper" | "run" | "windows"
  | "file" | "file-txt" | "file-rtf" | "file-img" | "file-url" | "file-exe" | "file-html" | "file-audio" | "file-video" | "file-lnk"
  | "msg-info" | "msg-warning" | "msg-error" | "msg-question" | "shield" | "user" | "display" | "personalize" | "clock" | "programs" | "sound" | "mouse" | "keyboard" | "power" | "fonts" | "region" | "ease" | "devices" | "accounts" | "update";

export type AppDef = {
  id: AppId;
  title: Key;
  color: string;
  icon: IconName;
  /** Metro (full screen, Windows Store) apps run in AppHost; desktop apps open in a window on the desktop. */
  kind: "metro" | "desktop";
  /** Desktop apps draw a colorful Win32 icon instead of a Metro glyph. */
  shell?: ShellIconName;
  /** Program name for Run / Command Prompt / Task Manager. */
  exe?: string;
  phone?: boolean;
  /** Not listed in the Apps view (dialogs such as Run). */
  hidden?: boolean;
  /** Apps view "by category" group. */
  cat?: "apps" | "accessories" | "system" | "games";
};

const m = (id: MetroAppId, title: Key, color: string, icon: IconName, extra: Partial<AppDef> = {}): AppDef => ({ id, title, color, icon, kind: "metro", cat: "apps", ...extra });
const d = (id: DesktopAppId, title: Key, color: string, shell: ShellIconName, exe: string, cat: AppDef["cat"], extra: Partial<AppDef> = {}): AppDef => ({
  id,
  title,
  color,
  icon: "desktop",
  kind: "desktop",
  shell,
  exe,
  cat,
  phone: false,
  ...extra,
});

export const APPS: AppDef[] = [
  m("mail", "app.mail", "#00a0b1", "mail"),
  m("calendar", "app.calendar", "#5133ab", "calendar"),
  m("profile", "app.profile", "#d24726", "profile"),
  m("photos", "app.photos", "#008299", "photos"),
  m("projects", "app.projects", "#00a300", "projects"),
  m("weather", "app.weather", "#1ba1e2", "weather"),
  m("news", "app.news", "#ac193d", "news"),
  m("sports", "app.sports", "#603cba", "sports"),
  m("finance", "app.finance", "#008a00", "finance"),
  m("travel", "app.travel", "#00aba9", "travel"),
  m("maps", "app.maps", "#9f00a7", "maps"),
  m("skydrive", "app.skydrive", "#094ab2", "skydrive"),
  m("music", "app.music", "#e56c19", "music"),
  m("video", "app.video", "#b01e00", "video"),
  m("achievements", "app.achievements", "#107c10", "achievements", { cat: "games" }),
  m("camera", "app.camera", "#aa1e44", "camera"),
  m("alarms", "app.alarms", "#da532c", "alarms"),
  m("soundrec", "app.soundrec", "#b91d47", "soundrec"),
  m("reader", "app.reader", "#a20025", "reader"),
  m("desktop", "app.desktop", "#2d89ef", "desktop", { phone: false }),
  m("settings", "app.settings", "var(--accent)", "settings"),
  // IE is a desktop program here, but its Start tile is the Metro one: the blue "e" glyph.
  d("ie", "app.ie", "#2672ec", "ie", "iexplore.exe", "apps", { icon: "ie" }),
  d("explorer", "app.explorer", "#d39d09", "explorer", "explorer.exe", "system"),
  d("notepad", "app.notepad", "#2d89ef", "notepad", "notepad.exe", "accessories"),
  d("wordpad", "app.wordpad", "#2b5797", "wordpad", "write.exe", "accessories"),
  d("paint", "app.paint", "#da532c", "paint", "mspaint.exe", "accessories"),
  d("calc", "app.calc", "#4b4b4b", "calc", "calc.exe", "accessories"),
  d("cmd", "app.cmd", "#1d1d1d", "cmd", "cmd.exe", "system"),
  d("taskmgr", "app.taskmgr", "#00a300", "taskmgr", "taskmgr.exe", "system"),
  d("control", "app.control", "#2d89ef", "control", "control.exe", "system"),
  d("minesweeper", "app.minesweeper", "#1e7145", "minesweeper", "minesweeper.exe", "games"),
  d("run", "app.run", "#2d89ef", "run", "run", "system"),
  d("winver", "app.winver", "#2d89ef", "windows", "winver.exe", "system", { hidden: true }),
];

export const app = (id: AppId) => APPS.find((a) => a.id === id) ?? APPS[0];
export const isDesktopApp = (id: string): id is DesktopAppId => APPS.some((a) => a.id === id && a.kind === "desktop");
/** Find an app by its program name ("notepad", "notepad.exe", "mspaint"…), for Run and the Command Prompt. */
export function appByExe(name: string): AppDef | undefined {
  const n = name.trim().toLowerCase().replace(/^"|"$/g, "").split(/[\\/]/).pop() ?? "";
  const base = n.replace(/\.exe$/, "");
  const alias: Record<string, string> = { iexplore: "ie", mspaint: "paint", write: "wordpad", explorer: "explorer", control: "control", calc: "calc", taskmgr: "taskmgr" };
  return APPS.find((a) => a.exe?.replace(/\.exe$/, "") === base || a.id === (alias[base] ?? base));
}

export type TileSize = "small" | "medium" | "wide" | "large";
export const SPAN: Record<TileSize, [number, number]> = { small: [1, 1], medium: [2, 2], wide: [4, 2], large: [4, 4] };

export type TileRef = { kind: "app"; id: AppId } | { kind: "project"; id: string } | { kind: "social"; id: string };
export type TileState = { key: string; size: TileSize; live: boolean; pinned: boolean; group: GroupId };
export type GroupId = "main" | "info" | "projects" | "tools" | "links";
/** Start groups. The first two are unnamed, like a fresh Windows 8.1 Start screen. */
export const GROUPS: { id: GroupId; title: Key }[] = [
  { id: "main", title: "group.main" },
  { id: "info", title: "group.info" },
  { id: "projects", title: "group.projects" },
  { id: "tools", title: "group.tools" },
  { id: "links", title: "group.links" },
];

export function parseKey(key: string): TileRef {
  const [kind, id] = key.split(":");
  return { kind, id } as TileRef;
}

/** Which sizes each tile supports (apps with rich live content allow large; desktop programs only small and medium). */
export function sizesFor(key: string): TileSize[] {
  const ref = parseKey(key);
  if (ref.kind === "social") return ["small", "medium"];
  if (ref.kind === "project") return ["small", "medium", "wide", "large"];
  if (isDesktopApp(ref.id)) return ["small", "medium"];
  if (["profile", "photos", "reader", "desktop", "music", "projects", "news", "weather", "travel", "calendar", "mail"].includes(ref.id)) return ["small", "medium", "wide", "large"];
  if (["ie", "settings", "camera", "alarms", "soundrec"].includes(ref.id)) return ["small", "medium"];
  return ["small", "medium", "wide"];
}

export function defaultTiles(): TileState[] {
  const t = (key: string, size: TileSize, group: GroupId): TileState => ({ key, size, group, live: true, pinned: true });
  const featured = projects.filter((p) => !p.sample).map((p) => p.id);
  return [
    // A Windows 8.1 Start screen, column by column (tiles flow top to bottom, then to the next column).
    t("app:mail", "wide", "main"),
    t("app:calendar", "medium", "main"),
    t("app:profile", "medium", "main"),
    t("app:ie", "medium", "main"),
    t("app:projects", "medium", "main"),
    t("app:weather", "wide", "main"),
    t("app:photos", "wide", "main"),
    t("app:desktop", "wide", "main"),
    t("app:maps", "medium", "main"),
    t("app:skydrive", "medium", "main"),
    t("app:music", "medium", "main"),
    t("app:video", "medium", "main"),
    t("app:achievements", "medium", "main"),
    t("app:camera", "medium", "main"),
    t("app:news", "large", "info"),
    t("app:finance", "wide", "info"),
    t("app:travel", "wide", "info"),
    t("app:sports", "wide", "info"),
    t("app:reader", "medium", "info"),
    t("app:alarms", "medium", "info"),
    ...projects.map((p, i) => t(`project:${p.id}`, i === 0 ? "large" : i < featured.length ? "wide" : "medium", "projects")),
    t("app:explorer", "medium", "tools"),
    t("app:control", "medium", "tools"),
    t("app:settings", "medium", "tools"),
    t("app:notepad", "medium", "tools"),
    t("app:paint", "medium", "tools"),
    t("app:cmd", "small", "tools"),
    t("app:calc", "small", "tools"),
    t("app:taskmgr", "small", "tools"),
    t("app:soundrec", "small", "tools"),
    t("app:minesweeper", "medium", "tools"),
    t("app:wordpad", "medium", "tools"),
    ...socials.map((s) => t(`social:${s.id}`, s.id === "github" ? "medium" : "small", "links")),
  ];
}

/** Where a dragged tile is dropped: onto another tile, or onto a group's empty space. */
export type DropTarget = { key: string } | { group: GroupId };

/**
 * Move the tile `key` to `to` and return the new list (Start renders each group's tiles in list order).
 * Called repeatedly while a tile is dragged, so the other tiles make room live.
 * Over another tile: a tile coming from earlier in the same group lands after it, otherwise before it,
 * so dragging across a neighbour always swaps the two. Over a group's empty space: it joins the end of that group.
 */
export function moveTile(tiles: TileState[], key: string, to: DropTarget): TileState[] {
  const from = tiles.findIndex((x) => x.key === key);
  if (from < 0) return tiles;
  const item = tiles[from];
  const rest = tiles.filter((x) => x.key !== key);
  if ("key" in to) {
    if (to.key === key) return tiles;
    const at = rest.findIndex((x) => x.key === to.key);
    if (at < 0) return tiles;
    const target = rest[at];
    const after = target.group === item.group && from < tiles.indexOf(target);
    rest.splice(after ? at + 1 : at, 0, { ...item, group: target.group });
    return rest;
  }
  let last = -1;
  rest.forEach((x, i) => {
    if (x.group === to.group) last = i;
  });
  if (item.group === to.group && last === from - 1) return tiles; // already the last one there
  const moved = { ...item, group: to.group };
  if (last < 0) rest.push(moved);
  else rest.splice(last + 1, 0, moved);
  return rest;
}

/** Win8-style pairs: Start background + accent. */
export const COLORS: { bg: string; accent: string }[] = [
  { bg: "#1b0f4a", accent: "#5b3bd1" },
  { bg: "#2b0a3d", accent: "#9b2bc0" },
  { bg: "#001940", accent: "#2672ec" },
  { bg: "#003238", accent: "#00a0b1" },
  { bg: "#0b2b10", accent: "#36a832" },
  { bg: "#3d0a0a", accent: "#d13438" },
  { bg: "#3f1a00", accent: "#e0681b" },
  { bg: "#3d0030", accent: "#c1287f" },
  { bg: "#141414", accent: "#6b6b6b" },
  { bg: "#0b2a3d", accent: "#1ba1e2" },
];

/** Start backgrounds; "desktop" shows the desktop wallpaper behind the tiles, like Windows 8.1. */
export const PATTERNS = ["none", "waves", "geo", "circuit", "bubbles", "desktop"] as const;
export type Pattern = (typeof PATTERNS)[number];

export type VisitorAchievement = { id: string; name: L; detail: L; tier: Tier; points: number };
export const VISITOR_ACHIEVEMENTS: VisitorAchievement[] = [
  { id: "signin", name: { tr: "Merhaba", en: "Hello" }, detail: { tr: "İlk kez oturum aç", en: "Sign in for the first time" }, tier: "bronze", points: 10 },
  { id: "unlock", name: { tr: "Perdeyi kaldır", en: "Raise the curtain" }, detail: { tr: "Kilit ekranını sürükleyerek aç", en: "Drag the lock screen open" }, tier: "bronze", points: 10 },
  { id: "charms", name: { tr: "Köşe avcısı", en: "Corner hunter" }, detail: { tr: "Charm çubuğunu aç", en: "Open the charms bar" }, tier: "silver", points: 20 },
  { id: "explorer", name: { tr: "Kâşif", en: "Explorer" }, detail: { tr: "Üç farklı proje aç", en: "Open three different projects" }, tier: "silver", points: 20 },
  { id: "zoom", name: { tr: "Kuş bakışı", en: "Bird's eye" }, detail: { tr: "Başlangıç ekranını uzaklaştır", en: "Zoom out the Start screen" }, tier: "bronze", points: 10 },
  { id: "painter", name: { tr: "Ressam", en: "Painter" }, detail: { tr: "Renkleri ya da deseni değiştir", en: "Change the colors or the pattern" }, tier: "bronze", points: 10 },
  { id: "architect", name: { tr: "Mimar", en: "Architect" }, detail: { tr: "Bir kutucuğu yeniden boyutlandır", en: "Resize a tile" }, tier: "silver", points: 20 },
  { id: "desktop", name: { tr: "Eski dostlar", en: "Old friends" }, detail: { tr: "Masaüstüne geç", en: "Visit the desktop" }, tier: "bronze", points: 10 },
  { id: "dj", name: { tr: "DJ", en: "DJ" }, detail: { tr: "Bir parça çal", en: "Play a track" }, tier: "bronze", points: 10 },
  { id: "letter", name: { tr: "Mektup arkadaşı", en: "Pen pal" }, detail: { tr: "Yeni bir e-posta başlat", en: "Start a new email" }, tier: "silver", points: 20 },
  { id: "bookworm", name: { tr: "Kitap kurdu", en: "Bookworm" }, detail: { tr: "İki yazı aç", en: "Open two articles" }, tier: "silver", points: 20 },
  { id: "completionist", name: { tr: "Tamamlayıcı", en: "Completionist" }, detail: { tr: "Diğer tüm başarıları kazan", en: "Earn every other achievement" }, tier: "platinum", points: 100 },
];

export const TIER_COLOR: Record<Tier, string> = { bronze: "#c8834a", silver: "#c9d1d9", gold: "#f4c542", platinum: "#9fd8ff" };

export const socialIcon = (id: string): IconName =>
  (({ github: "github", linkedin: "linkedin", mail: "mail", x: "x", blog: "blog", cv: "cv" }) as Record<string, IconName>)[id] ?? "link";

export const socialColor = (id: string) =>
  (({ github: "#24292f", linkedin: "#0a66c2", mail: "#0072c6", x: "#333333", blog: "#a20025", cv: "#d24726" }) as Record<string, string>)[id] ?? "#555";
