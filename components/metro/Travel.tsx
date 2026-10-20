"use client";
/** Travel (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function TravelApp({ param }: { param?: string }) {
  return <Hub title="Travel" sections={[{ id: "a", title: "travel", content: <p>{param ?? ""}</p> }]} />;
}
