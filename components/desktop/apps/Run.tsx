"use client";
/** Run (placeholder until the real program lands). */
import { useWindow } from "../ui";

export default function RunApp() {
  const { win } = useWindow();
  return <div style={{ padding: 16, color: "#000", background: "#fff", height: "100%" }}>run {win.arg ?? ""}</div>;
}
