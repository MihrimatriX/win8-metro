"use client";
/** The whole "operating system" state: power phase, navigation, charms, toasts, preferences and achievements. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { t, type Key } from "./i18n";
import { APPS, COLORS, PATTERNS, VISITOR_ACHIEVEMENTS, app, defaultTiles, type AppId, type IconName, type Pattern, type TileState } from "./model";
import { sound } from "./sound";
import type { Lang } from "./types";
import { projects } from "@/content/portfolio";

export type Phase = "off" | "boot" | "lock" | "login" | "welcome" | "os" | "power";
export type User = "owner" | "guest" | "recruiter";
export type View = { kind: "start" } | { kind: "apps" } | { kind: "app"; app: AppId; param?: string };
export type Charm = null | "bar" | "search" | "share" | "devices" | "settings" | "personalize" | "power";
export type Toast = { id: number; title: string; body: string; color: string; icon: IconName; at: number; action?: View };
export type PowerAction = "shutdown" | "restart" | "signout" | "sleep";

type Prefs = {
  lang: Lang;
  color: number;
  pattern: Pattern;
  lockImage: string;
  sfx: boolean;
  motion: "full" | "reduced";
  phoneTheme: "dark" | "light";
  tiles: TileState[];
};

const DEFAULT_PREFS: Prefs = {
  lang: "tr",
  color: 0,
  pattern: "waves",
  lockImage: projects[0]?.id ?? "",
  sfx: true,
  motion: "full",
  phoneTheme: "dark",
  tiles: defaultTiles(),
};

const STORE = "afu-metro:v1";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`${STORE}:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(`${STORE}:${key}`, JSON.stringify(value));
  } catch {
    /* storage can be unavailable (private mode, previews); the app just won't remember */
  }
}

/** Keep stored tiles in sync with content: new entries appear, removed ones disappear. */
function mergeTiles(stored: TileState[] | undefined): TileState[] {
  const defaults = defaultTiles();
  if (!stored?.length) return defaults;
  const known = new Set(defaults.map((d) => d.key));
  const kept = stored.filter((s) => known.has(s.key));
  const have = new Set(kept.map((k) => k.key));
  return [...kept, ...defaults.filter((d) => !have.has(d.key))];
}

type OS = Prefs & {
  t: (k: Key) => string;
  phase: Phase;
  setPhase: (p: Phase) => void;
  powerAction: PowerAction | null;
  power: (a: PowerAction) => void;
  user: User;
  signIn: (u: User) => void;
  firstRun: boolean;
  view: View;
  open: (v: View) => void;
  openApp: (id: AppId, param?: string) => void;
  closeApp: (id: AppId) => void;
  back: () => void;
  canBack: boolean;
  recent: View[];
  charm: Charm;
  setCharm: (c: Charm) => void;
  toasts: Toast[];
  notifications: Toast[];
  toast: (t: Omit<Toast, "id" | "at">) => void;
  dismissToast: (id: number) => void;
  clearNotifications: () => void;
  earned: Record<string, number>;
  earn: (id: string) => void;
  resetAchievements: () => void;
  setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
  setTiles: (fn: (tiles: TileState[]) => TileState[]) => void;
  phone: boolean;
  track: string | null;
  trackStarted: number;
  playTrack: (id: string | null) => void;
  openedProjects: Set<string>;
  readArticles: Set<string>;
  sessionStart: number;
};

const Ctx = createContext<OS | null>(null);

export function useOS() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOS outside provider");
  return c;
}

