"use client";
/** Alarms (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function AlarmsApp({ param }: { param?: string }) {
  return <Hub title="Alarms" sections={[{ id: "a", title: "alarms", content: <p>{param ?? ""}</p> }]} />;
}
