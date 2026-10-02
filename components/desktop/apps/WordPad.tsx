"use client";
/** WordPad (placeholder until the real program lands). */
import { useWindow } from "../ui";

export default function WordPadApp() {
  const { win } = useWindow();
  return <div style={{ padding: 16, color: "#000", background: "#fff", height: "100%" }}>wordpad {win.arg ?? ""}</div>;
}