export function OSProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const [phase, setPhaseState] = useState<Phase>("boot");
  const [powerAction, setPowerAction] = useState<PowerAction | null>(null);
  const [user, setUser] = useState<User>("owner");
  const [firstRun, setFirstRun] = useState(true);
  const [stack, setStack] = useState<View[]>([{ kind: "start" }]);
  const [recent, setRecent] = useState<View[]>([]);
  const [charm, setCharmState] = useState<Charm>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<Toast[]>([]);
  const [earned, setEarned] = useState<Record<string, number>>({});
  const [phone, setPhone] = useState(false);
  const [track, setTrack] = useState<string | null>(null);
  const [trackStarted, setTrackStarted] = useState(0);
  const [sessionStart] = useState(() => Date.now());
  const openedProjects = useRef(new Set<string>());
  const readArticles = useRef(new Set<string>());
  const toastId = useRef(1);
  const earnedRef = useRef(earned);
  earnedRef.current = earned;

  // Load what this browser remembers.
  useEffect(() => {
    const stored = load<Partial<Prefs>>("prefs", {});
    const lang: Lang = stored.lang ?? (navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en");
    setPrefs({ ...DEFAULT_PREFS, ...stored, lang, tiles: mergeTiles(stored.tiles) });
    setEarned(load("earned", {}));
    setFirstRun(!load("seen", false));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) save("prefs", prefs);
  }, [prefs, ready]);

  useEffect(() => {
    sound.sfx = prefs.sfx;
  }, [prefs.sfx]);

  // Expose colors and modes to CSS.
  useEffect(() => {
    const el = document.documentElement;
    const c = COLORS[prefs.color] ?? COLORS[0];
    el.style.setProperty("--start-bg", c.bg);
    el.style.setProperty("--accent", c.accent);
    el.lang = prefs.lang;
    el.dataset.motion = prefs.motion;
    el.dataset.phoneTheme = prefs.phoneTheme;
  }, [prefs.color, prefs.lang, prefs.motion, prefs.phoneTheme]);

  // Phone layout below 700px, or a small touch screen in either orientation.
  useEffect(() => {
    const q = window.matchMedia("(max-width: 700px), (pointer: coarse) and (max-height: 500px) and (max-width: 950px)");
    const update = () => {
      setPhone(q.matches);
      document.documentElement.dataset.layout = q.matches ? "phone" : "tablet";
    };
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);

  const tr = useCallback((k: Key) => t(prefs.lang, k), [prefs.lang]);

  const toast = useCallback((input: Omit<Toast, "id" | "at">) => {
    const item: Toast = { ...input, id: toastId.current++, at: Date.now() };
    setToasts((list) => [...list.slice(-2), item]);
    setNotifications((list) => [item, ...list].slice(0, 20));
    sound.notify();
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== item.id)), 6500);
  }, []);

  const earn = useCallback(
    (id: string) => {
      if (earnedRef.current[id]) return;
      const a = VISITOR_ACHIEVEMENTS.find((x) => x.id === id);
      if (!a) return;
      const next = { ...earnedRef.current, [id]: Date.now() };
      const others = VISITOR_ACHIEVEMENTS.filter((x) => x.id !== "completionist");
      const completes = id !== "completionist" && !next.completionist && others.every((x) => next[x.id]);
      earnedRef.current = next;
      setEarned(next);
      save("earned", next);
      toast({
        title: t(prefs.lang, "ach.unlocked"),
        body: `${a.name[prefs.lang]} · ${a.points}G`,
        color: app("achievements").color,
        icon: "achievements",
        action: { kind: "app", app: "achievements" },
      });
      if (completes) window.setTimeout(() => earn("completionist"), 1600);
    },
    [prefs.lang, toast],
  );

  const resetAchievements = useCallback(() => {
    earnedRef.current = {};
    setEarned({});
    save("earned", {});
  }, []);

  const setPhase = useCallback((p: Phase) => {
    setPhaseState(p);
    if (p !== "os") setCharmState(null);
  }, []);

  const signIn = useCallback(
    (u: User) => {
      setUser(u);
      sound.login();
      setStack(u === "recruiter" ? [{ kind: "start" }, { kind: "app", app: "profile" }] : [{ kind: "start" }]);
      setPhase("welcome");
    },
    [setPhase],
  );

  const power = useCallback(
    (a: PowerAction) => {
      setCharmState(null);
      sound.playTrack(null);
      setTrack(null);
      if (a === "sleep") {
        setPhase("lock");
        return;
      }
      setPowerAction(a);
      setPhase("power");
      sound.shutdown();
      window.setTimeout(
        () => {
          setPowerAction(null);
          if (a === "shutdown") setPhase("off");
          else if (a === "restart") setPhase("boot");
          else setPhase("lock");
          setStack([{ kind: "start" }]);
          setRecent([]);
        },
        a === "signout" ? 1600 : 2600,
      );
    },
    [setPhase],
  );

  const open = useCallback(
    (v: View) => {
      setCharmState(null);
      if (v.kind === "app") {
        if (v.app === "projects" && v.param) {
          openedProjects.current.add(v.param);
          if (openedProjects.current.size >= 3) earn("explorer");
        }
        if (v.app === "reader" && v.param) {
          readArticles.current.add(v.param);
          if (readArticles.current.size >= 2) earn("bookworm");
        }
        if (v.app === "desktop") earn("desktop");
        setRecent((r) => [v, ...r.filter((x) => !(x.kind === "app" && x.app === v.app))].slice(0, 6));
      }
      setStack((s) => {
        const top = s[s.length - 1];
        if (JSON.stringify(top) === JSON.stringify(v)) return s;
        if (v.kind === "start") return [{ kind: "start" }];
        return [...s, v];
      });
    },
    [earn],
  );

  const openApp = useCallback((id: AppId, param?: string) => open({ kind: "app", app: id, param }), [open]);

  /** Really close an app (drag from the top, or the title bar's X): it leaves the switcher too, not just the back stack. */
  const closeApp = useCallback((id: AppId) => {
    setRecent((r) => r.filter((x) => !(x.kind === "app" && x.app === id)));
    setStack([{ kind: "start" }]);
    setCharmState(null);
  }, []);

  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    sound.back();
  }, []);

  const setCharm = useCallback(
    (c: Charm) => {
      setCharmState(c);
      if (c) earn("charms");
    },
    [earn],
  );

  const setPref = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [k]: v }));
    if (k === "color" || k === "pattern") earn("painter");
  }, [earn]);

  const setTiles = useCallback((fn: (tiles: TileState[]) => TileState[]) => setPrefs((p) => ({ ...p, tiles: fn(p.tiles) })), []);

  const playTrack = useCallback(
    (id: string | null) => {
      sound.playTrack(id);
      setTrack(id);
      setTrackStarted(Date.now());
      if (id) earn("dj");
    },
    [earn],
  );

  // Mark the first-run "Hi" sequence as seen once someone reaches Start.
  useEffect(() => {
    if (phase === "os" && firstRun) {
      save("seen", true);
      setFirstRun(false);
    }
  }, [phase, firstRun]);

  const value = useMemo<OS>(
    () => ({
      ...prefs,
      t: tr,
      phase,
      setPhase,
      powerAction,
      power,
      user,
      signIn,
      firstRun,
      view: stack[stack.length - 1],
      open,
      openApp,
      closeApp,
      back,
      canBack: stack.length > 1,
      recent,
      charm,
      setCharm,
      toasts,
      notifications,
      toast,
      dismissToast: (id) => setToasts((l) => l.filter((x) => x.id !== id)),
      clearNotifications: () => setNotifications([]),
      earned,
      earn,
      resetAchievements,
      setPref,
      setTiles,
      phone,
      track,
      trackStarted,
      playTrack,
      openedProjects: openedProjects.current,
      readArticles: readArticles.current,
      sessionStart,
    }),
    [prefs, tr, phase, setPhase, powerAction, power, user, signIn, firstRun, stack, open, openApp, closeApp, back, recent, charm, setCharm, toasts, notifications, toast, earned, earn, resetAchievements, setPref, setTiles, phone, track, trackStarted, playTrack, sessionStart],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Re-render every `ms` (clocks, live tiles). */
export function useTick(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Open an external link, or say it isn't there yet. */
export function useOpenLink() {
  const { toast, t: tr } = useOS();
  return (url: string | undefined) => {
    if (!url || url === "#") {
      sound.error();
      toast({ title: tr("placeholderLink"), body: "content/portfolio.ts", color: "#555", icon: "link" });
      return;
    }
    if (url.startsWith("mailto:")) window.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  };
}

export const ALL_APPS = APPS;
export const ALL_PATTERNS = PATTERNS;
