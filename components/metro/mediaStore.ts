/**
 * Session media shared by Camera, Sound Recorder and Video: recordings live in memory as object URLs
 * (big blobs never go to localStorage), so they survive closing and reopening an app until the page reloads.
 */
import { useSyncExternalStore } from "react";

export type MediaKind = "photo" | "video" | "audio";
export type MediaSource = "camera" | "recorder" | "user";

export type SessionMedia = {
  id: string;
  kind: MediaKind;
  source: MediaSource;
  name: string;
  /** Object URL (or data URL) to play / show. */
  url: string;
  blob?: Blob;
  /** A small still for lists (data URL). */
  poster?: string;
  created: number;
  /** Milliseconds, measured while recording (MediaRecorder blobs often report Infinity). */
  duration?: number;
  /** VFS path when the item is also stored on disk. */
  path?: string;
};

let items: SessionMedia[] = [];
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export const mediaStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  all: () => items,
  add(m: Omit<SessionMedia, "id"> & { id?: string }): SessionMedia {
    const item = { ...m, id: m.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` };
    items = [item, ...items];
    emit();
    return item;
  },
  update(id: string, patch: Partial<SessionMedia>) {
    items = items.map((x) => (x.id === id ? { ...x, ...patch } : x));
    emit();
  },
  remove(id: string) {
    const it = items.find((x) => x.id === id);
    if (it?.url.startsWith("blob:")) URL.revokeObjectURL(it.url);
    items = items.filter((x) => x.id !== id);
    emit();
  },
};

/** Re-render when session media changes; returns the filtered list (newest first). */
export function useSessionMedia(filter: (m: SessionMedia) => boolean) {
  useSyncExternalStore(
    mediaStore.subscribe,
    () => version,
    () => 0,
  );
  return items.filter(filter);
}

// ---------- helpers ----------

const p2 = (n: number) => String(n).padStart(2, "0");

/** "20261002_112233", the stamp Windows puts in camera file names. */
export function fileStamp(d = new Date()) {
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

/** "00:01:05" (hours always shown, like the recorders). */
export function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
}

/** "1:05" or "1:02:05" (player style). */
export function clock(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${p2(m)}:${p2(s % 60)}` : `${m}:${p2(s % 60)}`;
}

/** The best container MediaRecorder supports here, or "" to let the browser choose. */
export function recorderMime(kind: "audio" | "video"): string {
  if (typeof MediaRecorder === "undefined") return "";
  const list =
    kind === "audio"
      ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
      : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

/** File extension for a recorded blob's MIME type. */
export function mimeExt(mime: string, fallback: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return fallback === "m4a" ? "m4a" : "mp4";
  if (mime.includes("ogg")) return "ogg";
  return fallback;
}

export function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

/** Save a URL to the user's real Downloads folder. */
export function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Why getUserMedia failed, in the two cases the Win8 apps tell apart. */
export function mediaError(e: unknown): "denied" | "missing" {
  const name = e instanceof DOMException ? e.name : "";
  return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "missing";
}

/** Stop every track of a stream (releases the camera light / mic indicator). */
export function stopStream(s: MediaStream | null | undefined) {
  s?.getTracks().forEach((t) => t.stop());
}
