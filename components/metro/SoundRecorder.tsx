"use client";
/** SoundRecorder (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function SoundRecorderApp({ param }: { param?: string }) {
  return <Hub title="SoundRecorder" sections={[{ id: "a", title: "soundrec", content: <p>{param ?? ""}</p> }]} />;
}
