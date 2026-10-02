"use client";
/** Minesweeper (placeholder until the real program lands). */
import { useWindow } from "../ui";

export default function MinesweeperApp() {
  const { win } = useWindow();
  return <div style={{ padding: 16, color: "#000", background: "#fff", height: "100%" }}>minesweeper {win.arg ?? ""}</div>;
}
