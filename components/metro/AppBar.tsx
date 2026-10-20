"use client";
/**
 * The Metro app bar: a strip of round command buttons at the bottom of an app.
 * Hidden until the user right-clicks inside the app, swipes up from the bottom edge, or presses Win+Z / Ctrl+Space.
 * Reuses the Start screen's .appbar styles from globals.css.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { IconName } from "@/lib/model";
import { Icon } from "../Icons";

export type AppBarCmd = {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  hidden?: boolean;
};

export function AppBar({
  left = [],
  right = [],
  sticky,
  children,
  className,
}: {
  left?: AppBarCmd[];
  right?: AppBarCmd[];
  sticky?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Right click anywhere in the running app toggles the bar (inputs keep their own menu).
    const host = bar.current?.closest(".app") ?? document.body;
    const onCtx = (e: Event) => {
      const tg = e.target as HTMLElement;
      if (tg.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    const onDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node) && e.button === 0) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey && e.key.toLowerCase() === "z") || (e.ctrlKey && e.key === " ")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    let startY: number | null = null;
    const ts = (e: TouchEvent) =>
      (startY = e.touches[0].clientY > window.innerHeight - 30 ? e.touches[0].clientY : null);
    const te = (e: TouchEvent) => {
      if (startY !== null && startY - e.changedTouches[0].clientY > 30) setOpen(true);
      startY = null;
    };
    host.addEventListener("contextmenu", onCtx);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", ts, { passive: true });
    window.addEventListener("touchend", te, { passive: true });
    return () => {
      host.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", ts);
      window.removeEventListener("touchend", te);
    };
  }, []);

  const btn = (c: AppBarCmd) =>
    c.hidden ? null : (
      <button
        key={c.label}
        className={c.active ? "on" : undefined}
        disabled={c.disabled}
        onClick={() => {
          c.onClick();
          if (!sticky) setOpen(false);
        }}
      >
        <Icon name={c.icon} size={20} />
        <span>{c.label}</span>
      </button>
    );

  return (
    <div
      ref={bar}
      className={`appbar metro-appbar ${open || sticky ? "open" : ""} ${className ?? ""}`}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className="appbar-left">{left.map(btn)}</div>
      {children}
      <div className="appbar-right">{right.map(btn)}</div>
    </div>
  );
}
