"use client";
/** Calc (placeholder until the real program lands). */
import { useWindow } from "../ui";

export default function CalcApp() {
  const { win } = useWindow();
  return <div style={{ padding: 16, color: "#000", background: "#fff", height: "100%" }}>calc {win.arg ?? ""}</div>;
}
