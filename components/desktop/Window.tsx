"use client";
/**
 * A Windows 8 desktop window: flat colored frame, centered title, minimize / maximize / close,
 * Aero Snap (drag to the top or a side), resize from every edge and corner.
 */
import { memo, useMemo, useRef, useState, type ComponentType } from "react";
import { useOS } from "@/lib/os";
import { app as appDef } from "@/lib/model";
import { wm, TASKBAR_H, type Win } from "@/lib/wm";
import { AppIcon } from "../icons/AppIcon";
import { WinCtx, type WinApi } from "./ui";

type Zone = "max" | "left" | "right" | null;

function snapZone(x: number, y: number): Zone {
  if (y <= 1) return "max";
  if (x <= 1) return "left";
  if (x >= window.innerWidth - 2) return "right";
  return null;
}

/** Black or white caption text, whichever reads better on the frame color (Windows 8 picks black for light colors). */
export function captionInk(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#000";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 120 ? "#000" : "#fff";
}

const Body = memo(function Body({ Comp }: { Comp: ComponentType }) {
  return <Comp />;
});

export function Window({ win, z, focused, modal, Comp }: { win: Win; z: number; focused: boolean; modal: boolean; Comp: ComponentType }) {
  const { t, winColor } = useOS();
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean; x: number; y: number } | null>(null);
  const size = useRef<{ dir: string; x: number; y: number; r: { x: number; y: number; w: number; h: number } } | null>(null);
  const [zone, setZone] = useState<Zone>(null);
  const docked = win.max || !!win.snap;
  const def = win.app === "dialog" ? null : appDef(win.app);
  const title = win.title ?? (def ? t(def.title) : "");
  const isDialog = win.app === "dialog" || !!win.owner;

  const api = useMemo<WinApi>(
    () => ({
      id: win.id,
      win,
      focused,
      setTitle: (s) => wm.setTitle(win.id, s),
      close: () => wm.close(win.id),
      minimize: () => wm.minimize(win.id),
    }),
    [win, focused],
  );

  // ---- move ----
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // A docked window comes loose under the pointer at its normal size, like Aero Snap.
    const r = el.current?.getBoundingClientRect();
    const dx = docked && r ? Math.min(win.w - 60, Math.max(60, ((e.clientX - r.left) / r.width) * win.w)) : e.clientX - win.x;
    drag.current = { dx, dy: docked ? 12 : e.clientY - win.y, sx: e.clientX, sy: e.clientY, moved: false, x: win.x, y: win.y };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !el.current) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    if (!d.moved && docked) wm.patch(win.id, { max: false, snap: undefined });
    d.moved = true;
    d.x = Math.round(Math.max(-win.w + 100, Math.min(window.innerWidth - 100, e.clientX - d.dx)));
    d.y = Math.round(Math.max(0, Math.min(window.innerHeight - TASKBAR_H - 24, e.clientY - d.dy)));
    el.current.style.left = `${d.x}px`;
    el.current.style.top = `${d.y}px`;
    if (!win.fixed) setZone(snapZone(e.clientX, e.clientY));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    if (zone === "max") wm.patch(win.id, { x: d.x, y: Math.max(0, d.y), max: true });
    else if (zone) wm.patch(win.id, { x: d.x, y: d.y, snap: zone });
    else wm.patch(win.id, { x: d.x, y: d.y });
    setZone(null);
  };

  // ---- resize ----
  const startSize = (dir: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    wm.focus(win.id);
    size.current = { dir, x: e.clientX, y: e.clientY, r: { x: win.x, y: win.y, w: win.w, h: win.h } };
  };
  const onSize = (e: React.PointerEvent) => {
    const s = size.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const nw = Math.max(260, s.r.w + (s.dir.includes("e") ? dx : s.dir.includes("w") ? -dx : 0));
    const nh = Math.max(160, s.r.h + (s.dir.includes("s") ? dy : s.dir.includes("n") ? -dy : 0));
    wm.patch(win.id, { w: nw, h: nh, x: s.dir.includes("w") ? s.r.x + s.r.w - nw : s.r.x, y: s.dir.includes("n") ? Math.max(0, s.r.y + s.r.h - nh) : s.r.y });
  };

  const full = { top: 0, height: `calc(100% - ${TASKBAR_H}px)` };
  const style: React.CSSProperties = {
    zIndex: z,
    "--frame": winColor,
    "--caption-ink": captionInk(winColor),
    ...(win.max ? { ...full, left: 0, width: "100%" } : win.snap ? { ...full, left: win.snap === "left" ? 0 : "50%", width: "50%" } : { left: win.x, top: win.y, width: win.w, height: win.h }),
  } as unknown as React.CSSProperties;

  return (
    <>
      {zone && <div className={`snap-preview snap-${zone}`} style={{ zIndex: z }} />}
      <div
        ref={el}
        className={`w8-win ${focused ? "active" : "inactive"} ${win.min ? "min" : ""} ${docked ? "docked" : ""} ${win.max ? "maxed" : ""} ${isDialog ? "dialog" : ""} app-${win.app}`}
        style={style}
        onPointerDownCapture={() => !focused && wm.focus(win.id)}
        role="dialog"
        aria-label={title}
      >
        {!docked &&
          !win.fixed &&
          ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => (
            <div key={d} className={`rz rz-${d}`} onPointerDown={startSize(d)} onPointerMove={onSize} onPointerUp={() => (size.current = null)} />
          ))}
        <div className="w8-titlebar" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={() => wm.toggleMax(win.id)}>
          <span className="w8-titlebar-icon">{def && <AppIcon id={def.id} size={16} />}</span>
          <span className="w8-titlebar-text">{title}</span>
          <div className="w8-caption">
            {!isDialog && (
              <button className="w8-cap" onClick={() => wm.minimize(win.id)} aria-label={t("win.minimize")} title={t("win.minimize")}>
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path d="M0 8.5h10" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
            )}
            {!isDialog && (
              <button className="w8-cap" disabled={win.fixed} onClick={() => wm.toggleMax(win.id)} aria-label="maximize">
                {docked ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
                    <rect x="0.5" y="2.5" width="7" height="7" />
                    <path d="M2.5 2.5v-2h7v7h-2" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="0.5" y="0.5" width="9" height="9" />
                    <path d="M0.5 1.5h9" />
                  </svg>
                )}
              </button>
            )}
            <button className="w8-cap w8-cap-close" onClick={() => void wm.requestClose(win.id)} aria-label={t("win.close")} title={t("win.close")}>
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M1 1l8 8M9 1 1 9" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="w8-client">
          <WinCtx.Provider value={api}>
            <Body Comp={Comp} />
          </WinCtx.Provider>
          {modal && <div className="w8-modal-block" onPointerDown={() => wm.focus(win.id)} />}
        </div>
      </div>
    </>
  );
}
