"use client";
/** The Windows 8.1 taskbar: Start button, pinned and running programs, notification area, clock and Show desktop. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useOS, useTick } from "@/lib/os";
import { monthName, dayName } from "@/lib/i18n";
import { app as appDef, type DesktopAppId } from "@/lib/model";
import { sound } from "@/lib/sound";
import { wm, useWM, TASKBAR_H, type Win } from "@/lib/wm";
import { AppIcon } from "../icons/AppIcon";
import { Icon, WinLogo } from "../Icons";
import { ContextMenu, type MenuItem } from "./ui";

const PIN_KEY = "afu-metro:v2:pinned";
const DEFAULT_PINS: DesktopAppId[] = ["ie", "explorer"];
let pins: DesktopAppId[] | null = null;
const pinListeners = new Set<() => void>();
function getPins(): DesktopAppId[] {
  if (pins) return pins;
  try {
    pins = JSON.parse(window.localStorage.getItem(PIN_KEY) ?? "null") ?? DEFAULT_PINS;
  } catch {
    pins = DEFAULT_PINS;
  }
  return pins!;
}
export const taskbarPins = {
  get: getPins,
  toggle(id: DesktopAppId) {
    const cur = getPins();
    pins = cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id];
    try {
      window.localStorage.setItem(PIN_KEY, JSON.stringify(pins));
    } catch {
      /* not remembered */
    }
    pinListeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    pinListeners.add(f);
    return () => pinListeners.delete(f);
  },
};
function usePins() {
  return useSyncExternalStore(taskbarPins.subscribe, getPins, () => DEFAULT_PINS);
}

type Flyout = null | "clock" | "volume" | "action" | "hidden" | "lang";

