import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-static";
export const alt = `${SITE_NAME}: tarayıcıda çalışan Windows 8.1 Başlangıç ekranı`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// [label, color, wide?] in Start-screen order; rendered as two rows of Metro tiles.
const TILES: [string, string, boolean?][] = [
  ["Posta", "#0072c6", true],
  ["Takvim", "#7e38b7"],
  ["Fotoğraflar", "#00a0b1"],
  ["Masaüstü", "#2672ec", true],
  ["Müzik", "#e3008c"],
  ["Internet Explorer", "#1e8bcf", true],
  ["Projeler", "#008a00"],
  ["Ayarlar", "#5b3bd1", true],
];

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "56px 80px",
        background: "linear-gradient(135deg, #1b0f4a, #2d1a73)",
        color: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 72, fontWeight: 300 }}>Başlangıç</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32 }}>
          AFU
          <div style={{ width: 52, height: 52, background: "#5b3bd1" }} />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, width: 1040, marginTop: 44 }}>
        {TILES.map(([label, color, wide]) => (
          <div
            key={label}
            style={{
              width: wide ? 300 : 144,
              height: 144,
              background: color,
              display: "flex",
              alignItems: "flex-end",
              padding: 12,
              fontSize: 22,
            }}
          >
            {label}
          </div>
        ))}
      </div>
      <div style={{ marginTop: "auto", fontSize: 30, opacity: 0.85 }}>
        Canlı kutucuklar, charm çubuğu, pencereli masaüstü — hepsi tarayıcıda.
      </div>
    </div>,
    size,
  );
}
