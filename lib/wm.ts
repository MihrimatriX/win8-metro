/**
 * Desktop window manager: the open windows, their stacking order and focus.
 * Lives outside React (an external store) so the windows survive trips to Start, and so
 * dragging one window doesn't re-render the whole OS.
 */
import { useSyncExternalStore } from "react";
import type { DesktopAppId } from "./model";

export type Snap = "left" | "right";
/** Desktop programs, plus "dialog" for message boxes and file pickers owned by another window. */
export type WinApp = DesktopAppId | "dialog";

export type Win = {
  id: string;
  app: WinApp;
  /** What the window opened (a path, a URL, a Control Panel page…). */
  arg?: string;
  /** Title set by the app (falls back to the app name). */
  title?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  max: boolean;
  min: boolean;
  snap?: Snap;
  /** Fixed-size dialogs (Run, About, message boxes). */
  fixed?: boolean;
  /** Modal owner: the owner can't be used while this window is open. */
  owner?: string;
  /** Monotonic open order, for the taskbar. */
  seq: number;
};

export type LaunchOpts = {
  arg?: string;
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  fixed?: boolean;
  owner?: string;
  max?: boolean;
  title?: string;
};

type State = { wins: Win[]; order: string[]; focus: string | null };

let state: State = { wins: [], order: [], focus: null };
let seq = 1;
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

/** Default window sizes per app. */
const SIZES: Partial<Record<WinApp, [number, number]>> = {
  explorer: [880, 540],
  ie: [1000, 640],
  notepad: [640, 460],
  wordpad: [820, 560],
  paint: [1100, 640],
  calc: [228, 322],
  cmd: [680, 400],
  taskmgr: [560, 520],
  control: [860, 560],
  minesweeper: [300, 380],
  run: [400, 196],
  winver: [470, 380],
};
const FIXED = new Set<WinApp>(["calc", "run", "winver", "minesweeper", "dialog"]);
/** Apps that bring their existing window forward instead of opening a second one. */
const SINGLE = new Set<WinApp>(["taskmgr", "run", "winver", "calc", "minesweeper"]);

export const TASKBAR_H = 40;

/** Close guards: an app can ask before its window closes ("Save changes to Untitled?"). Resolve true to close. */
const guards = new Map<string, () => boolean | Promise<boolean>>();

