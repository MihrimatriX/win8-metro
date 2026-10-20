"use client";
/** Weather (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function WeatherApp({ param }: { param?: string }) {
  return <Hub title="Weather" sections={[{ id: "a", title: "weather", content: <p>{param ?? ""}</p> }]} />;
}
