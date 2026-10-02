"use client";
/** Camera (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function CameraApp({ param }: { param?: string }) {
  return <Hub title="Camera" sections={[{ id: "a", title: "camera", content: <p>{param ?? ""}</p> }]} />;
}
