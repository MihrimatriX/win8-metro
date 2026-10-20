"use client";
/**
 * Task Manager (Görev Yöneticisi) as in Windows 8.1: the compact "Fewer details" list of running apps, and the
 * full view with Processes, Performance, App history, Startup, Users, Details and Services.
 * Running apps are the real desktop windows and open Store apps; everything else is simulated. Usage figures come
 * from smooth noise over time, so the 60-second graphs are derived from the clock instead of stored.
 *
 * Also exports the process list the Command Prompt uses for tasklist / taskkill.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useOS, useTick, type View } from "@/lib/os";
import { USER } from "@/lib/fs";
import { wm, useWM, type Win } from "@/lib/wm";
import { APPS, app as appDef, type AppId } from "@/lib/model";
import { AppIcon } from "../../icons/AppIcon";
import { ShellIcon } from "../../icons/ShellIcons";
import { Btn, ContextMenu, MenuBar, useWindow, useWinKeys, type MenuItem } from "../ui";
import "./taskmgr.css";

// =====================================================================================================
// Process model (shared with cmd.exe)
// =====================================================================================================

export type Proc = {
  key: string;
  /** Display name (Processes tab) and description (Details tab). */
  name: string;
  exe: string;
  pid: number;
  group: "app" | "bg" | "win";
  user: string;
  /** Working set in MB, and a CPU weight. */
  mem: number;
  w: number;
  /** The desktop window or Store app behind an app process. */
  win?: string;
  app?: AppId;
  title?: string;
  metro?: AppId;
  suspended?: boolean;
};

export const HOST = `${USER.toUpperCase()}-PC`;
export const IPV4 = "192.168.1.34";
export const IPV6 = "fe80::4c1a:2b3e:9d10:7f21%3";

const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
/** PIDs are multiples of 4, stable for a window's lifetime. */
const pidFor = (key: string) => 3000 + (hash(key) % 1500) * 4;

// exe, pid, user, group, MB, CPU weight, English name, Turkish name
const SYSTEM: [string, number, string, Proc["group"], number, number, string, string][] = [
  ["System Idle Process", 0, "SYSTEM", "win", 0, 0, "System Idle Process", "Sistem Boşta İşlemi"],
  ["System", 4, "SYSTEM", "win", 0.1, 1, "System", "Sistem"],
  ["smss.exe", 312, "SYSTEM", "win", 0.3, 0, "Windows Session Manager", "Windows Oturum Yöneticisi"],
  [
    "csrss.exe",
    428,
    "SYSTEM",
    "win",
    1.1,
    0.2,
    "Client Server Runtime Process",
    "İstemci Sunucu Çalışma Zamanı İşlemi",
  ],
  ["wininit.exe", 504, "SYSTEM", "win", 0.8, 0, "Windows Start-Up Application", "Windows Başlangıç Uygulaması"],
  [
    "csrss.exe",
    512,
    "SYSTEM",
    "win",
    1.6,
    0.4,
    "Client Server Runtime Process",
    "İstemci Sunucu Çalışma Zamanı İşlemi",
  ],
  ["winlogon.exe", 568, "SYSTEM", "win", 1.2, 0, "Windows Logon Application", "Windows Oturum Açma Uygulaması"],
  [
    "services.exe",
    600,
    "SYSTEM",
    "win",
    3.4,
    0.1,
    "Services and Controller app",
    "Hizmetler ve Denetleyici uygulaması",
  ],
  ["lsass.exe", 612, "SYSTEM", "win", 4.9, 0.1, "Local Security Authority Process", "Yerel Güvenlik Yetkilisi İşlemi"],
  [
    "svchost.exe",
    700,
    "SYSTEM",
    "win",
    5.1,
    0.2,
    "Service Host: DCOM Server Process Launcher",
    "Hizmet Ana Bilgisayarı: DCOM Sunucu İşlem Başlatıcısı",
  ],
  [
    "svchost.exe",
    748,
    "NETWORK SERVICE",
    "win",
    4.2,
    0.1,
    "Service Host: Remote Procedure Call",
    "Hizmet Ana Bilgisayarı: Uzak Yordam Çağrısı",
  ],
  ["dwm.exe", 832, "DWM-1", "win", 28.4, 1.4, "Desktop Window Manager", "Masaüstü Pencere Yöneticisi"],
  [
    "svchost.exe",
    876,
    "LOCAL SERVICE",
    "win",
    12.6,
    0.3,
    "Service Host: Local Service (Network Restricted)",
    "Hizmet Ana Bilgisayarı: Yerel Hizmet (Ağ Kısıtlı)",
  ],
  [
    "svchost.exe",
    904,
    "SYSTEM",
    "win",
    38.2,
    0.6,
    "Service Host: Local System (Network Restricted)",
    "Hizmet Ana Bilgisayarı: Yerel Sistem (Ağ Kısıtlı)",
  ],
  [
    "svchost.exe",
    948,
    "SYSTEM",
    "win",
    21.7,
    0.4,
    "Service Host: Local System",
    "Hizmet Ana Bilgisayarı: Yerel Sistem",
  ],
  [
    "svchost.exe",
    1012,
    "LOCAL SERVICE",
    "win",
    8.3,
    0.2,
    "Service Host: Local Service",
    "Hizmet Ana Bilgisayarı: Yerel Hizmet",
  ],
  [
    "svchost.exe",
    1100,
    "NETWORK SERVICE",
    "win",
    9.8,
    0.2,
    "Service Host: Network Service",
    "Hizmet Ana Bilgisayarı: Ağ Hizmeti",
  ],
  ["spoolsv.exe", 1320, "SYSTEM", "bg", 4.1, 0, "Spooler SubSystem App", "Biriktirici Alt Sistem Uygulaması"],
  [
    "MsMpEng.exe",
    1488,
    "SYSTEM",
    "bg",
    61.3,
    0.8,
    "Antimalware Service Executable",
    "Kötü Amaçlı Yazılımdan Koruma Hizmeti Yürütülebilir Dosyası",
  ],
  [
    "SearchIndexer.exe",
    1876,
    "SYSTEM",
    "bg",
    14.2,
    0.3,
    "Microsoft Windows Search Indexer",
    "Microsoft Windows Arama Dizin Oluşturucusu",
  ],
  [
    "taskhostex.exe",
    2412,
    USER,
    "win",
    5.6,
    0.1,
    "Host Process for Windows Tasks",
    "Windows Görevleri İçin Ana Bilgisayar İşlemi",
  ],
  ["explorer.exe", 2468, USER, "win", 46.8, 0.6, "Windows Explorer", "Windows Gezgini"],
  ["RuntimeBroker.exe", 2740, USER, "bg", 6.2, 0.1, "Runtime Broker", "Çalışma Zamanı Aracısı"],
  ["dllhost.exe", 3184, USER, "bg", 2.9, 0, "COM Surrogate", "COM Vekili"],
];

