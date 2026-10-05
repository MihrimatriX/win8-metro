"use client";
import { fs, useFS, type ArtSpec } from "@/lib/fs";
import { CoverArt } from "../CoverArt";

const DEFAULT_ART: ArtSpec = { seed: "wallpaper", motif: "dunes", palette: ["#0b1a3a", "#1e4fa8", "#7dd3fc"] };

/** The desktop background for a wallpaper setting: a solid color, a saved picture or generated art. */
export function Wallpaper({ value, className, animated }: { value: string; className?: string; animated?: boolean }) {
  useFS();
  if (value.startsWith("color:")) return <div className={className} style={{ background: value.slice(6) }} />;
  const n = fs.get(value);
  if (n?.data)
    return (
      <div className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={n.data} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  const art = n?.art ?? DEFAULT_ART;
  return (
    <CoverArt
      className={className}
      seed={art.seed}
      motif={art.motif}
      palette={art.palette}
      variant={art.variant}
      animated={animated}
    />
  );
}
