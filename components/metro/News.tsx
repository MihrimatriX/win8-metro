"use client";
/** News (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function NewsApp({ param }: { param?: string }) {
  return <Hub title="News" sections={[{ id: "a", title: "news", content: <p>{param ?? ""}</p> }]} />;
}