/** Working set (MB) and CPU weight per desktop program. */
const APP_LOAD: Partial<Record<AppId, [number, number]>> = {
  ie: [86.2, 2],
  explorer: [38.4, 0.6],
  notepad: [3.2, 0.05],
  wordpad: [9.4, 0.1],
  paint: [19.8, 0.3],
  calc: [6.9, 0.05],
  cmd: [2.4, 0.05],
  taskmgr: [11.6, 1.2],
  control: [24.1, 0.2],
  minesweeper: [13.5, 0.2],
  winver: [3.8, 0],
};
const METRO_EXE: Partial<Record<AppId, string>> = {
  mail: "livecomm.exe",
  calendar: "livecomm.exe",
  profile: "livecomm.exe",
  settings: "SystemSettings.exe",
  music: "Music.UI.exe",
  video: "Video.UI.exe",
};

/** Store apps that are open (in the switcher), from the OS navigation history. */
export const metroApps = (recent: View[]): AppId[] =>
  recent.flatMap((v) => (v.kind === "app" && v.app !== "desktop" ? [v.app] : []));

/** Every process: Store apps and desktop windows, then the background and Windows processes. */
export function listProcs(wins: Win[], metro: AppId[], view: View, name: (id: AppId) => string, tr: boolean): Proc[] {
  const desk: Proc[] = wins
    .filter((w) => w.app !== "dialog" && w.app !== "run" && !w.owner)
    .map((w) => {
      const id = w.app as AppId;
      const [mem, cpu] = APP_LOAD[id] ?? [10, 0.2];
      return {
        key: w.id,
        name: name(id),
        exe: appDef(id).exe ?? `${id}.exe`,
        pid: pidFor(w.id),
        group: "app",
        user: USER,
        mem,
        w: cpu,
        win: w.id,
        app: id,
        title: w.title ?? name(id),
      };
    });
  const store: Proc[] = metro.map((id) => ({
    key: `metro:${id}`,
    name: name(id),
    exe: METRO_EXE[id] ?? "WWAHost.exe",
    pid: pidFor(id),
    group: "app",
    user: USER,
    mem: 24 + (hash(id) % 40),
    w: 0.4,
    metro: id,
    title: name(id),
    // Store apps in the background are suspended, like Windows 8 does to save power.
    suspended: !(view.kind === "app" && view.app === id),
  }));
  const sys: Proc[] = SYSTEM.map(([exe, pid, user, group, mem, w, en, trName]) => ({
    key: `sys:${pid}`,
    name: tr ? trName : en,
    exe,
    pid,
    group,
    user,
    mem,
    w,
  }));
  return [...store, ...desk, ...sys];
}

/** End an app process: close its window (or force it) or close the Store app. False for processes we can't end. */
export function endProc(p: Proc, closeApp: (id: AppId) => void, force = false): boolean {
  if (p.win) {
    if (force) wm.close(p.win);
    else void wm.requestClose(p.win);
    return true;
  }
  if (p.metro) {
    closeApp(p.metro);
    return true;
  }
  return false;
}

// =====================================================================================================
// Simulated usage
// =====================================================================================================

