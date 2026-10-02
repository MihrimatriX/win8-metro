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
  d("ie", "app.ie", "#2672ec", "ie", "iexplore.exe", "apps"),
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
export type GroupId = "me" | "projects" | "read" | "links";
export const GROUPS: { id: GroupId; title: Key }[] = [
  { id: "me", title: "group.me" },
  { id: "projects", title: "group.projects" },
  { id: "read", title: "group.read" },
  { id: "links", title: "group.links" },
];

export function parseKey(key: string): TileRef {
  const [kind, id] = key.split(":");
  return { kind, id } as TileRef;
}

/** Which sizes each tile supports (apps with rich live content allow large). */
export function sizesFor(key: string): TileSize[] {
  const ref = parseKey(key);
  if (ref.kind === "social") return ["small", "medium"];
  if (ref.kind === "project") return ["small", "medium", "wide", "large"];
  if (["profile", "photos", "reader", "desktop", "music", "projects"].includes(ref.id)) return ["small", "medium", "wide", "large"];
  return ["small", "medium", "wide"];
}

export function defaultTiles(): TileState[] {
  const t = (key: string, size: TileSize, group: GroupId): TileState => ({ key, size, group, live: true, pinned: true });
  const featured = projects.filter((p) => !p.sample).map((p) => p.id);
  return [
    t("app:profile", "wide", "me"),
    t("app:mail", "wide", "me"),
    t("app:calendar", "medium", "me"),
    t("app:achievements", "medium", "me"),
    t("app:desktop", "wide", "me"),
    t("app:settings", "small", "me"),
    t("app:music", "medium", "me"),
    ...projects.map((p, i) => t(`project:${p.id}`, i === 0 ? "large" : i < featured.length ? "wide" : "medium", "projects")),
    t("app:projects", "wide", "projects"),
    t("app:reader", "large", "read"),
    t("app:photos", "wide", "read"),
    ...socials.map((s) => t(`social:${s.id}`, s.id === "github" ? "medium" : "small", "links")),
  ];
}

/** Where a dragged tile is dropped: onto another tile, or onto a group's empty space. */
export type DropTarget = { key: string } | { group: GroupId };

/**
 * Move the tile `key` to `to` and return the new list (Start renders each group's tiles in list order).
 * Called repeatedly while a tile is dragged, so the other tiles make room live.
 */
export function moveTile(tiles: TileState[], key: string, to: DropTarget): TileState[] {
  // TODO(human): take the dragged tile out, then put it back next to `to.key` (adopting that tile's group),
  // or at the end of `to.group`. Decide whether it lands before or after the hovered tile.
  return tiles;
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

export const PATTERNS = ["none", "waves", "geo", "circuit", "bubbles"] as const;
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
