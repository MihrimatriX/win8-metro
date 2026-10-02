"use client";
/** Explorer (placeholder until the real program lands). */
import { useWindow } from "../ui";

export default function ExplorerApp() {
  const { win } = useWindow();
  return <div style={{ padding: 16, color: "#000", background: "#fff", height: "100%" }}>explorer {win.arg ?? ""}</div>;
}
