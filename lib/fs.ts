/**
 * A small virtual file system for the desktop: drives, folders and files kept in localStorage.
 * Paths are Windows paths ("C:\Users\AFU\Documents\notes.txt"), matched case-insensitively.
 * Known folders carry a localized display name, like desktop.ini does on a real Turkish Windows.
 */
import { useSyncExternalStore } from "react";
import type { L, Lang, Motif } from "./types";
import { media, profile, projects } from "@/content/portfolio";

export type FileKind =
  "dir" | "drive" | "txt" | "rtf" | "img" | "lnk" | "url" | "exe" | "html" | "audio" | "video" | "other";
export type ArtSpec = { seed: string; motif: Motif; palette: [string, string, string]; variant?: number };

export type FNode = {
  name: string;
  kind: FileKind;
  children?: FNode[];
  /** txt / html / rtf (stored as HTML) contents. */
  text?: string;
  /** img: a data URL (pictures saved from Paint). */
  data?: string;
  /** img: procedural art, rendered by CoverArt. */
  art?: ArtSpec;
  /** lnk: "app:<id>[:param]" or a path; url: an http(s) address; exe: the app id; audio: a Music track id. */
  target?: string;
  /** Localized folder name shown in Explorer (the real name stays in `name`). */
  display?: L;
  created: number;
  modified: number;
  /** Nominal size in bytes for files without contents (programs, generated pictures). */
  size?: number;
  hidden?: boolean;
  system?: boolean;
  /** Recycle Bin: where the item came from and when it was deleted. */
  orig?: string;
  deleted?: number;
};

const STORE = "afu-metro:v2:fs";
export const USER = profile.name;
export const HOME = `C:\\Users\\${USER}`;
export const RECYCLE = "C:\\$Recycle.Bin";

export const KNOWN = {
  desktop: `${HOME}\\Desktop`,
  documents: `${HOME}\\Documents`,
  downloads: `${HOME}\\Downloads`,
  music: `${HOME}\\Music`,
  pictures: `${HOME}\\Pictures`,
  videos: `${HOME}\\Videos`,
} as const;

// ---------- paths ----------

