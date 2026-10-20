"use client";
/** Video (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function VideoApp({ param }: { param?: string }) {
  return <Hub title="Video" sections={[{ id: "a", title: "video", content: <p>{param ?? ""}</p> }]} />;
}
