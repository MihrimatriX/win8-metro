"use client";
/** Music: three generative tracks synthesized live, with a spectrum drawn from the audio itself. */
import { useEffect, useRef } from "react";
import { useOS, useTick } from "@/lib/os";
import { TRACKS, sound } from "@/lib/sound";
import { CoverArt } from "../CoverArt";
import { Icon } from "../Icons";
import { Hub } from "../AppHost";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Spectrum({ on }: { on: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const data = new Uint8Array(64);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = (c.width = c.clientWidth * devicePixelRatio);
      const h = (c.height = c.clientHeight * devicePixelRatio);
      ctx.clearRect(0, 0, w, h);
      const a = sound.analyser;
      if (a && on) a.getByteFrequencyData(data);
      else data.fill(0);
      const n = 40;
      const bw = w / n;
      for (let i = 0; i < n; i++) {
        const v = (data[i] ?? 0) / 255;
        const bh = Math.max(2 * devicePixelRatio, v * h);
        ctx.fillStyle = `rgba(255,255,255,${0.35 + v * 0.6})`;
        ctx.fillRect(i * bw + 1, h - bh, bw - 3, bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return <canvas className="spectrum" ref={canvas} />;
}

export function MusicApp() {
  const { t, track, trackStarted, playTrack } = useOS();
  const now = useTick(500);
  const idx = Math.max(0, TRACKS.findIndex((x) => x.id === track));
  const cur = TRACKS[idx];
  const playing = !!track;
  const elapsed = playing ? ((now - trackStarted) / 1000) % cur.seconds : 0;

  const hero = (
    <div className="music-now" style={{ background: cur.palette[0] }}>
      <CoverArt className="music-bg" seed={cur.id} motif="waves" palette={cur.palette} animated={playing} />
      <div className="music-now-inner">
        <div className="music-cover">
          <CoverArt seed={cur.id} motif="rings" palette={cur.palette} animated={playing} />
        </div>
        <div className="music-meta">
          <small>{playing ? t("music.nowPlaying") : t("music.idle")}</small>
          <h2>{cur.title}</h2>
          <span>
            {cur.artist} · {t("music.album")}
          </span>
          <Spectrum on={playing} />
          <div className="music-progress">
            <span>{mmss(elapsed)}</span>
            <span className="bar">
              <i style={{ width: `${(elapsed / cur.seconds) * 100}%` }} />
            </span>
            <span>{mmss(cur.seconds)}</span>
          </div>
          <div className="music-controls">
            <button className="circle-btn" onClick={() => playTrack(TRACKS[(idx + TRACKS.length - 1) % TRACKS.length].id)} aria-label="prev">
              <Icon name="prev" size={20} />
            </button>
            <button className="circle-btn big" onClick={() => playTrack(playing ? null : cur.id)} aria-label={playing ? t("music.pause") : t("music.play")}>
              <Icon name={playing ? "pause" : "play"} size={26} />
            </button>
            <button className="circle-btn" onClick={() => playTrack(TRACKS[(idx + 1) % TRACKS.length].id)} aria-label="next">
              <Icon name="next" size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Hub
      title={t("app.music")}
      className="music"
      hero={hero}
      sections={[
        {
          id: "collection",
          title: t("music.collection"),
          content: (
            <div className="tracks">
              {TRACKS.map((x, i) => (
                <button key={x.id} className={`track ${track === x.id ? "on" : ""}`} onClick={() => playTrack(track === x.id ? null : x.id)} data-nav>
                  <span className="track-art">
                    <CoverArt seed={x.id} motif="rings" palette={x.palette} />
                    <Icon name={track === x.id ? "pause" : "play"} size={18} />
                  </span>
                  <span className="track-text">
                    <strong>
                      {i + 1}. {x.title}
                    </strong>
                    <small>
                      {x.artist} · {x.bpm} BPM
                    </small>
                  </span>
                  <span className="track-time">{mmss(x.seconds)}</span>
                </button>
              ))}
              <p className="dim small">{t("music.note")}</p>
            </div>
          ),
        },
      ]}
    />
  );
}
