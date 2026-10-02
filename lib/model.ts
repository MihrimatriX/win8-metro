/** Static definitions: apps, default Start layout, colors and visitor achievements. */
import type { Key } from "./i18n";
import type { L, Tier } from "./types";
import { projects, socials } from "@/content/portfolio";

export type AppId = "projects" | "profile" | "mail" | "reader" | "photos" | "music" | "achievements" | "calendar" | "desktop" | "settings";

export type IconName =
  | "projects" | "profile" | "mail" | "reader" | "photos" | "music" | "achievements" | "calendar" | "desktop" | "settings"
  | "search" | "share" | "start" | "devices" | "power" | "back" | "forward" | "down" | "up" | "play" | "pause" | "next" | "prev"
  | "github" | "linkedin" | "x" | "blog" | "cv" | "close" | "minus" | "plus" | "check" | "folder" | "file" | "image" | "pc"
  | "keyboard" | "mouse" | "touch" | "print" | "link" | "bell" | "globe" | "volume" | "mute" | "motion" | "brush" | "pin"
  | "unpin" | "resize" | "lock" | "user" | "wifi" | "battery" | "star" | "new" | "send" | "reply" | "trash" | "maximize" | "restore" | "refresh";

export type AppDef = { id: AppId; title: Key; color: string; icon: IconName; phone?: boolean };

export const APPS: AppDef[] = [
  { id: "projects", title: "app.projects", color: "#00a300", icon: "projects" },
  { id: "profile", title: "app.profile", color: "#d24726", icon: "profile" },
  { id: "mail", title: "app.mail", color: "#0072c6", icon: "mail" },
  { id: "reader", title: "app.reader", color: "#a20025", icon: "reader" },
  { id: "photos", title: "app.photos", color: "#008299", icon: "photos" },
  { id: "music", title: "app.music", color: "#e3008c", icon: "music" },
  { id: "achievements", title: "app.achievements", color: "#1e7145", icon: "achievements" },
  { id: "calendar", title: "app.calendar", color: "#5133ab", icon: "calendar" },
  { id: "desktop", title: "app.desktop", color: "#2d89ef", icon: "desktop", phone: false },
  { id: "settings", title: "app.settings", color: "var(--accent)", icon: "settings" },
];

export const app = (id: AppId) => APPS.find((a) => a.id === id)!;

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