export function Taskbar({ onWinX, onNetwork }: { onWinX: () => void; onNetwork: () => void }) {
  const os = useOS();
  const { t, lang, open, setPref } = os;
  const { wins, focus } = useWM();
  const pinned = usePins();
  const [fly, setFly] = useState<Flyout>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const peekTimer = useRef(0);
  const now = new Date(useTick(1000));
  const [vol, setVol] = useState(() => ({ v: sound.volume, m: sound.muted }));

  useEffect(() => {
    const f = () => setVol({ v: sound.volume, m: sound.muted });
    sound.onVolume.add(f);
    return () => {
      sound.onVolume.delete(f);
    };
  }, []);

  // Buttons: pinned programs first (in pin order), then other running programs in launch order.
  const groups = useMemo(() => {
    const top = wins.filter((w) => w.app !== "dialog");
    const ids: DesktopAppId[] = [...pinned];
    for (const w of [...top].sort((a, b) => a.seq - b.seq))
      if (!ids.includes(w.app as DesktopAppId)) ids.push(w.app as DesktopAppId);
    return ids.map((id) => ({ id, wins: top.filter((w) => w.app === id).sort((a, b) => a.seq - b.seq) }));
  }, [wins, pinned]);

  const clickGroup = (id: DesktopAppId, ws: Win[]) => {
    setPeek(null);
    if (!ws.length) return open({ kind: "app", app: id });
    if (ws.length === 1) return wm.toggle(ws[0].id);
    // Several windows: cycle to the next one, like clicking a combined button repeatedly.
    const i = ws.findIndex((w) => w.id === focus);
    wm.focus(ws[(i + 1) % ws.length].id);
  };

  const groupMenu = (e: React.MouseEvent, id: DesktopAppId, ws: Win[]) => {
    e.preventDefault();
    const isPinned = pinned.includes(id);
    setMenu({
      x: e.clientX,
      y: window.innerHeight - TASKBAR_H,
      items: [
        { label: t(appDef(id).title), bold: true, onClick: () => open({ kind: "app", app: id }) },
        {
          label: isPinned
            ? lang === "tr"
              ? "Bu programı görev çubuğundan kaldır"
              : "Unpin this program from taskbar"
            : lang === "tr"
              ? "Bu programı görev çubuğuna sabitle"
              : "Pin this program to taskbar",
          onClick: () => taskbarPins.toggle(id),
        },
        ...(ws.length
          ? [
              {
                label:
                  ws.length > 1
                    ? lang === "tr"
                      ? "Tüm pencereleri kapat"
                      : "Close all windows"
                    : lang === "tr"
                      ? "Pencereyi kapat"
                      : "Close window",
                onClick: () => ws.forEach((w) => void wm.requestClose(w.id)),
              },
            ]
          : []),
      ],
    });
  };

  const barMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const tr = lang === "tr";
    const arrange = (mode: "cascade" | "stack" | "side") => {
      const vis = wins.filter((w) => !w.min && w.app !== "dialog");
      const W = window.innerWidth;
      const H = window.innerHeight - TASKBAR_H;
      vis.forEach((w, i) => {
        if (mode === "cascade")
          wm.patch(w.id, {
            max: false,
            snap: undefined,
            x: 20 + i * 28,
            y: 20 + i * 28,
            w: Math.min(w.w, W - 200),
            h: Math.min(w.h, H - 160),
          });
        else if (mode === "stack")
          wm.patch(w.id, {
            max: false,
            snap: undefined,
            x: 0,
            y: Math.round((H / vis.length) * i),
            w: W,
            h: Math.round(H / vis.length),
          });
        else
          wm.patch(w.id, {
            max: false,
            snap: undefined,
            x: Math.round((W / vis.length) * i),
            y: 0,
            w: Math.round(W / vis.length),
            h: H,
          });
      });
    };
    setMenu({
      x: e.clientX,
      y: window.innerHeight - TASKBAR_H,
      items: [
        { label: tr ? "Pencereleri basamakla" : "Cascade windows", onClick: () => arrange("cascade") },
        { label: tr ? "Pencereleri yığılmış göster" : "Show windows stacked", onClick: () => arrange("stack") },
        { label: tr ? "Pencereleri yan yana göster" : "Show windows side by side", onClick: () => arrange("side") },
        { label: tr ? "Masaüstünü göster" : "Show the desktop", onClick: () => wm.showDesktop() },
        { sep: true },
        { label: tr ? "Görev Yöneticisi" : "Task Manager", onClick: () => open({ kind: "app", app: "taskmgr" }) },
        { sep: true },
        { label: tr ? "Görev çubuğunu kilitle" : "Lock the taskbar", checked: true },
        {
          label: tr ? "Özellikler" : "Properties",
          onClick: () => open({ kind: "app", app: "control", param: "taskbar" }),
        },
      ],
    });
  };

  const tr = lang === "tr";
  const date = now.toLocaleDateString(tr ? "tr-TR" : "en-US");

  return (
    <>
      <div className="w8-taskbar" onContextMenu={barMenu} onPointerDown={() => setMenu(null)}>
        <button
          className="w8-start"
          onClick={() => {
            sound.tap();
            open({ kind: "start" });
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onWinX();
          }}
          title={t("start")}
          aria-label={t("start")}
        >
          <WinLogo size={22} className="w8-start-logo" />
        </button>
        <div className="w8-tasks">
          {groups.map(({ id, wins: ws }) => {
            const active = ws.some((w) => w.id === focus && !w.min);
            return (
              <div
                key={id}
                className="w8-task-wrap"
                onPointerEnter={() =>
                  ws.length &&
                  (window.clearTimeout(peekTimer.current),
                  (peekTimer.current = window.setTimeout(() => setPeek(id), 450)))
                }
                onPointerLeave={() => (
                  window.clearTimeout(peekTimer.current),
                  (peekTimer.current = window.setTimeout(() => setPeek((p) => (p === id ? null : p)), 250))
                )}
              >
                <button
                  className={`w8-task ${ws.length ? "running" : ""} ${ws.length > 1 ? "stacked" : ""} ${active ? "active" : ""}`}
                  onClick={() => clickGroup(id, ws)}
                  onAuxClick={(e) => e.button === 1 && wm.launch(id)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    groupMenu(e, id, ws);
                  }}
                  title={ws.length ? undefined : t(appDef(id).title)}
                >
                  <AppIcon id={id} size={26} />
                </button>
                {peek === id && ws.length > 0 && (
                  <div className="w8-peek" onPointerEnter={() => window.clearTimeout(peekTimer.current)}>
                    {ws.map((w) => (
                      <div
                        key={w.id}
                        className={`w8-peek-item ${w.id === focus ? "on" : ""}`}
                        onClick={() => (wm.focus(w.id), setPeek(null))}
                      >
                        <div className="w8-peek-head">
                          <AppIcon id={id} size={16} />
                          <span>{w.title ?? t(appDef(id).title)}</span>
                          <button
                            className="w8-peek-close"
                            onClick={(e) => {
                              e.stopPropagation();
                              void wm.requestClose(w.id);
                            }}
                            aria-label={t("win.close")}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="w8-peek-thumb">
                          <AppIcon id={id} size={40} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="w8-tray" onContextMenu={(e) => e.stopPropagation()}>
          <button
            className={`w8-tray-btn ${fly === "hidden" ? "on" : ""}`}
            onClick={() => setFly(fly === "hidden" ? null : "hidden")}
            aria-label={tr ? "Gizli simgeleri göster" : "Show hidden icons"}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M1 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
          <button
            className={`w8-tray-btn ${fly === "action" ? "on" : ""}`}
            onClick={() => setFly(fly === "action" ? null : "action")}
            title={tr ? "İşlem Merkezi" : "Action Center"}
          >
            <Icon name="flag" size={16} strokeWidth={1.6} />
          </button>
          <button className="w8-tray-btn" onClick={onNetwork} title={tr ? "İnternet erişimi" : "Internet access"}>
            <svg width="18" height="16" viewBox="0 0 18 16" fill="currentColor">
              <rect x="1" y="11" width="3" height="4" />
              <rect x="5" y="8" width="3" height="7" />
              <rect x="9" y="5" width="3" height="10" />
              <rect x="13" y="2" width="3" height="13" />
            </svg>
          </button>
          <button
            className={`w8-tray-btn ${fly === "volume" ? "on" : ""}`}
            onClick={() => setFly(fly === "volume" ? null : "volume")}
            title={`${tr ? "Hoparlörler" : "Speakers"}: ${Math.round(vol.v * 100)}%`}
          >
            <Icon name={vol.m || vol.v === 0 ? "mute" : "volume"} size={17} strokeWidth={1.6} />
          </button>
          <button
            className={`w8-tray-lang ${fly === "lang" ? "on" : ""}`}
            onClick={() => setFly(fly === "lang" ? null : "lang")}
          >
            {tr ? "TUR" : "ENG"}
          </button>
          <button
            className={`w8-clock ${fly === "clock" ? "on" : ""}`}
            onClick={() => setFly(fly === "clock" ? null : "clock")}
          >
            <span>{`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`}</span>
            <span>{date}</span>
          </button>
          <button
            className="w8-showdesk"
            onClick={() => wm.showDesktop()}
            title={tr ? "Masaüstünü göster" : "Show desktop"}
            aria-label={tr ? "Masaüstünü göster" : "Show desktop"}
          />
        </div>
      </div>

      {fly && <div className="w8-fly-scrim" onPointerDown={() => setFly(null)} />}
      {fly === "clock" && (
        <ClockFlyout
          now={now}
          onSettings={() => (setFly(null), open({ kind: "app", app: "control", param: "datetime" }))}
        />
      )}
      {fly === "volume" && (
        <div className="w8-fly w8-fly-volume">
          <div className="w8-vol-col">
            <span className="w8-vol-label">{tr ? "Hoparlörler" : "Speakers"}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(vol.v * 100)}
              onChange={(e) => sound.setVolume(Number(e.target.value) / 100, false)}
              className="w8-vol-slider"
              aria-label={tr ? "Ses düzeyi" : "Volume"}
            />
            <span className="w8-vol-num">{Math.round(vol.v * 100)}</span>
            <button
              className={`w8-vol-mute ${vol.m ? "on" : ""}`}
              onClick={() => sound.setVolume(vol.v, !vol.m)}
              title={vol.m ? (tr ? "Sesi aç" : "Unmute") : tr ? "Sessiz" : "Mute"}
            >
              <Icon name={vol.m ? "mute" : "volume"} size={18} />
            </button>
          </div>
          <button
            className="w8-fly-link"
            onClick={() => (setFly(null), open({ kind: "app", app: "control", param: "sound" }))}
          >
            {tr ? "Karıştırıcı" : "Mixer"}
          </button>
        </div>
      )}
      {fly === "action" && (
        <div className="w8-fly w8-fly-action">
          <div className="w8-fly-action-head">
            <Icon name="flag" size={18} />
            <strong>{tr ? "Önemli ileti yok" : "No important messages"}</strong>
          </div>
          <p>{tr ? "Windows sorun algılamadı." : "Windows didn't find any problems."}</p>
          <button
            className="w8-fly-link"
            onClick={() => (setFly(null), open({ kind: "app", app: "control", param: "action" }))}
          >
            {tr ? "İşlem Merkezi'ni Aç" : "Open Action Center"}
          </button>
        </div>
      )}
      {fly === "hidden" && (
        <div className="w8-fly w8-fly-hidden">
          <button onClick={() => (setFly(null), open({ kind: "app", app: "skydrive" }))} title="SkyDrive">
            <Icon name="skydrive" size={18} />
          </button>
          <button onClick={() => (setFly(null), open({ kind: "app", app: "taskmgr" }))} title={t("app.taskmgr")}>
            <AppIcon id="taskmgr" size={18} />
          </button>
          <button
            className="w8-fly-link"
            onClick={() => (setFly(null), open({ kind: "app", app: "control", param: "notifications" }))}
          >
            {tr ? "Özelleştir..." : "Customize..."}
          </button>
        </div>
      )}
      {fly === "lang" && (
        <div className="w8-fly w8-fly-lang">
          {(["tr", "en"] as const).map((l) => (
            <button
              key={l}
              className={lang === l ? "on" : ""}
              onClick={() => {
                setPref("lang", l);
                setFly(null);
              }}
            >
              <strong>{l === "tr" ? "TUR" : "ENG"}</strong>
              <span>
                {l === "tr" ? "Türkçe" : "English (United States)"}
                <small>{l === "tr" ? "Türkçe Q klavye" : "US keyboard"}</small>
              </span>
            </button>
          ))}
          <button
            className="w8-fly-link"
            onClick={() => (setFly(null), open({ kind: "app", app: "control", param: "region" }))}
          >
            {tr ? "Dil tercihleri" : "Language preferences"}
          </button>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </>
  );
}

function ClockFlyout({ now, onSettings }: { now: Date; onSettings: () => void }) {
  const { lang } = useOS();
  const tr = lang === "tr";
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const first = (month.getDay() + 6) % 7; // weeks start on Monday in Turkey; keep it for both languages like the TR build
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(month.getFullYear(), month.getMonth(), i - first + 1);
    return d;
  });
  const sec = now.getSeconds();
  const min = now.getMinutes() + sec / 60;
  const hr = (now.getHours() % 12) + min / 60;
  const longDate = tr
    ? `${now.getDate()} ${monthName(lang, now.getMonth())} ${now.getFullYear()} ${dayName(lang, now.getDay())}`
    : `${dayName(lang, now.getDay())}, ${monthName(lang, now.getMonth())} ${now.getDate()}, ${now.getFullYear()}`;
  const dows = tr ? ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"] : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  void days;
  return (
    <div className="w8-fly w8-fly-clock">
      <button className="w8-fly-link w8-clock-date">{longDate}</button>
      <div className="w8-clock-body">
        <div className="w8-cal">
          <div className="w8-cal-head">
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>◀</button>
            <span>{`${monthName(lang, month.getMonth())} ${month.getFullYear()}`}</span>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>▶</button>
          </div>
          <div className="w8-cal-grid">
            {dows.map((d) => (
              <span key={d} className="dow">
                {d}
              </span>
            ))}
            {cells.map((d) => {
              const other = d.getMonth() !== month.getMonth();
              const today = d.toDateString() === now.toDateString();
              return (
                <span key={d.toISOString()} className={`${other ? "other" : ""} ${today ? "today" : ""}`}>
                  {d.getDate()}
                </span>
              );
            })}
          </div>
        </div>
        <div className="w8-analog">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <radialGradient id="w8clockface" cx="0.4" cy="0.35" r="0.8">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="1" stopColor="#dfe6ee" />
              </radialGradient>
            </defs>
            <circle cx="60" cy="60" r="56" fill="url(#w8clockface)" stroke="#9aa7b4" strokeWidth="2" />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return (
                <line
                  key={i}
                  x1={60 + Math.sin(a) * 46}
                  y1={60 - Math.cos(a) * 46}
                  x2={60 + Math.sin(a) * 51}
                  y2={60 - Math.cos(a) * 51}
                  stroke="#334"
                  strokeWidth={i % 3 === 0 ? 3 : 1.5}
                />
              );
            })}
            <line
              x1="60"
              y1="60"
              x2={60 + Math.sin((hr / 12) * Math.PI * 2) * 28}
              y2={60 - Math.cos((hr / 12) * Math.PI * 2) * 28}
              stroke="#223"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <line
              x1="60"
              y1="60"
              x2={60 + Math.sin((min / 60) * Math.PI * 2) * 40}
              y2={60 - Math.cos((min / 60) * Math.PI * 2) * 40}
              stroke="#223"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <line
              x1="60"
              y1="60"
              x2={60 + Math.sin((sec / 60) * Math.PI * 2) * 44}
              y2={60 - Math.cos((sec / 60) * Math.PI * 2) * 44}
              stroke="#c0392b"
              strokeWidth="1.4"
            />
            <circle cx="60" cy="60" r="3" fill="#223" />
          </svg>
          <div className="w8-analog-time">{now.toLocaleTimeString(tr ? "tr-TR" : "en-US")}</div>
        </div>
      </div>
      <button className="w8-fly-link w8-clock-settings" onClick={onSettings}>
        {tr ? "Tarih ve saat ayarlarını değiştir..." : "Change date and time settings..."}
      </button>
    </div>
  );
}
