"use client";
/**
 * Colorful desktop (Win32) icons in the Windows 8 style: folders, drives, programs and file types.
 * All original SVG drawings on a 48×48 canvas. Gradient ids are made unique per instance with useId.
 */
import { useId } from "react";
import type { ShellIconName } from "@/lib/model";

export function ShellIcon({ name, size = 32, className }: { name: ShellIconName; size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#e8b33c" />
        </linearGradient>
      </defs>
      <rect x="6" y="10" width="36" height="28" rx="2" fill={`url(#${uid}g)`} stroke="#b8862a" />
      <text x="24" y="29" textAnchor="middle" fontSize="9" fill="#5a4310">
        {name.slice(0, 4)}
      </text>
    </svg>
  );
}