export const wm = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get state() {
    return state;
  },
  get(id: string) {
    return state.wins.find((w) => w.id === id);
  },
  /** Open an app window (or bring a single-instance one forward). Returns the window id. */
  launch(app: WinApp, opts: LaunchOpts = {}): string {
    if (SINGLE.has(app) && !opts.owner) {
      const existing = state.wins.find((w) => w.app === app);
      if (existing) {
        wm.focus(existing.id);
        if (opts.arg !== undefined) wm.patch(existing.id, { arg: opts.arg });
        return existing.id;
      }
    }
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = (typeof window !== "undefined" ? window.innerHeight : 800) - TASKBAR_H;
    const [dw, dh] = SIZES[app] ?? [720, 480];
    const w = Math.min(opts.w ?? dw, vw - 20);
    const h = Math.min(opts.h ?? dh, vh - 20);
    const cascade = (state.wins.filter((x) => !x.owner).length % 8) * 26;
    const owner = opts.owner ? state.wins.find((x) => x.id === opts.owner) : undefined;
    const x = opts.x ?? (owner ? owner.x + (owner.w - w) / 2 : Math.max(8, Math.round((vw - w) / 2 - 90 + cascade)));
    const y =
      opts.y ??
      (owner ? owner.y + Math.max(30, (owner.h - h) / 3) : Math.max(8, Math.round((vh - h) / 2 - 50 + cascade)));
    const id = `${app}-${seq}`;
    const win: Win = {
      id,
      app,
      arg: opts.arg,
      title: opts.title,
      x: Math.round(Math.max(0, Math.min(x, vw - w))),
      y: Math.round(Math.max(0, Math.min(y, vh - h))),
      w,
      h,
      max: !!opts.max,
      min: false,
      fixed: opts.fixed ?? FIXED.has(app),
      owner: opts.owner,
      seq: seq++,
    };
    set({ wins: [...state.wins, win], order: [...state.order.filter((o) => o !== id), id], focus: id });
    return id;
  },
  /** Register (or clear with null) the close guard for a window. */
  guard(id: string, fn: (() => boolean | Promise<boolean>) | null) {
    if (fn) guards.set(id, fn);
    else guards.delete(id);
  },
  /** Close as the user asked (X button, taskbar, End task): runs the app's close guard first. */
  async requestClose(id: string) {
    const g = guards.get(id);
    if (g) {
      wm.focus(id);
      const ok = await g();
      if (!ok) return false;
    }
    wm.close(id);
    return true;
  },
  /** Close right away, skipping guards (the app itself, sign out, End task with force). */
  close(id: string) {
    guards.delete(id);
    // Closing a window closes the dialogs it owns.
    const doomed = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const w of state.wins)
        if (w.owner && doomed.has(w.owner) && !doomed.has(w.id)) {
          doomed.add(w.id);
          grew = true;
        }
    }
    const wins = state.wins.filter((w) => !doomed.has(w.id));
    const order = state.order.filter((o) => !doomed.has(o));
    const visible = order.filter((o) => !wins.find((w) => w.id === o)?.min);
    set({ wins, order, focus: doomed.has(state.focus ?? "") ? (visible[visible.length - 1] ?? null) : state.focus });
  },
  focus(id: string | null) {
    if (!id) return set({ focus: null });
    // A window with an open modal dialog hands focus to the dialog.
    const modal = state.wins.find((w) => w.owner === id);
    const target = modal ? modal.id : id;
    const raise = [target];
    const owner = state.wins.find((w) => w.id === target)?.owner;
    if (owner) raise.unshift(owner);
    set({
      wins: state.wins.map((w) => (raise.includes(w.id) && w.min ? { ...w, min: false } : w)),
      order: [...state.order.filter((o) => !raise.includes(o)), ...raise],
      focus: target,
    });
  },
  patch(id: string, p: Partial<Win>) {
    set({ wins: state.wins.map((w) => (w.id === id ? { ...w, ...p } : w)) });
  },
  setTitle(id: string, title: string) {
    const w = state.wins.find((x) => x.id === id);
    if (w && w.title !== title) wm.patch(id, { title });
  },
  minimize(id: string) {
    const ids = new Set([id, ...state.wins.filter((w) => w.owner === id).map((w) => w.id)]);
    const wins = state.wins.map((w) => (ids.has(w.id) ? { ...w, min: true } : w));
    const visible = state.order.filter((o) => !wins.find((w) => w.id === o)?.min);
    set({ wins, focus: visible[visible.length - 1] ?? null });
  },
  toggleMax(id: string) {
    const w = state.wins.find((x) => x.id === id);
    if (!w || w.fixed) return;
    wm.patch(id, w.max || w.snap ? { max: false, snap: undefined } : { max: true });
  },
  /** Taskbar button: focus, or minimize when it's already the active window. */
  toggle(id: string) {
    const w = state.wins.find((x) => x.id === id);
    if (!w) return;
    if (state.focus === id && !w.min) wm.minimize(id);
    else wm.focus(id);
  },
  /** Show desktop: minimize everything (or restore if all are minimized). */
  showDesktop() {
    const all = state.wins.every((w) => w.min);
    set({
      wins: state.wins.map((w) => ({ ...w, min: !all })),
      focus: all ? (state.order[state.order.length - 1] ?? null) : null,
    });
  },
  closeAll() {
    guards.clear();
    set({ wins: [], order: [], focus: null });
  },
};

/** Subscribe to the window list (re-renders on any change). */
export function useWM(): State {
  return useSyncExternalStore(
    wm.subscribe,
    () => state,
    () => state,
  );
}

/** Subscribe to a single window. */
export function useWin(id: string): Win | undefined {
  return useSyncExternalStore(
    wm.subscribe,
    () => state.wins.find((w) => w.id === id),
    () => undefined,
  );
}