export function splitPath(path: string): string[] {
  return path
    .replace(/\//g, "\\")
    .split("\\")
    .filter((p) => p && p !== ".");
}
export function normalize(path: string): string {
  const out: string[] = [];
  for (const part of splitPath(path)) {
    if (part === "..") {
      if (out.length > 1) out.pop();
    } else out.push(part);
  }
  if (!out.length) return "";
  const drive = out[0].toUpperCase();
  return out.length === 1 ? `${drive}\\` : [drive, ...out.slice(1)].join("\\");
}
export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join("\\"));
}
export function dirname(path: string): string {
  const parts = splitPath(normalize(path));
  if (parts.length <= 1) return normalize(path);
  return normalize(parts.slice(0, -1).join("\\"));
}
export function basename(path: string): string {
  const parts = splitPath(path);
  return parts[parts.length - 1] ?? "";
}
export function extname(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}
/** Resolve `rel` against `cwd` (absolute paths and drive letters win). */
export function resolve(cwd: string, rel: string): string {
  const r = rel.trim().replace(/^"|"$/g, "");
  if (/^[a-z]:/i.test(r)) return normalize(r);
  if (r.startsWith("\\")) return normalize(`${splitPath(cwd)[0] ?? "C:"}${r}`);
  return normalize(`${cwd}\\${r}`);
}
export function kindFromName(name: string): FileKind {
  const e = extname(name);
  if (["txt", "log", "ini", "bat", "md", "json", "csv", "js", "ts", "css", "xml"].includes(e)) return "txt";
  if (["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(e)) return "img";
  if (e === "rtf") return "rtf";
  if (e === "lnk") return "lnk";
  if (e === "url") return "url";
  if (e === "exe") return "exe";
  if (["htm", "html"].includes(e)) return "html";
  if (["mp3", "wma", "wav", "ogg", "m4a", "webm"].includes(e)) return "audio";
  if (["mp4", "wmv", "avi", "mkv", "mov"].includes(e)) return "video";
  return "other";
}

// ---------- seed ----------

const now = () => Date.now();
const T0 = new Date("2026-09-14T10:24:00").getTime();
const dir = (name: string, children: FNode[] = [], extra: Partial<FNode> = {}): FNode => ({
  name,
  kind: "dir",
  children,
  created: T0,
  modified: T0,
  ...extra,
});
const file = (name: string, extra: Partial<FNode> = {}): FNode => ({
  name,
  kind: kindFromName(name),
  created: T0,
  modified: T0,
  ...extra,
});

function seed(lang: Lang): FNode {
  const tr = lang === "tr";
  const year = (y: number) => new Date(`${y}-06-01T12:00:00`).getTime();
  const readme = tr
    ? `Merhaba!\r\n\r\nBu masaüstü gerçekten çalışıyor: Not Defteri'nde yazdıklarını kaydedebilir, Paint'te resim çizebilir, Dosya Gezgini'nde klasör açıp dosyaları taşıyabilir, Komut İstemi'nde "dir" yazabilirsin. Her şey bu tarayıcıda saklanır.\r\n\r\nBelgeler\\Projeler klasöründe her projem için bir klasör var.\r\n\r\nBaşlangıç ekranına dönmek için sol alttaki Windows düğmesine bas.\r\n\r\n${profile.name}`
    : `Hi!\r\n\r\nThis desktop really works: save what you type in Notepad, draw in Paint, create folders and move files in File Explorer, type "dir" in the Command Prompt. Everything is kept in this browser.\r\n\r\nDocuments\\Projects has a folder for each of my projects.\r\n\r\nPress the Windows button at the bottom left to get back to Start.\r\n\r\n${profile.name}`;
  const cv = [
    `${profile.name} · ${profile.title[lang]}`,
    profile.location[lang],
    "",
    profile.about[lang],
    "",
    `== ${tr ? "Deneyim" : "Experience"} ==`,
    ...profile.experience.map((e) => `${e.period}  ${e.role[lang]}, ${e.company}\r\n    ${e.summary[lang]}`),
    "",
    `== ${tr ? "Yetenekler" : "Skills"} ==`,
    profile.skills.map((s) => s.name).join(", "),
    "",
    `== ${tr ? "Eğitim" : "Education"} ==`,
    ...profile.education.map((e) => `${e.period}  ${e.degree[lang]}, ${e.school}`),
  ].join("\r\n");

  const projectDirs = projects.map((p) =>
    dir(
      p.title,
      [
        file(tr ? "aciklama.txt" : "about.txt", {
          text: `${p.title}\r\n${p.tagline[lang]}\r\n\r\n${p.description[lang]}\r\n\r\n${p.tech.join(" · ")}`,
          created: year(p.year),
          modified: year(p.year),
        }),
        file(tr ? "kapak.png" : "cover.png", {
          art: { seed: p.id, motif: p.motif, palette: p.palette },
          size: 482_304,
          created: year(p.year),
          modified: year(p.year),
        }),
        file(`${tr ? "ekran" : "screen"}-1.png`, {
          art: { seed: p.id, motif: p.motif, palette: p.palette, variant: 1 },
          size: 391_220,
          created: year(p.year),
          modified: year(p.year),
        }),
        file(`${tr ? "ekran" : "screen"}-2.png`, {
          art: { seed: p.id, motif: p.motif, palette: p.palette, variant: 2 },
          size: 402_871,
          created: year(p.year),
          modified: year(p.year),
        }),
        file(`${p.title}.lnk`, {
          target: `app:projects:${p.id}`,
          size: 1_024,
          created: year(p.year),
          modified: year(p.year),
        }),
        ...(p.links.demo && p.links.demo !== "#"
          ? [file(`${p.title} demo.url`, { target: p.links.demo, size: 220 })]
          : []),
      ],
      { created: year(p.year), modified: year(p.year) },
    ),
  );

  const exe = (name: string, target: string, size: number) => file(name, { target, size, system: true });
  const wallpapers = [
    {
      name: "img0.jpg",
      art: {
        seed: "wallpaper",
        motif: "dunes" as Motif,
        palette: ["#0b1a3a", "#1e4fa8", "#7dd3fc"] as [string, string, string],
      },
    },
    ...projects
      .slice(0, 5)
      .map((p, i) => ({ name: `img${i + 1}.jpg`, art: { seed: p.id, motif: p.motif, palette: p.palette } })),
  ];

  return dir("", [
    dir(
      "C:",
      [
        dir(
          "Users",
          [
            dir(
              USER,
              [
                dir(
                  "Desktop",
                  [
                    file(tr ? "Beni oku.txt" : "Read me.txt", { text: readme, modified: now() }),
                    file("CV.txt", { text: cv }),
                  ],
                  { display: { tr: "Masaüstü", en: "Desktop" } },
                ),
                dir(
                  "Documents",
                  [
                    dir(tr ? "Projeler" : "Projects", projectDirs),
                    file("CV.txt", { text: cv }),
                    file(tr ? "Yapılacaklar.txt" : "To do.txt", {
                      text: tr
                        ? "- Windows 8 klonunu bitir\r\n- Paint'te bir şey çiz\r\n- Mayın Tarlası'nda rekor kır"
                        : "- Finish the Windows 8 clone\r\n- Draw something in Paint\r\n- Beat Minesweeper",
                    }),
                    ...media.map((m) =>
                      file(`${m.title[lang].replace(/[\\/:*?"<>|]/g, "")}.url`, {
                        target: `app:reader:${m.id}`,
                        size: 180,
                      }),
                    ),
                  ],
                  { display: { tr: "Belgeler", en: "Documents" } },
                ),
                dir("Downloads", [], { display: { tr: "İndirilenler", en: "Downloads" } }),
                dir(
                  "Music",
                  [
                    dir("Browser Sessions", [
                      file("01 Kuzey Işığı.wma", { target: "aurora", size: 5_242_880 }),
                      file("02 Liman.wma", { target: "harbor", size: 4_718_592 }),
                      file("03 Gece Treni.wma", { target: "night-train", size: 6_029_312 }),
                    ]),
                  ],
                  { display: { tr: "Müzik", en: "Music" } },
                ),
                dir(
                  "Pictures",
                  [
                    dir(
                      tr ? "Proje görselleri" : "Project art",
                      projects.map((p) =>
                        file(`${p.id}.png`, { art: { seed: p.id, motif: p.motif, palette: p.palette }, size: 482_304 }),
                      ),
                    ),
                    ...media.map((m) =>
                      file(`${m.id}.png`, { art: { seed: m.id, motif: m.motif, palette: m.palette }, size: 356_112 }),
                    ),
                  ],
                  { display: { tr: "Resimler", en: "Pictures" } },
                ),
                dir("Videos", [], { display: { tr: "Videolar", en: "Videos" } }),
                dir(
                  "Favorites",
                  [
                    file("Bing.url", { target: "https://www.bing.com" }),
                    file("Wikipedia.url", { target: "https://www.wikipedia.org" }),
                  ],
                  { display: { tr: "Sık Kullanılanlar", en: "Favorites" } },
                ),
              ],
              {},
            ),
            dir("Public", [], { display: { tr: "Ortak", en: "Public" } }),
          ],
          { display: { tr: "Kullanıcılar", en: "Users" } },
        ),
        dir(
          "Windows",
          [
            dir("System32", [
              exe("calc.exe", "calc", 918_528),
              exe("cmd.exe", "cmd", 357_376),
              exe("control.exe", "control", 117_248),
              exe("mspaint.exe", "paint", 6_656_000),
              exe("notepad.exe", "notepad", 219_136),
              exe("taskmgr.exe", "taskmgr", 1_224_704),
              exe("winver.exe", "winver", 43_008),
              exe("write.exe", "wordpad", 10_240),
              dir("drivers", [
                file("etc", {
                  kind: "dir",
                  children: [
                    file("hosts", {
                      kind: "txt",
                      text: "# Copyright (c) 1993-2009 Microsoft Corp.\r\n#\r\n127.0.0.1       localhost\r\n::1             localhost\r\n",
                    }),
                  ],
                }),
              ]),
            ]),
            dir("Web", [
              dir("Wallpaper", [
                dir(
                  "Windows",
                  wallpapers.map((w) => file(w.name, { art: w.art, size: 1_048_576, system: true })),
                ),
              ]),
            ]),
            exe("explorer.exe", "explorer", 2_390_528),
            exe("notepad.exe", "notepad", 219_136),
            file("win.ini", {
              text: "; for 16-bit app support\r\n[fonts]\r\n[extensions]\r\n[mci extensions]\r\n[files]\r\n[Mail]\r\nMAPI=1\r\n",
              system: true,
            }),
          ],
          { system: true },
        ),
        dir(
          "Program Files",
          [
            dir("Internet Explorer", [exe("iexplore.exe", "ie", 815_104)]),
            dir("Windows NT", [dir("Accessories", [exe("wordpad.exe", "wordpad", 4_247_552)])]),
            dir("Microsoft Games", [dir("Minesweeper", [exe("Minesweeper.exe", "minesweeper", 2_681_856)])]),
          ],
          {},
        ),
        dir("$Recycle.Bin", [], { hidden: true, system: true }),
      ],
      { kind: "drive", display: { tr: "Yerel Disk (C:)", en: "Local Disk (C:)" } },
    ),
    dir("D:", [], { kind: "drive", display: { tr: "DVD RW Sürücüsü (D:)", en: "DVD RW Drive (D:)" } }),
  ]);
}

// ---------- store ----------

let root: FNode | null = null;
let version = 0;
const listeners = new Set<() => void>();

function persist() {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(root));
    return true;
  } catch {
    return false;
  }
}

