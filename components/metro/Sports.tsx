"use client";
/** Sports (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function SportsApp({ param }: { param?: string }) {
  return <Hub title="Sports" sections={[{ id: "a", title: "sports", content: <p>{param ?? ""}</p> }]} />;
}
