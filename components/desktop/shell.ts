"use client";
/** Shell associations: which icon a file shows and what double-clicking it does. */
import { useCallback } from "react";
import { useOS } from "@/lib/os";
import { fs, normalize, KNOWN, HOME, extname, type FNode } from "@/lib/fs";
import { wm } from "@/lib/wm";
import { appByExe, isDesktopApp, type AppId, type ShellIconName } from "@/lib/model";

const KNOWN_ICONS: [string, ShellIconName][] = [
  [KNOWN.desktop, "folder-desktop"],
  [KNOWN.documents, "folder-documents"],
  [KNOWN.downloads, "folder-downloads"],
  [KNOWN.music, "folder-music"],
  [KNOWN.pictures, "folder-pictures"],
  [KNOWN.videos, "folder-videos"],
  [HOME, "folder-user"],
];

/** Icon for a file system node; pass `path` so known folders get their special icons. */
export function nodeIcon(n: FNode, path?: string): ShellIconName {
  if (path) {
    const p = normalize(path).toLowerCase();
    const hit = KNOWN_ICONS.find(([k]) => normalize(k).toLowerCase() === p);
    if (hit) return hit[1];
  }
  switch (n.kind) {
    case "drive":
      return n.name.toUpperCase() === "C:" ? "drive-system" : "dvd";
    case "dir":
      return "folder";
    case "txt":
      return "file-txt";
    case "rtf":
      return "file-rtf";
    case "img":
      return "file-img";
    case "url":
      return "file-url";
    case "html":
      return "file-html";
    case "audio":
      return "file-audio";
    case "video":
      return "file-video";
    case "exe": {
      const a = appByExe(n.target ?? n.name);
      return a?.shell ?? "file-exe";
    }
    case "lnk": {
      const t = n.target ?? "";
      if (t.startsWith("app:")) {
        const a = appByExe(t.split(":")[1]);
        return a?.shell ?? "file-lnk";
      }
      const target = fs.get(t);
      return target ? nodeIcon(target, t) : "file-lnk";
    }
    default:
      return "file";
  }
}

/** Parse "app:<id>[:param]" targets used by shortcuts. */
export function parseAppTarget(t: string): { id: AppId; param?: string } | null {
  if (!t.startsWith("app:")) return null;
  const [, id, ...rest] = t.split(":");
  return { id: id as AppId, param: rest.length ? rest.join(":") : undefined };
}

/** Open a path the way Explorer does on double-click. `from` is the window asking (Explorer navigates in place). */
export function useOpenPath() {
  const { open, playTrack } = useOS();
  return useCallback(
    (path: string, opts: { navigate?: (p: string) => void } = {}) => {
      const p = normalize(path);
      const n = fs.get(p);
      if (!n) return false;
      const launch = (id: AppId, param?: string) => open({ kind: "app", app: id, param });
      switch (n.kind) {
        case "dir":
        case "drive":
          if (opts.navigate) opts.navigate(p);
          else wm.launch("explorer", { arg: p });
          return true;
        case "txt":
          launch("notepad", p);
          return true;
        case "rtf":
          launch("wordpad", p);
          return true;
        case "img":
          launch("paint", p);
          return true;
        case "html":
          launch("ie", p);
          return true;
        case "url": {
          const t = n.target ?? "";
          const app = parseAppTarget(t);
          if (app) launch(app.id, app.param);
          else launch("ie", t);
          return true;
        }
        case "audio":
          if (n.target) playTrack(n.target);
          launch("music");
          return true;
        case "video":
          launch("video", p);
          return true;
        case "exe": {
          const a = appByExe(n.target ?? n.name);
          if (a) launch(a.id);
          return !!a;
        }
        case "lnk": {
          const t = n.target ?? "";
          const app = parseAppTarget(t);
          if (app) {
            launch(app.id, app.param);
            return true;
          }
          if (fs.exists(t)) {
            const target = fs.get(t)!;
            if ((target.kind === "dir" || target.kind === "drive") && opts.navigate) opts.navigate(normalize(t));
            else return openTarget(t, launch);
            return true;
          }
          return false;
        }
        default:
          // Unknown types open as text, like "Open with Notepad".
          if (["log", "ini", "cfg", "md"].includes(extname(n.name)) || n.text !== undefined) {
            launch("notepad", p);
            return true;
          }
          return false;
      }
    },
    [open, playTrack],
  );
}

function openTarget(t: string, launch: (id: AppId, param?: string) => void) {
  const n = fs.get(t);
  if (!n) return false;
  if (n.kind === "dir" || n.kind === "drive") wm.launch("explorer", { arg: normalize(t) });
  else if (n.kind === "txt") launch("notepad", normalize(t));
  else if (n.kind === "img") launch("paint", normalize(t));
  else if (n.kind === "exe") {
    const a = appByExe(n.target ?? n.name);
    if (a && isDesktopApp(a.id)) launch(a.id);
  }
  return true;
}

// ---------- shell clipboard (Cut / Copy / Paste between Explorer windows and the desktop) ----------

let clip: { paths: string[]; cut: boolean } | null = null;
const clipListeners = new Set<() => void>();
export const shellClipboard = {
  get: () => clip,
  set(paths: string[], cut: boolean) {
    clip = paths.length ? { paths, cut } : null;
    clipListeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    clipListeners.add(f);
    return () => clipListeners.delete(f);
  },
  /** Paste into `dir`; returns the new paths. */
  paste(dir: string): string[] {
    if (!clip) return [];
    const out: string[] = [];
    for (const p of clip.paths) {
      if (!fs.exists(p)) continue;
      try {
        out.push(clip.cut ? fs.move(p, dir) : fs.copy(p, dir));
      } catch {
        /* into itself, or a vanished source */
      }
    }
    if (clip.cut) shellClipboard.set([], false);
    return out;
  },
};

/** Drag and drop payload type for file system paths. */
export const DND_TYPE = "application/x-w8-paths";
export function readDrag(e: React.DragEvent): string[] {
  try {
    return JSON.parse(e.dataTransfer.getData(DND_TYPE) || "[]") as string[];
  } catch {
    return [];
  }
}