function emit() {
  version++;
  persist();
  listeners.forEach((l) => l());
}

function ensure(): FNode {
  if (root) return root;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORE);
      if (raw) root = JSON.parse(raw) as FNode;
    } catch {
      root = null;
    }
  }
  if (!root) {
    const lang: Lang =
      typeof navigator !== "undefined" && !navigator.language?.toLowerCase().startsWith("tr") ? "en" : "tr";
    let stored: Lang | undefined;
    try {
      stored = JSON.parse(window.localStorage.getItem("afu-metro:v2:prefs") ?? "{}").lang;
    } catch {
      /* first visit */
    }
    root = seed(stored ?? lang);
    if (typeof window !== "undefined") persist();
  }
  return root;
}

const eq = (a: string, b: string) =>
  a.localeCompare(b, "en", { sensitivity: "accent" }) === 0 || a.toLowerCase() === b.toLowerCase();

function walk(path: string): { node: FNode; parent: FNode | null } | null {
  const parts = splitPath(normalize(path));
  let node = ensure();
  let parent: FNode | null = null;
  for (const part of parts) {
    const next = node.children?.find((c) => eq(c.name, part));
    if (!next) return null;
    parent = node;
    node = next;
  }
  return { node, parent };
}

export class FSError extends Error {}

export const fs = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get version() {
    return version;
  },
  root: () => ensure(),
  get(path: string): FNode | null {
    return walk(path)?.node ?? null;
  },
  exists(path: string) {
    return !!walk(path);
  },
  isDir(path: string) {
    const n = walk(path)?.node;
    return !!n && (n.kind === "dir" || n.kind === "drive");
  },
  list(path: string, showHidden = false): FNode[] {
    const n = walk(path)?.node;
    if (!n?.children) return [];
    const kids = showHidden ? n.children : n.children.filter((c) => !c.hidden);
    return [...kids].sort((a, b) => {
      const da = a.kind === "dir" || a.kind === "drive" ? 0 : 1;
      const db = b.kind === "dir" || b.kind === "drive" ? 0 : 1;
      return da - db || a.name.localeCompare(b.name, "tr");
    });
  },
  drives(): FNode[] {
    return ensure().children ?? [];
  },
  read(path: string): string | null {
    const n = walk(path)?.node;
    return n ? (n.text ?? null) : null;
  },
  /** Create or overwrite a file. Returns the node. */
  write(path: string, patch: Partial<FNode>): FNode {
    const p = normalize(path);
    const at = walk(dirname(p));
    if (!at || !at.node.children) throw new FSError("path");
    const name = basename(p);
    const existing = at.node.children.find((c) => eq(c.name, name));
    if (existing) {
      if (existing.kind === "dir" || existing.kind === "drive") throw new FSError("isdir");
      Object.assign(existing, patch, { modified: now() });
      emit();
      return existing;
    }
    const node: FNode = { name, kind: kindFromName(name), created: now(), modified: now(), ...patch };
    at.node.children.push(node);
    at.node.modified = now();
    emit();
    return node;
  },
  writeText(path: string, text: string) {
    return fs.write(path, { text });
  },
  mkdir(path: string): FNode {
    const p = normalize(path);
    const found = walk(p);
    if (found) return found.node;
    const parentPath = dirname(p);
    if (!walk(parentPath)) fs.mkdir(parentPath);
    const parent = walk(parentPath)!.node;
    if (!parent.children) throw new FSError("notdir");
    const node = dir(basename(p), [], { created: now(), modified: now() });
    parent.children.push(node);
    emit();
    return node;
  },
  /** A free name in `dir` based on `base` ("Yeni klasör", "Yeni klasör (2)", …). */
  uniqueName(dirPath: string, base: string): string {
    const kids = walk(dirPath)?.node.children ?? [];
    const taken = (n: string) => kids.some((c) => eq(c.name, n));
    if (!taken(base)) return base;
    const e = extname(base);
    const stem = e ? base.slice(0, -(e.length + 1)) : base;
    for (let i = 2; ; i++) {
      const n = e ? `${stem} (${i}).${e}` : `${stem} (${i})`;
      if (!taken(n)) return n;
    }
  },
  rename(path: string, name: string) {
    const clean = name.trim();
    if (!clean || /[\\/:*?"<>|]/.test(clean)) throw new FSError("badname");
    const at = walk(path);
    if (!at?.parent) throw new FSError("path");
    if (at.parent.children!.some((c) => c !== at.node && eq(c.name, clean))) throw new FSError("exists");
    at.node.name = clean;
    if (at.node.display) delete at.node.display;
    at.node.modified = now();
    emit();
  },
  /** Move to the Recycle Bin (or delete for good with `permanent`, or when already in the bin). */
  remove(path: string, permanent = false) {
    const p = normalize(path);
    const at = walk(p);
    if (!at?.parent || at.node.kind === "drive") throw new FSError("path");
    at.parent.children = at.parent.children!.filter((c) => c !== at.node);
    const inBin = p.toLowerCase().startsWith(RECYCLE.toLowerCase());
    if (!permanent && !inBin) {
      const bin = walk(RECYCLE)?.node ?? fs.mkdir(RECYCLE);
      const stored = {
        ...at.node,
        name: `$R${Math.random().toString(36).slice(2, 8).toUpperCase()}${extname(at.node.name) ? `.${extname(at.node.name)}` : ""}`,
        orig: p,
        deleted: now(),
      };
      bin.children!.push(stored);
    }
    emit();
  },
  restore(binName: string) {
    const at = walk(`${RECYCLE}\\${binName}`);
    if (!at?.parent || !at.node.orig) return;
    const target = dirname(at.node.orig);
    if (!walk(target)) fs.mkdir(target);
    const parent = walk(target)!.node;
    const name = fs.uniqueName(target, basename(at.node.orig));
    at.parent.children = at.parent.children!.filter((c) => c !== at.node);
    const { orig: _o, deleted: _d, ...rest } = at.node;
    parent.children!.push({ ...rest, name });
    emit();
  },
  emptyBin() {
    const bin = walk(RECYCLE)?.node;
    if (bin) bin.children = [];
    emit();
  },
  binCount() {
    return walk(RECYCLE)?.node.children?.length ?? 0;
  },
  copy(src: string, destDir: string, move = false): string {
    const from = walk(src);
    const to = walk(destDir)?.node;
    if (!from?.parent || !to?.children) throw new FSError("path");
    const s = normalize(src).toLowerCase();
    const d = normalize(destDir).toLowerCase();
    if (d === s || d.startsWith(`${s}\\`)) throw new FSError("into-self");
    if (move && normalize(dirname(src)).toLowerCase() === d) return normalize(src);
    const name = fs.uniqueName(destDir, from.node.name);
    const clone: FNode = JSON.parse(JSON.stringify(from.node));
    clone.name = name;
    if (!move) clone.created = clone.modified = now();
    to.children.push(clone);
    if (move) from.parent.children = from.parent.children!.filter((c) => c !== from.node);
    emit();
    return join(destDir, name);
  },
  move(src: string, destDir: string) {
    return fs.copy(src, destDir, true);
  },
  /** Bytes a node takes (contents, or its nominal size). Folders add up their children. */
  size(n: FNode): number {
    if (n.children) return n.children.reduce((s, c) => s + fs.size(c), 0);
    if (n.size) return n.size;
    if (n.data) return Math.round(n.data.length * 0.75);
    if (n.text) return new Blob([n.text]).size;
    return 0;
  },
  /** Start over from the seed (Control Panel → reset, or a corrupted store). */
  reset(lang: Lang) {
    root = seed(lang);
    emit();
  },
  /** Display name for a node in the given language. */
  label(n: FNode, lang: Lang) {
    return n.display?.[lang] ?? n.name;
  },
};

/** Re-render when the file system changes. */
export function useFS() {
  return useSyncExternalStore(
    fs.subscribe,
    () => version,
    () => 0,
  );
}

/** "12,4 KB" in the Explorer style. */
export function formatSize(bytes: number, lang: Lang) {
  const nf = (n: number) =>
    n.toLocaleString(lang === "tr" ? "tr-TR" : "en-US", { maximumFractionDigits: n < 10 ? 1 : 0 });
  if (bytes < 1024) return `${bytes} ${lang === "tr" ? "bayt" : "bytes"}`;
  if (bytes < 1024 * 1024) return `${nf(Math.ceil(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${nf(bytes / 1024 / 1024)} MB`;
  return `${nf(bytes / 1024 ** 3)} GB`;
}

export function formatStamp(ms: number, lang: Lang) {
  const d = new Date(ms);
  const date = d.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US");
  return `${date} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** File type label for Explorer's "Type" column. */
export function typeLabel(n: FNode, lang: Lang): string {
  const tr = lang === "tr";
  switch (n.kind) {
    case "dir":
      return tr ? "Dosya klasörü" : "File folder";
    case "drive":
      return tr ? "Yerel Disk" : "Local Disk";
    case "txt":
      return tr ? "Metin Belgesi" : "Text Document";
    case "rtf":
      return tr ? "Zengin Metin Belgesi" : "Rich Text Document";
    case "img":
      return `${extname(n.name).toUpperCase() || "PNG"} ${tr ? "Dosyası" : "File"}`;
    case "lnk":
      return tr ? "Kısayol" : "Shortcut";
    case "url":
      return tr ? "İnternet Kısayolu" : "Internet Shortcut";
    case "exe":
      return tr ? "Uygulama" : "Application";
    case "html":
      return tr ? "HTML Belgesi" : "HTML Document";
    case "audio":
      return tr ? "Ses dosyası" : "Audio file";
    case "video":
      return tr ? "Video dosyası" : "Video file";
    default:
      return `${extname(n.name).toUpperCase()} ${tr ? "Dosyası" : "File"}`.trim();
  }
}
