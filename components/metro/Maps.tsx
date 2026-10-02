"use client";
/** Maps (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function MapsApp({ param }: { param?: string }) {
  return <Hub title="Maps" sections={[{ id: "a", title: "maps", content: <p>{param ?? ""}</p> }]} />;
}
