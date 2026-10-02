"use client";
/** Control (placeholder until the real program lands). */
import { useWindow } from "../ui";

export default function ControlApp() {
  const { win } = useWindow();
  return <div style={{ padding: 16, color: "#000", background: "#fff", height: "100%" }}>control {win.arg ?? ""}</div>;
}
