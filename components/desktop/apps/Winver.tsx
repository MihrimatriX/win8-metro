"use client";
/** Winver (placeholder until the real program lands). */
import { useWindow } from "../ui";

export default function WinverApp() {
  const { win } = useWindow();
  return <div style={{ padding: 16, color: "#000", background: "#fff", height: "100%" }}>winver {win.arg ?? ""}</div>;
}