/** Smooth value noise in [0, 1]: the same time always gives the same value. */
function noise(x: number, seed = 0) {
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
const cpuAt = (s: number) =>
  Math.min(100, 3 + noise(s / 3) * 12 + noise(s / 11, 1) * 9 + (noise(s, 2) > 0.9 ? 24 * noise(s * 2, 3) : 0));
const diskAt = (s: number) => Math.min(100, noise(s / 2, 4) ** 4 * 35);
const sendAt = (s: number) => noise(s / 1.5, 5) ** 3 * 120 + 2;
const recvAt = (s: number) => noise(s / 1.2, 6) ** 3 * 380 + 6;

const STARTUP: [string, string, boolean, string][] = [
  ["Adobe Reader and Acrobat Manager", "Adobe Systems Incorporated", true, "low"],
  ["Java Update Scheduler", "Oracle Corporation", true, "low"],
  ["Realtek HD Audio Manager", "Realtek Semiconductor", true, "medium"],
  ["Skype", "Skype Technologies S.A.", false, "high"],
  ["Steam Client Bootstrapper", "Valve Corporation", true, "high"],
  ["Windows Defender notification icon", "Microsoft Corporation", true, "low"],
];

// name, PID of its host, English, Turkish, running, group
const SERVICES: [string, number, string, string, boolean, string][] = [
  [
    "AudioEndpointBuilder",
    904,
    "Windows Audio Endpoint Builder",
    "Windows Ses Uç Noktası Oluşturucusu",
    true,
    "LocalSystemNetworkRestricted",
  ],
  ["Audiosrv", 876, "Windows Audio", "Windows Ses", true, "LocalServiceNetworkRestricted"],
  ["BFE", 1012, "Base Filtering Engine", "Temel Filtre Altyapısı", true, "LocalServiceNoNetwork"],
  ["BITS", 0, "Background Intelligent Transfer Service", "Arka Plan Akıllı Aktarım Hizmeti", false, "netsvcs"],
  ["CryptSvc", 1100, "Cryptographic Services", "Şifreleme Hizmetleri", true, "NetworkService"],
  ["DcomLaunch", 700, "DCOM Server Process Launcher", "DCOM Sunucu İşlem Başlatıcısı", true, "DcomLaunch"],
  ["Dhcp", 876, "DHCP Client", "DHCP İstemcisi", true, "LocalServiceNetworkRestricted"],
  ["Dnscache", 1100, "DNS Client", "DNS İstemcisi", true, "NetworkService"],
  ["EventLog", 876, "Windows Event Log", "Windows Olay Günlüğü", true, "LocalServiceNetworkRestricted"],
  ["Fax", 0, "Fax", "Faks", false, ""],
  ["MpsSvc", 1012, "Windows Firewall", "Windows Güvenlik Duvarı", true, "LocalServiceNoNetwork"],
  ["RpcSs", 748, "Remote Procedure Call (RPC)", "Uzak Yordam Çağrısı (RPC)", true, "rpcss"],
  ["Spooler", 1320, "Print Spooler", "Yazdırma Biriktiricisi", true, ""],
  ["Themes", 948, "Themes", "Temalar", true, "netsvcs"],
  ["TrustedInstaller", 0, "Windows Modules Installer", "Windows Modül Yükleyicisi", false, ""],
  ["W32Time", 0, "Windows Time", "Windows Saati", false, "LocalService"],
  ["WinDefend", 1488, "Windows Defender Service", "Windows Defender Hizmeti", true, ""],
  ["WSearch", 1876, "Windows Search", "Windows Arama", true, ""],
  ["wuauserv", 948, "Windows Update", "Windows Update", true, "netsvcs"],
];

// =====================================================================================================
// Pieces
// =====================================================================================================

/** Heat-map cell color: pale yellow when idle, orange when busy. */
function heat(f: number) {
  const t = Math.max(0, Math.min(1, f));
  return `rgb(255 ${Math.round(244 - 84 * t)} ${Math.round(196 - 156 * t)})`;
}

function ProcIcon({ p }: { p: Proc }) {
  if (p.metro)
    return (
      <span className="tm-tile" style={{ background: appDef(p.metro).color }}>
        <AppIcon id={p.metro} size={12} />
      </span>
    );
  if (p.app) return <AppIcon id={p.app} size={16} />;
  return <ShellIcon name={p.group === "win" ? "windows" : "file-exe"} size={16} />;
}

type Col = { label: ReactNode; num?: boolean; w?: number; heat?: number };
type Row = { id: string; cells: ReactNode[]; vals: (string | number)[]; heat?: (number | null)[]; group?: string };

/** A sortable list view (click a header to sort, again to reverse), optionally grouped like the Processes tab. */
function Table({
  cols,
  rows,
  groups,
  sel,
  onSel,
  onOpen,
  onMenu,
}: {
  cols: Col[];
  rows: Row[];
  groups?: { id: string; label: string }[];
  sel: string | null;
  onSel: (id: string) => void;
  onOpen?: (id: string) => void;
  onMenu?: (e: React.MouseEvent, id: string) => void;
}) {
  const [sort, setSort] = useState<{ i: number; desc: boolean } | null>(null);
  const sorted = sort
    ? [...rows].sort((a, b) => {
        const x = a.vals[sort.i];
        const y = b.vals[sort.i];
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "tr");
        return sort.desc ? -c : c;
      })
    : rows;
  const line = (r: Row) => (
    <tr
      key={r.id}
      className={r.id === sel ? "on" : ""}
      onPointerDown={() => onSel(r.id)}
      onDoubleClick={() => onOpen?.(r.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSel(r.id);
        onMenu?.(e, r.id);
      }}
    >
      {r.cells.map((c, i) => (
        <td
          key={i}
          className={cols[i].num ? "num" : ""}
          style={r.heat?.[i] != null ? ({ "--heat": heat(r.heat[i]!) } as React.CSSProperties) : undefined}
        >
          {c}
        </td>
      ))}
    </tr>
  );
  return (
    <div className="tm-grid">
      <table>
        <colgroup>
          {cols.map((c, i) => (
            <col key={i} style={{ width: c.w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={i}
                className={c.num ? "num" : ""}
                style={c.heat !== undefined ? { background: heat(c.heat) } : undefined}
                onClick={() => setSort((s) => (s?.i === i ? { i, desc: !s.desc } : { i, desc: !!c.num }))}
              >
                {sort?.i === i && (
                  <svg className="tm-caret" width="7" height="4" viewBox="0 0 7 4">
                    <path d={sort.desc ? "M0 0l3.5 4L7 0" : "M0 4l3.5-4L7 4"} fill="none" stroke="currentColor" />
                  </svg>
                )}
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups
            ? groups.map((g) => {
                const rs = sorted.filter((r) => r.group === g.id);
                if (!rs.length) return null;
                return [
                  <tr key={g.id} className="tm-group">
                    <td colSpan={cols.length}>
                      {g.label} ({rs.length})
                    </td>
                  </tr>,
                  ...rs.map(line),
                ];
              })
            : sorted.map(line)}
        </tbody>
      </table>
    </div>
  );
}

/** A usage graph: 60 samples (fractions of the maximum), grid lines that scroll with time like the real one. */
function Graph({ vals, color, k, mini }: { vals: number[]; color: string; k: number; mini?: boolean }) {
  const W = 600;
  const H = 300;
  const pts = vals.map((v, i) => `${(i * W) / (vals.length - 1)},${H - Math.max(0, Math.min(1, v)) * H}`).join(" ");
  const shift = (k % 3) * 10;
  return (
    <svg
      className={mini ? "tm-spark" : "tm-graph"}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ borderColor: color }}
    >
      {!mini && (
        <g stroke={color} strokeOpacity={0.16} vectorEffect="non-scaling-stroke">
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`h${i}`} x1={0} x2={W} y1={(i + 1) * 30} y2={(i + 1) * 30} vectorEffect="non-scaling-stroke" />
          ))}
          {Array.from({ length: 21 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={i * 30 - shift}
              x2={i * 30 - shift}
              y1={0}
              y2={H}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      )}
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={color} fillOpacity={0.1} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor">
      <circle cx="8.5" cy="8.5" r="7.5" />
      <path d={up ? "M5 10l3.5-3.5L12 10" : "M5 7l3.5 3.5L12 7"} />
    </svg>
  );
}

// =====================================================================================================
// Task Manager
// =====================================================================================================

type Tab = "proc" | "perf" | "hist" | "start" | "users" | "details" | "services";
type Prefs = { more: boolean; tab: Tab; speed: number; top: boolean; minUse: boolean; hide: boolean; group: boolean };
const PREFS_KEY = "afu-metro:v2:taskmgr";
const DEFAULTS: Prefs = { more: false, tab: "proc", speed: 1000, top: false, minUse: true, hide: false, group: true };
function loadPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export default function TaskMgrApp() {
  const { id, close, minimize } = useWindow();
  const { lang, t, recent, view, open, closeApp, sessionStart } = useOS();
  const tr = lang === "tr";
  const { wins } = useWM();
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [sel, setSel] = useState<string | null>(null);
  const [perf, setPerf] = useState<"cpu" | "mem" | "disk" | "net">("cpu");
  const [startup, setStartup] = useState(() => Object.fromEntries(STARTUP.map(([n, , on]) => [n, on])));
  const [killed, setKilled] = useState<string[]>([]);
  const [histCleared, setHistCleared] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [manual, setManual] = useState(0);
  // Paused still ticks, just never in practice.
  const tick = useTick(prefs.speed || 2 ** 30);
  const ms = prefs.speed || 1000;
  const k = Math.floor(Math.max(tick, manual) / ms);
  const s = (k * ms) / 1000;

  const setPrefs = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefsState(next);
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* not remembered */
    }
  };

  // The compact view is a small window; More details grows it back, like the real one.
  useEffect(() => {
    const w = wm.get(id);
    if (!w || w.max) return;
    const size = prefs.more
      ? {
          w: Math.min(window.innerWidth - 20, Math.max(w.w, 560)),
          h: Math.min(window.innerHeight - 60, Math.max(w.h, 520)),
        }
      : { w: 330, h: 340 };
    wm.patch(id, size);
  }, [id, prefs.more]);

  const nf = (n: number, d = 1) =>
    n.toLocaleString(tr ? "tr-TR" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v: number) => (v < 0.05 ? "0%" : `${nf(v)}%`);

  // ---- processes and their usage right now ----
  const procs = listProcs(wins, metroApps(recent), view, (a) => t(appDef(a).title), tr).filter(
    (p) => !killed.includes(p.key),
  );
  const cores = navigator.hardwareConcurrency || 4;
  const totalMB = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) * 1024;
  const cpu = cpuAt(s);
  const weights = procs.map((p) => (p.suspended || !p.w ? 0 : p.w * (0.2 + noise(s / 2, p.pid))));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const disk = diskAt(s);
  const usage = new Map(
    procs.map((p, i) => [
      p.key,
      {
        cpu: p.pid === 0 ? 100 - cpu : (cpu * weights[i]) / wsum,
        mem: p.mem * (1 + 0.04 * noise(s / 10, p.pid)),
        disk: p.w >= 0.3 && !p.suspended ? (disk / 100) * 2.4 * noise(s, p.pid + 7) : 0,
        net:
          /iexplore|svchost|livecomm|WWAHost|MsMpEng/.test(p.exe) && !p.suspended
            ? (recvAt(s) / 1000) * noise(s, p.pid + 9)
            : 0,
      },
    ]),
  );
  const use = (p: Proc) => usage.get(p.key)!;
  const usedMB = 2100 + procs.reduce((a, p) => a + use(p).mem, 0);
  const memPct = (usedMB / totalMB) * 100;
  const diskTotal = procs.reduce((a, p) => a + use(p).disk, 0);
  const netTotal = procs.reduce((a, p) => a + use(p).net, 0);
  const find = (key: string | null) => procs.find((p) => p.key === key);

  // ---- actions ----
  const switchTo = (p: Proc) => {
    if (p.win) wm.focus(p.win);
    else if (p.metro) open({ kind: "app", app: p.metro });
    if (prefs.minUse) minimize();
  };
  const end = (key: string | null) => {
    const p = find(key);
    if (!p || p.group === "win") return;
    if (!endProc(p, closeApp)) setKilled((x) => [...x, p.key]);
    setSel(null);
  };
  const canEnd = !!find(sel) && find(sel)!.group !== "win";
  const procMenu = (e: React.MouseEvent, key: string, details = false) => {
    const p = find(key);
    if (!p) return;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...(p.group === "app"
          ? [{ label: tr ? "Geçiş yap" : "Switch to", bold: true, onClick: () => switchTo(p) }]
          : []),
        { label: tr ? "Görevi sonlandır" : "End task", disabled: p.group === "win", onClick: () => end(key) },
        ...(details
          ? []
          : [
              { sep: true as const },
              { label: tr ? "Ayrıntılara git" : "Go to details", onClick: () => setPrefs({ tab: "details" }) },
            ]),
      ],
    });
  };
  // Refresh now: take the next sample early.
  const refresh = () => setManual(Math.max(tick, manual) + ms);

  useWinKeys({ delete: () => end(sel), f5: refresh });

  const ctx = menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />;
  const apps = procs.filter((p) => p.group === "app");

  // ---------- Fewer details ----------
  if (!prefs.more)
    return (
      <div className="tm tm-compact">
        <div className="tm-clist">
          {apps.map((p) => (
            <div
              key={p.key}
              className={p.key === sel ? "on" : ""}
              onPointerDown={() => setSel(p.key)}
              onDoubleClick={() => switchTo(p)}
              onContextMenu={(e) => {
                e.preventDefault();
                setSel(p.key);
                procMenu(e, p.key, true);
              }}
            >
              <ProcIcon p={p} />
              <span>{p.title}</span>
              {p.suspended && <em>{tr ? "Askıya alındı" : "Suspended"}</em>}
            </div>
          ))}
        </div>
        <div className="tm-foot">
          <button className="tm-more" onClick={() => setPrefs({ more: true })}>
            <Chevron up={false} />
            {tr ? "Daha fazla ayrıntı" : "More details"}
          </button>
          <Btn disabled={!canEnd} onClick={() => end(sel)}>
            {tr ? "Görevi sonlandır" : "End task"}
          </Btn>
        </div>
        {ctx}
      </div>
    );

  // ---------- More details ----------
  const TABS: [Tab, string][] = [
    ["proc", tr ? "İşlemler" : "Processes"],
    ["perf", tr ? "Performans" : "Performance"],
    ["hist", tr ? "Uygulama geçmişi" : "App history"],
    ["start", tr ? "Başlangıç" : "Startup"],
    ["users", tr ? "Kullanıcılar" : "Users"],
    ["details", tr ? "Ayrıntılar" : "Details"],
    ["services", tr ? "Hizmetler" : "Services"],
  ];
  const speeds: [number, string][] = [
    [500, tr ? "Yüksek" : "High"],
    [1000, "Normal"],
    [4000, tr ? "Düşük" : "Low"],
    [0, tr ? "Duraklatıldı" : "Paused"],
  ];
  const menus = [
    {
      label: tr ? "Dosya" : "File",
      items: [
        { label: tr ? "Yeni görev çalıştır" : "Run new task", onClick: () => wm.launch("run") },
        { sep: true as const },
        { label: tr ? "Çıkış" : "Exit", onClick: close },
      ],
    },
    {
      label: tr ? "Seçenekler" : "Options",
      items: [
        {
          label: tr ? "Her zaman üstte" : "Always on top",
          checked: prefs.top,
          onClick: () => setPrefs({ top: !prefs.top }),
        },
        {
          label: tr ? "Kullanımda simge durumuna küçült" : "Minimize on use",
          checked: prefs.minUse,
          onClick: () => setPrefs({ minUse: !prefs.minUse }),
        },
        {
          label: tr ? "Simge durumundayken gizle" : "Hide when minimized",
          checked: prefs.hide,
          onClick: () => setPrefs({ hide: !prefs.hide }),
        },
      ],
    },
    {
      label: tr ? "Görünüm" : "View",
      items: [
        { label: tr ? "Şimdi yenile" : "Refresh now", shortcut: "F5", onClick: refresh },
        {
          label: tr ? "Güncelleştirme hızı" : "Update speed",
          sub: speeds.map(([v, label]) => ({
            label,
            radio: true,
            checked: prefs.speed === v,
            onClick: () => setPrefs({ speed: v }),
          })),
        },
        { sep: true as const },
        {
          label: tr ? "Türe göre grupla" : "Group by type",
          checked: prefs.group,
          onClick: () => setPrefs({ group: !prefs.group }),
        },
      ],
    },
  ];

  const head = (v: number, label: string) => (
    <>
      <b>{Math.round(v)}%</b>
      <span>{label}</span>
    </>
  );
  const name = (p: Proc) => (
    <span className="tm-name">
      <ProcIcon p={p} />
      {p.name}
    </span>
  );
  const usageCols = (w = 72): Col[] => [
    { label: head(cpu, "CPU"), num: true, w, heat: cpu / 100 },
    { label: head(memPct, tr ? "Bellek" : "Memory"), num: true, w: w + 8, heat: memPct / 100 },
    { label: head(disk, "Disk"), num: true, w, heat: disk / 100 },
    { label: head(netTotal * 10, tr ? "Ağ" : "Network"), num: true, w, heat: netTotal / 10 },
  ];
  const usageCells = (u: { cpu: number; mem: number; disk: number; net: number }) => [
    pct(u.cpu),
    `${nf(u.mem)} MB`,
    `${u.disk < 0.05 ? 0 : nf(u.disk)} MB/${tr ? "sn" : "s"}`,
    `${u.net < 0.05 ? 0 : nf(u.net)} Mbps`,
  ];
  const suspended = tr ? "Askıya alındı" : "Suspended";

  let body: ReactNode = null;
  let action: ReactNode = null;
  const endBtn = (
    <Btn disabled={!canEnd} onClick={() => end(sel)}>
      {tr ? "Görevi sonlandır" : "End task"}
    </Btn>
  );

  if (prefs.tab === "proc") {
    body = (
      <Table
        cols={[{ label: tr ? "Ad" : "Name" }, { label: tr ? "Durum" : "Status", w: 92 }, ...usageCols()]}
        groups={
          prefs.group
            ? [
                { id: "app", label: tr ? "Uygulamalar" : "Apps" },
                { id: "bg", label: tr ? "Arka plan işlemleri" : "Background processes" },
                { id: "win", label: tr ? "Windows işlemleri" : "Windows processes" },
              ]
            : undefined
        }
        rows={procs
          .filter((p) => p.pid !== 0)
          .map((p) => {
            const u = use(p);
            return {
              id: p.key,
              group: p.group,
              cells: [name(p), p.suspended ? suspended : "", ...usageCells(u)],
              vals: [p.name, p.suspended ? 1 : 0, u.cpu, u.mem, u.disk, u.net],
              heat: [null, null, u.cpu / 40, u.mem / 400, u.disk / 4, u.net / 4],
            };
          })}
        sel={sel}
        onSel={setSel}
        onOpen={(key) => {
          const p = find(key);
          if (p?.group === "app") switchTo(p);
        }}
        onMenu={(e, key) => procMenu(e, key)}
      />
    );
    action = endBtn;
  } else if (prefs.tab === "details") {
    body = (
      <Table
        cols={[
          { label: tr ? "Ad" : "Name", w: 150 },
          { label: "PID", num: true, w: 54 },
          { label: tr ? "Durum" : "Status", w: 90 },
          { label: tr ? "Kullanıcı adı" : "User name", w: 110 },
          { label: "CPU", num: true, w: 44 },
          { label: tr ? "Bellek (özel çalışma kümesi)" : "Memory (private working set)", num: true, w: 120 },
          { label: tr ? "Açıklama" : "Description", w: 240 },
        ]}
        rows={procs.map((p) => {
          const u = use(p);
          const kb = Math.round(u.mem * 1024 * 0.6);
          return {
            id: p.key,
            cells: [
              <span key="n" className="tm-name">
                <ProcIcon p={p} />
                {p.exe}
              </span>,
              p.pid,
              p.suspended ? suspended : tr ? "Çalışıyor" : "Running",
              p.user,
              String(Math.round(u.cpu)).padStart(2, "0"),
              `${kb.toLocaleString(tr ? "tr-TR" : "en-US")} K`,
              p.name,
            ],
            vals: [p.exe.toLowerCase(), p.pid, p.suspended ? 1 : 0, p.user, u.cpu, kb, p.name],
          };
        })}
        sel={sel}
        onSel={setSel}
        onMenu={(e, key) => procMenu(e, key, true)}
      />
    );
    action = endBtn;
  } else if (prefs.tab === "users") {
    const mine = procs.filter((p) => p.user === USER);
    const sum = (f: "cpu" | "mem" | "disk" | "net") => mine.reduce((a, p) => a + use(p)[f], 0);
    const u = { cpu: sum("cpu"), mem: sum("mem"), disk: sum("disk"), net: sum("net") };
    body = (
      <Table
        cols={[{ label: tr ? "Kullanıcı" : "User" }, { label: tr ? "Durum" : "Status", w: 92 }, ...usageCols()]}
        rows={[
          {
            id: "user",
            cells: [
              <span key="u" className="tm-name">
                <ShellIcon name="user" size={16} />
                {USER} ({mine.length})
              </span>,
              "",
              ...usageCells(u),
            ],
            vals: [USER, "", u.cpu, u.mem, u.disk, u.net],
            heat: [null, null, u.cpu / 40, u.mem / 1000, u.disk / 4, u.net / 4],
          },
        ]}
        sel={sel}
        onSel={setSel}
      />
    );
    action = <Btn disabled>{tr ? "Bağlantıyı kes" : "Disconnect"}</Btn>;
  } else if (prefs.tab === "start") {
    const impact: Record<string, string> = tr
      ? { high: "Yüksek", medium: "Orta", low: "Düşük" }
      : { high: "High", medium: "Medium", low: "Low" };
    body = (
      <>
        <div className="tm-note right">{tr ? "Son BIOS süresi: 4,2 saniye" : "Last BIOS time: 4.2 seconds"}</div>
        <Table
          cols={[
            { label: tr ? "Ad" : "Name" },
            { label: tr ? "Yayımcı" : "Publisher", w: 170 },
            { label: tr ? "Durum" : "Status", w: 90 },
            { label: tr ? "Başlangıç etkisi" : "Startup impact", w: 110 },
          ]}
          rows={STARTUP.map(([n, pub, , imp]) => {
            const st = startup[n] ? (tr ? "Etkin" : "Enabled") : tr ? "Devre dışı" : "Disabled";
            const im = startup[n] ? impact[imp] : tr ? "Yok" : "None";
            return {
              id: n,
              cells: [
                <span key="n" className="tm-name">
                  <ShellIcon name="file-exe" size={16} />
                  {n}
                </span>,
                pub,
                st,
                im,
              ],
              vals: [n, pub, st, im],
            };
          })}
          sel={sel}
          onSel={setSel}
        />
      </>
    );
    action = (
      <Btn disabled={!sel || !(sel in startup)} onClick={() => sel && setStartup((x) => ({ ...x, [sel]: !x[sel] }))}>
        {sel && startup[sel] === false ? (tr ? "Etkinleştir" : "Enable") : tr ? "Devre dışı bırak" : "Disable"}
      </Btn>
    );
  } else if (prefs.tab === "hist") {
    const since = new Date(histCleared ?? sessionStart - 27 * 86_400_000).toLocaleDateString(tr ? "tr-TR" : "en-US");
    const metro = APPS.filter((a) => a.kind === "metro" && a.id !== "desktop");
    const MB = (v: number) => `${nf(v)} MB`;
    body = (
      <>
        <div className="tm-note">
          {tr
            ? `${since} tarihinden bu yana geçerli kullanıcı hesabı için kaynak kullanımı.`
            : `Resource usage since ${since} for current user account.`}{" "}
          <button className="tm-link" onClick={() => setHistCleared(Date.now())}>
            {tr ? "Kullanım geçmişini sil" : "Delete usage history"}
          </button>
        </div>
        <Table
          cols={[
            { label: tr ? "Ad" : "Name" },
            { label: tr ? "CPU süresi" : "CPU time", num: true, w: 80 },
            { label: tr ? "Ağ" : "Network", num: true, w: 80 },
            { label: tr ? "Tarifeli ağ" : "Metered network", num: true, w: 96 },
            { label: tr ? "Kutucuk güncelleştirmeleri" : "Tile updates", num: true, w: 110 },
          ]}
          rows={metro.map((a) => {
            const h = histCleared ? 0 : hash(a.id);
            const secs = h % 5400;
            const net = (h % 9000) / 100;
            const tile = (h % 300) / 100;
            const p: Proc = {
              key: a.id,
              name: t(a.title),
              exe: "",
              pid: 0,
              group: "app",
              user: USER,
              mem: 0,
              w: 0,
              metro: a.id,
            };
            return {
              id: a.id,
              cells: [
                name(p),
                `${Math.floor(secs / 3600)}:${String(Math.floor(secs / 60) % 60).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`,
                MB(net),
                MB(0),
                MB(tile),
              ],
              vals: [p.name, secs, net, 0, tile],
              heat: [null, secs / 5400, net / 90, 0, tile / 3],
            };
          })}
          sel={sel}
          onSel={setSel}
        />
      </>
    );
  } else if (prefs.tab === "services") {
    body = (
      <Table
        cols={[
          { label: tr ? "Ad" : "Name", w: 150 },
          { label: "PID", num: true, w: 54 },
          { label: tr ? "Açıklama" : "Description", w: 240 },
          { label: tr ? "Durum" : "Status", w: 90 },
          { label: tr ? "Grup" : "Group", w: 190 },
        ]}
        rows={SERVICES.map(([n, pid, en, trName, run, grp]) => ({
          id: n,
          cells: [
            n,
            run ? pid : "",
            tr ? trName : en,
            run ? (tr ? "Çalışıyor" : "Running") : tr ? "Durduruldu" : "Stopped",
            grp,
          ],
          vals: [n.toLowerCase(), run ? pid : 0, tr ? trName : en, run ? 0 : 1, grp],
        }))}
        sel={sel}
        onSel={setSel}
      />
    );
  } else {
    // ---- Performance ----
    const series = (f: (s: number) => number) => Array.from({ length: 60 }, (_, i) => f(((k - 59 + i) * ms) / 1000));
    const gb = (mb: number) => nf(mb / 1024);
    const ghz = 2.2 + noise(s / 4, 7) * 1.3;
    const sec = Math.max(0, Math.floor((Math.max(tick, manual) - sessionStart) / 1000));
    const up = `${Math.floor(sec / 86400)}:${[3600, 60, 1].map((d) => String(Math.floor(sec / d) % (d === 3600 ? 24 : 60)).padStart(2, "0")).join(":")}`;
    const kbps = (v: number) => `${nf(v)} Kbps`;
    const items = [
      {
        id: "cpu" as const,
        title: "CPU",
        sub: `${Math.round(cpu)}% ${nf(ghz, 2)} GHz`,
        color: "#117dbb",
        vals: series((x) => cpuAt(x) / 100),
        model: "Intel(R) Core(TM) i7-4770 CPU @ 3.40GHz",
        axis: [tr ? "% Kullanım" : "% Utilization", "100%"],
        big: [
          [tr ? "Kullanım" : "Utilization", `${Math.round(cpu)}%`],
          [tr ? "Hız" : "Speed", `${nf(ghz, 2)} GHz`],
          [tr ? "İşlemler" : "Processes", procs.length],
          [tr ? "İş parçacıkları" : "Threads", procs.length * 14 + 312 + Math.round(noise(s, 11) * 20)],
          [tr ? "Tanıtıcılar" : "Handles", 18_400 + procs.length * 260 + Math.round(noise(s, 12) * 300)],
          [tr ? "Çalışma süresi" : "Up time", up],
        ],
        small: [
          [tr ? "En yüksek hız:" : "Maximum speed:", "3,40 GHz"],
          [tr ? "Yuvalar:" : "Sockets:", 1],
          [tr ? "Çekirdekler:" : "Cores:", Math.max(1, cores / 2)],
          [tr ? "Mantıksal işlemciler:" : "Logical processors:", cores],
          [tr ? "Sanallaştırma:" : "Virtualization:", tr ? "Etkin" : "Enabled"],
          [tr ? "L1 önbelleği:" : "L1 cache:", "256 KB"],
          [tr ? "L2 önbelleği:" : "L2 cache:", "1,0 MB"],
          [tr ? "L3 önbelleği:" : "L3 cache:", "8,0 MB"],
        ],
      },
      {
        id: "mem" as const,
        title: tr ? "Bellek" : "Memory",
        sub: `${gb(usedMB)}/${gb(totalMB)} GB (${Math.round(memPct)}%)`,
        color: "#8b12ae",
        vals: series((x) => (usedMB * (1 + 0.012 * noise(x / 15, 9))) / totalMB),
        model: `${gb(totalMB)} GB DDR3`,
        axis: [tr ? "Bellek kullanımı" : "Memory usage", `${gb(totalMB)} GB`],
        big: [
          [tr ? "Kullanımda" : "In use", `${gb(usedMB)} GB`],
          [tr ? "Kullanılabilir" : "Available", `${gb(totalMB - usedMB)} GB`],
          [tr ? "Kaydedilen" : "Committed", `${gb(usedMB * 1.3)}/${gb(totalMB * 1.25)} GB`],
          [tr ? "Önbelleğe alınan" : "Cached", `${gb(totalMB * 0.31)} GB`],
          [tr ? "Disk belleğine alınan havuz" : "Paged pool", "214 MB"],
          [tr ? "Disk belleğine alınmayan havuz" : "Non-paged pool", "98,4 MB"],
        ],
        small: [
          [tr ? "Hız:" : "Speed:", "1600 MHz"],
          [tr ? "Kullanılan yuvalar:" : "Slots used:", tr ? "2 / 4" : "2 of 4"],
          [tr ? "Form faktörü:" : "Form factor:", "DIMM"],
          [tr ? "Donanıma ayrılmış:" : "Hardware reserved:", "84,2 MB"],
        ],
      },
      {
        id: "disk" as const,
        title: "Disk 0 (C:)",
        sub: `${Math.round(disk)}%`,
        color: "#4da60c",
        vals: series((x) => diskAt(x) / 100),
        model: "ST1000DM003-1CH162",
        axis: [tr ? "Etkin süre" : "Active time", "100%"],
        big: [
          [tr ? "Etkin süre" : "Active time", `${Math.round(disk)}%`],
          [tr ? "Ortalama yanıt süresi" : "Average response time", `${nf(2 + disk / 6)} ms`],
          [tr ? "Okuma hızı" : "Read speed", `${nf(diskTotal * 600)} KB/${tr ? "sn" : "s"}`],
          [tr ? "Yazma hızı" : "Write speed", `${nf(diskTotal * 420)} KB/${tr ? "sn" : "s"}`],
        ],
        small: [
          [tr ? "Kapasite:" : "Capacity:", "932 GB"],
          [tr ? "Biçimlendirilmiş:" : "Formatted:", "931 GB"],
          [tr ? "Sistem diski:" : "System disk:", tr ? "Evet" : "Yes"],
          [tr ? "Disk belleği dosyası:" : "Page file:", tr ? "Evet" : "Yes"],
        ],
      },
      {
        id: "net" as const,
        title: "Ethernet",
        sub: `${tr ? "G" : "S"}: ${nf(sendAt(s), 0)} ${tr ? "A" : "R"}: ${nf(recvAt(s), 0)} Kbps`,
        color: "#a74f01",
        vals: series((x) => (sendAt(x) + recvAt(x)) / 500),
        model: "Realtek PCIe GBE Family Controller",
        axis: [tr ? "Verimlilik" : "Throughput", "500 Kbps"],
        big: [
          [tr ? "Gönder" : "Send", kbps(sendAt(s))],
          [tr ? "Al" : "Receive", kbps(recvAt(s))],
        ],
        small: [
          [tr ? "Bağdaştırıcı adı:" : "Adapter name:", "Ethernet"],
          [tr ? "Bağlantı türü:" : "Connection type:", "Ethernet"],
          [tr ? "IPv4 adresi:" : "IPv4 address:", IPV4],
          [tr ? "IPv6 adresi:" : "IPv6 address:", IPV6],
        ],
      },
    ];
    const cur = items.find((i) => i.id === perf) ?? items[0];
    body = (
      <div className="tm-perf">
        <div className="tm-perf-side">
          {items.map((it) => (
            <button key={it.id} className={`tm-perf-item ${it.id === perf ? "on" : ""}`} onClick={() => setPerf(it.id)}>
              <Graph vals={it.vals} color={it.color} k={k} mini />
              <span>
                <b>{it.title}</b>
                <small>{it.sub}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="tm-perf-main">
          <div className="tm-perf-head">
            <h2>{cur.title}</h2>
            <span>{cur.model}</span>
          </div>
          <div className="tm-axis">
            <span>{cur.axis[0]}</span>
            <span>{cur.axis[1]}</span>
          </div>
          <Graph vals={cur.vals} color={cur.color} k={k} />
          <div className="tm-axis">
            <span>{tr ? "60 saniye" : "60 seconds"}</span>
            <span>0</span>
          </div>
          <div className="tm-stats">
            <div className="tm-big">
              {cur.big.map(([l, v]) => (
                <div key={l}>
                  <span>{l}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
            <dl className="tm-small">
              {cur.small.map(([l, v]) => [<dt key={`${l}t`}>{l}</dt>, <dd key={`${l}d`}>{v}</dd>])}
            </dl>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tm">
      <MenuBar menus={menus} />
      <div className="tm-tabs" role="tablist">
        {TABS.map(([tab, label]) => (
          <button
            key={tab}
            role="tab"
            aria-selected={prefs.tab === tab}
            className={prefs.tab === tab ? "on" : ""}
            onClick={() => {
              setPrefs({ tab });
              setSel(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="tm-body">{body}</div>
      <div className="tm-foot">
        <button className="tm-more" onClick={() => setPrefs({ more: false })}>
          <Chevron up />
          {tr ? "Daha az ayrıntı" : "Fewer details"}
        </button>
        {action}
      </div>
      {ctx}
    </div>
  );
}
