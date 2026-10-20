"use client";
/** SkyDrive (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function SkyDriveApp({ param }: { param?: string }) {
  return <Hub title="SkyDrive" sections={[{ id: "a", title: "skydrive", content: <p>{param ?? ""}</p> }]} />;
}
