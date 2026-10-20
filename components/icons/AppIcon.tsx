"use client";
import { app, type AppId } from "@/lib/model";
import { Icon } from "../Icons";
import { ShellIcon } from "./ShellIcons";

/** An app's icon: the Metro glyph for Store apps, the colorful Win32 icon for desktop programs. */
export function AppIcon({
  id,
  size = 24,
  className,
  strokeWidth,
}: {
  id: AppId;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const a = app(id);
  if (a.kind === "desktop" && a.shell) return <ShellIcon name={a.shell} size={size} className={className} />;
  return <Icon name={a.icon} size={size} className={className} strokeWidth={strokeWidth} />;
}
