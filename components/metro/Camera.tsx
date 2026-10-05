"use client";
/**
 * Camera (Kamera): the Windows 8.1 camera app on top of getUserMedia.
 * Full-screen live preview, round photo / video / panorama buttons on the right, the camera roll behind the left edge,
 * and the app bar's options, self-timer and camera switch. Photos go to Pictures\Film Rulosu in the VFS;
 * videos stay in memory for the session (object URLs) and can be downloaded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useL, useOS } from "@/lib/os";
import { sound } from "@/lib/sound";
import { KNOWN, fs, join, useFS } from "@/lib/fs";
import { Icon } from "../Icons";
import { AppBar, type AppBarCmd } from "./AppBar";
import {
  download,
  fileStamp,
  hms,
  mediaError,
  mediaStore,
  mimeExt,
  recorderMime,
  stopStream,
  useSessionMedia,
} from "./mediaStore";
import "./camera.css";

/** Where Windows 8.1 (Turkish) keeps camera pictures. */
export const CAMERA_ROLL = `${KNOWN.pictures}\\Film Rulosu`;

type Status = "starting" | "live" | "denied" | "missing";
type RollItem = {
  key: string;
  kind: "photo" | "video";
  name: string;
  url: string;
  created: number;
  path?: string;
  mediaId?: string;
  duration?: number;
  poster?: string;
};
type Res = { w: number; h: number };

const PRESETS: Res[] = [
  { w: 3840, h: 2160 },
  { w: 1920, h: 1080 },
  { w: 1280, h: 720 },
  { w: 1024, h: 768 },
  { w: 960, h: 540 },
  { w: 640, h: 480 },
  { w: 320, h: 240 },
];

/** Camcorder glyph for the video button (Segoe-like: body + lens wedge). */
function Camcorder({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="2.5" y="7" width="12.5" height="10" rx="1" />
      <path d="M15 10.6 21.5 7.2v9.6L15 13.4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Panorama glyph: a wide, slightly curved frame. */
function Panorama({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M2.5 7.2c6.3-1.8 12.7-1.8 19 0v9.6c-6.3-1.8-12.7-1.8-19 0z" />
      <path d="m6 14.5 3.5-3.5 3 3 2-2 3.5 3.5" strokeWidth="1.3" />
    </svg>
  );
}

export function CameraApp() {
  const { lang } = useOS();
  const L = useL();
  const fsv = useFS();
  const videoEl = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>(() => (navigator.mediaDevices ? "starting" : "missing"));
  const [attempt, setAttempt] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [rec, setRec] = useState<{ start: number; recorder: MediaRecorder | null; mic: MediaStream | null } | null>(
    null,
  );
  const [now, setNow] = useState(0);
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(0);
  const [pop, setPop] = useState(0);
  const [roll, setRoll] = useState<number | null>(null);
  const [options, setOptions] = useState(false);
  const [grid, setGrid] = useState(false);
  const [withAudio, setWithAudio] = useState(true);
  const [resList, setResList] = useState<Res[]>([]);
  const [res, setRes] = useState<Res | null>(null);
  const countTimer = useRef(0);

  // ---- the camera stream ----
  useEffect(() => {
    let cancelled = false;
    const md = navigator.mediaDevices;
    if (!md) return;
    const video: MediaTrackConstraints = deviceId
      ? { deviceId: { exact: deviceId } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };
    md.getUserMedia({ video, audio: false })
      .then(async (s) => {
        if (cancelled) {
          stopStream(s);
          return;
        }
        stream.current = s;
        const v = videoEl.current;
        if (v) {
          v.srcObject = s;
          v.play().catch(() => {});
        }
        setStatus("live");
        const track = s.getVideoTracks()[0];
        // Resolutions this camera can do (Chrome exposes capabilities; others just get the current one).
        const caps = track?.getCapabilities?.();
        const set = track?.getSettings();
        const maxW = caps?.width?.max ?? set?.width ?? 640;
        const maxH = caps?.height?.max ?? set?.height ?? 480;
        const list = PRESETS.filter((p) => p.w <= maxW && p.h <= maxH);
        if (set?.width && set.height && !list.some((p) => p.w === set.width && p.h === set.height))
          list.unshift({ w: set.width, h: set.height });
        setResList(list);
        setRes(set?.width && set.height ? { w: set.width, h: set.height } : null);
        const all = await md.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
        if (!cancelled) setDevices(all.filter((d) => d.kind === "videoinput"));
      })
      .catch((e) => {
        if (!cancelled) setStatus(mediaError(e));
      });
    return () => {
      cancelled = true;
      stopStream(stream.current);
      stream.current = null;
    };
  }, [deviceId, attempt]);

  // Stop a running recording if the app closes.
  const recRef = useRef(rec);
  recRef.current = rec;
  useEffect(
    () => () => {
      const r = recRef.current;
      arming.current = false;
      if (r?.recorder && r.recorder.state !== "inactive") r.recorder.stop();
      window.clearInterval(countTimer.current);
    },
    [],
  );

  // Recording clock.
  useEffect(() => {
    if (!rec) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [rec]);

  // ---- camera roll: photos on disk + this session's videos ----
  const vids = useSessionMedia((m) => m.source === "camera" && m.kind === "video");
  const items = useMemo<RollItem[]>(() => {
    void fsv;
    const photos: RollItem[] = fs
      .list(CAMERA_ROLL)
      .filter((n) => n.kind === "img" && n.data)
      .map((n) => ({
        key: `p:${n.name}`,
        kind: "photo",
        name: n.name,
        url: n.data!,
        created: n.created,
        path: join(CAMERA_ROLL, n.name),
      }));
    const videos: RollItem[] = vids.map((m) => ({
      key: `v:${m.id}`,
      kind: "video",
      name: m.name,
      url: m.url,
      created: m.created,
      mediaId: m.id,
      duration: m.duration,
      poster: m.poster,
    }));
    return [...photos, ...videos].sort((a, b) => b.created - a.created);
  }, [fsv, vids]);

  // ---- capture ----
  const frame = useCallback((maxW: number, type: "image/jpeg" | "image/png" = "image/jpeg", q = 0.86) => {
    const v = videoEl.current;
    if (!v || !v.videoWidth) return null;
    const scale = Math.min(1, maxW / v.videoWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const g = c.getContext("2d");
    if (!g) return null;
    g.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL(type, q);
  }, []);

  const takePhoto = useCallback(() => {
    // JPEG like the real app; kept under ~450 KB so the localStorage-backed VFS stays healthy.
    let data = frame(1280);
    if (data && data.length > 450_000) data = frame(960, "image/jpeg", 0.75);
    if (data && data.length > 450_000) data = frame(640, "image/jpeg", 0.7);
    if (!data) return;
    sound.tap();
    setFlash((f) => f + 1);
    fs.mkdir(CAMERA_ROLL);
    const name = fs.uniqueName(CAMERA_ROLL, `WIN_${fileStamp()}.jpg`);
    fs.write(join(CAMERA_ROLL, name), { data, size: Math.round(data.length * 0.75) });
    setPop((p) => p + 1);
  }, [frame]);

  /** Start recording: the button turns red at once, the recorder starts as soon as the microphone answers. */
  const arming = useRef(false);
  const startVideo = useCallback(async () => {
    const s = stream.current;
    if (!s || typeof MediaRecorder === "undefined") return;
    arming.current = true;
    sound.tap();
    setRec({ start: Date.now(), recorder: null, mic: null });
    let mic: MediaStream | null = null;
    if (withAudio) mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!arming.current) {
      // Stopped before it really started.
      stopStream(mic);
      return;
    }
    arming.current = false;
    const tracks = [...s.getVideoTracks(), ...(mic?.getAudioTracks() ?? [])];
    const mime = recorderMime("video");
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : undefined);
    } catch {
      stopStream(mic);
      setRec(null);
      return;
    }
    const chunks: Blob[] = [];
    const poster = frame(320, "image/jpeg", 0.7) ?? undefined;
    const started = Date.now();
    const stamp = fileStamp();
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stopStream(mic);
      const type = recorder.mimeType || mime || "video/webm";
      const blob = new Blob(chunks, { type });
      if (!blob.size) return;
      mediaStore.add({
        kind: "video",
        source: "camera",
        name: `WIN_${stamp}.${mimeExt(type, "mp4")}`,
        url: URL.createObjectURL(blob),
        blob,
        poster,
        created: started,
        duration: Date.now() - started,
      });
      setPop((p) => p + 1);
    };
    recorder.start(1000);
    setRec({ start: started, recorder, mic });
  }, [frame, withAudio]);

  const stopVideo = useCallback(() => {
    const r = recRef.current;
    arming.current = false;
    if (!r) return;
    if (r.recorder && r.recorder.state !== "inactive") r.recorder.stop();
    sound.tap();
    setRec(null);
  }, []);

  /** Press the shutter for the current mode, through the self-timer when one is set. */
  const shutter = useCallback(
    (which: "photo" | "video") => {
      if (status !== "live" || count !== null) return;
      setMode(which);
      if (which === "video" && recRef.current) {
        stopVideo();
        return;
      }
      const go = () => (which === "photo" ? takePhoto() : void startVideo());
      if (!timer) {
        go();
        return;
      }
      let n = timer;
      setCount(n);
      sound.tap();
      countTimer.current = window.setInterval(() => {
        n -= 1;
        if (n <= 0) {
          window.clearInterval(countTimer.current);
          setCount(null);
          go();
        } else {
          setCount(n);
          sound.tap();
        }
      }, 1000);
    },
    [status, count, timer, takePhoto, startVideo, stopVideo],
  );

  const cancelCount = () => {
    window.clearInterval(countTimer.current);
    setCount(null);
  };

  // Space / Enter press the shutter, like a hardware camera button.
  useEffect(() => {
    if (roll !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        shutter(recRef.current ? "video" : mode);
      }
      if (e.key === "Escape" && count !== null) cancelCount();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roll, shutter, mode, count]);

  const switchCamera = () => {
    if (devices.length < 2) return;
    const cur = stream.current?.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;
    const i = devices.findIndex((d) => d.deviceId === cur);
    setDeviceId(devices[(i + 1) % devices.length].deviceId);
    setStatus("starting");
  };

  const applyRes = (r: Res) => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    track
      .applyConstraints({ width: { ideal: r.w }, height: { ideal: r.h } })
      .then(() => {
        const s = track.getSettings();
        setRes(s.width && s.height ? { w: s.width, h: s.height } : r);
      })
      .catch(() => {});
  };

  // Swipe right on the preview opens the camera roll (as in Windows 8.1).
  const swipe = useRef<{ x: number; y: number } | null>(null);

  // ---- roll viewer ----
  const cur = roll !== null ? items[Math.min(roll, items.length - 1)] : null;
  if (roll !== null && !items.length) setRoll(null);
  useEffect(() => {
    if (roll === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setRoll((r) => Math.max(0, (r ?? 0) - 1));
      if (e.key === "ArrowLeft") setRoll((r) => Math.min(items.length - 1, (r ?? 0) + 1));
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setRoll(null);
      }
      if (e.key === "Delete") removeCur();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function removeCur() {
    if (!cur) return;
    if (cur.path) fs.remove(cur.path);
    if (cur.mediaId) mediaStore.remove(cur.mediaId);
    sound.recycle();
  }

  const recMs = rec ? Math.max(0, now - rec.start) : 0;
  const latest = items[0];

  const bar: { left: AppBarCmd[]; right: AppBarCmd[] } =
    roll !== null
      ? {
          left: [
            { icon: "trash", label: L({ tr: "Sil", en: "Delete" }), onClick: removeCur, disabled: !cur },
            {
              icon: "save",
              label: L({ tr: "İndir", en: "Download" }),
              onClick: () => cur && download(cur.url, cur.name),
              disabled: !cur,
            },
          ],
          right: [
            { icon: "camera", label: L({ tr: "Kameraya dön", en: "Back to camera" }), onClick: () => setRoll(null) },
          ],
        }
      : {
          left: [
            {
              icon: "settings",
              label: L({ tr: "Kamera seçenekleri", en: "Camera options" }),
              onClick: () => setOptions((o) => !o),
              disabled: status !== "live",
            },
            {
              icon: "timer",
              label: timer
                ? `${L({ tr: "Zamanlayıcı", en: "Timer" })} · ${timer} ${L({ tr: "sn", en: "s" })}`
                : L({ tr: "Zamanlayıcı", en: "Timer" }),
              onClick: () => setTimer((t) => (t === 0 ? 3 : t === 3 ? 10 : 0)),
              active: timer > 0,
            },
          ],
          right: [
            {
              icon: "camera-switch",
              label: L({ tr: "Kamerayı değiştir", en: "Change camera" }),
              onClick: switchCamera,
              disabled: devices.length < 2 || !!rec,
            },
            {
              icon: "photos",
              label: L({ tr: "Film rulosu", en: "Camera roll" }),
              onClick: () => items.length && setRoll(0),
              disabled: !items.length,
            },
          ],
        };

  return (
    <div
      className={`cam ${rec ? "cam-recording" : ""}`}
      onPointerDown={(e) => {
        if (e.button === 0 && !(e.target as HTMLElement).closest("button, select, .cam-options"))
          swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (s && roll === null && items.length && e.clientX - s.x > 120 && Math.abs(e.clientY - s.y) < 80) setRoll(0);
      }}
    >
      <video
        ref={videoEl}
        className={`cam-preview ${status === "live" && roll === null ? "on" : ""}`}
        muted
        playsInline
        autoPlay
      />
      {status === "live" && grid && (
        <div className="cam-grid" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      )}

      {status === "starting" && (
        <div className="cam-starting" aria-label={L({ tr: "Kamera başlatılıyor", en: "Starting the camera" })}>
          <span className="cam-dots">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      )}

      {(status === "denied" || status === "missing") && (
        <div className="cam-msg">
          <Icon name="camera" size={92} strokeWidth={1.1} />
          <h2>
            {status === "missing"
              ? L({ tr: "Kameranızı bağlayın", en: "Connect your camera" })
              : L({
                  tr: "Bu uygulamanın web kameranızı kullanmasına izin verin.",
                  en: "Let this app use your webcam.",
                })}
          </h2>
          <p>
            {status === "missing"
              ? L({
                  tr: "Kamera bulunamadı. Bir web kamerası bağlayın veya açın, ardından yeniden deneyin.",
                  en: "We can't find your camera. Connect or turn on a webcam, then try again.",
                })
              : L({
                  tr: "Kamera erişimi engellendi. Tarayıcının adres çubuğundaki kamera simgesinden izin verin, ardından yeniden deneyin.",
                  en: "Camera access is blocked. Allow it from the camera icon in the browser's address bar, then try again.",
                })}
          </p>
          <button
            className="cam-retry"
            onClick={() => {
              setStatus("starting");
              setAttempt((a) => a + 1);
            }}
          >
            {L({ tr: "Yeniden dene", en: "Try again" })}
          </button>
        </div>
      )}

      {flash > 0 && <div key={flash} className="cam-flash" />}

      {count !== null && (
        <button className="cam-count" key={count} onClick={cancelCount} aria-label={L({ tr: "İptal", en: "Cancel" })}>
          {count}
        </button>
      )}

      {rec && (
        <div className="cam-rectime" role="timer">
          <i />
          {hms(recMs)}
        </div>
      )}

      {timer > 0 && status === "live" && !rec && count === null && (
        <div className="cam-badge">
          <Icon name="timer" size={16} />
          {timer} {L({ tr: "sn", en: "s" })}
        </div>
      )}

      {/* Capture buttons: the current mode's button is the big one. */}
      <div className="cam-controls">
        <button
          className={`cam-btn video ${mode === "video" ? "main" : ""} ${rec ? "rec" : ""}`}
          onClick={() => shutter("video")}
          disabled={status !== "live"}
          aria-label={rec ? L({ tr: "Kaydı durdur", en: "Stop recording" }) : L({ tr: "Video", en: "Video" })}
          title={rec ? L({ tr: "Kaydı durdur", en: "Stop recording" }) : L({ tr: "Video", en: "Video" })}
        >
          {rec ? <Icon name="stop" size={26} /> : <Camcorder size={mode === "video" ? 34 : 26} />}
        </button>
        {!rec && (
          <button
            className={`cam-btn photo ${mode === "photo" ? "main" : ""}`}
            onClick={() => shutter("photo")}
            disabled={status !== "live"}
            aria-label={L({ tr: "Fotoğraf", en: "Photo" })}
            title={L({ tr: "Fotoğraf", en: "Photo" })}
          >
            <Icon name="camera" size={mode === "photo" ? 36 : 26} strokeWidth={1.4} />
          </button>
        )}
        {!rec && (
          <button
            className="cam-btn pano"
            disabled
            aria-label={L({ tr: "Panorama", en: "Panorama" })}
            title={L({ tr: "Panorama (bu kamerada kullanılamıyor)", en: "Panorama (not available on this camera)" })}
          >
            <Panorama />
          </button>
        )}
      </div>

      {/* Camera roll behind the left edge. */}
      {latest && roll === null && (
        <button
          className="cam-rollbtn"
          onClick={() => setRoll(0)}
          aria-label={L({ tr: "Film rulosu", en: "Camera roll" })}
          title={L({ tr: "Film rulosu", en: "Camera roll" })}
        >
          <Icon name="back" size={22} />
          <span key={pop} className="cam-rollthumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={latest.kind === "photo" ? latest.url : (latest.poster ?? "")} alt="" />
            {latest.kind === "video" && <Camcorder size={14} />}
          </span>
        </button>
      )}

      {options && status === "live" && (
        <div className="cam-options" onPointerDown={(e) => e.stopPropagation()}>
          <h3>{L({ tr: "Kamera seçenekleri", en: "Camera options" })}</h3>
          <label>
            <span>{L({ tr: "Fotoğraf ve video çözünürlüğü", en: "Photo and video resolution" })}</span>
            <select
              value={res ? `${res.w}x${res.h}` : ""}
              onChange={(e) => {
                const [w, h] = e.target.value.split("x").map(Number);
                applyRes({ w, h });
              }}
            >
              {resList.map((r) => (
                <option key={`${r.w}x${r.h}`} value={`${r.w}x${r.h}`}>
                  {r.w}×{r.h} (
                  {((r.w * r.h) / 1e6).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", { maximumFractionDigits: 1 })}{" "}
                  MP) {Math.abs(r.w / r.h - 16 / 9) < 0.02 ? "16:9" : Math.abs(r.w / r.h - 4 / 3) < 0.02 ? "4:3" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="cam-opt-row">
            <span>{L({ tr: "Kılavuz çizgileri", en: "Grid lines" })}</span>
            <button
              className={`cam-toggle ${grid ? "on" : ""}`}
              onClick={() => setGrid((g) => !g)}
              role="switch"
              aria-checked={grid}
            >
              <i />
            </button>
            <small>{grid ? L({ tr: "Açık", en: "On" }) : L({ tr: "Kapalı", en: "Off" })}</small>
          </div>
          <div className="cam-opt-row">
            <span>{L({ tr: "Videoda ses kaydet", en: "Record audio with video" })}</span>
            <button
              className={`cam-toggle ${withAudio ? "on" : ""}`}
              onClick={() => setWithAudio((a) => !a)}
              role="switch"
              aria-checked={withAudio}
            >
              <i />
            </button>
            <small>{withAudio ? L({ tr: "Açık", en: "On" }) : L({ tr: "Kapalı", en: "Off" })}</small>
          </div>
          <button className="cam-opt-close" onClick={() => setOptions(false)}>
            {L({ tr: "Tamam", en: "OK" })}
          </button>
        </div>
      )}

      {cur && roll !== null && (
        <div className="cam-roll" onClick={() => setOptions(false)}>
          <div className={`cam-roll-stage ${cur.kind}`} key={cur.key}>
            {cur.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cur.url} alt={cur.name} />
            ) : (
              <video
                src={cur.url}
                controls
                autoPlay
                poster={cur.poster}
                ref={(v) => void (v && (v.volume = sound.level))}
              />
            )}
          </div>
          <header className="cam-roll-head">
            <button
              className="circle-btn"
              onClick={() => setRoll(null)}
              aria-label={L({ tr: "Kameraya dön", en: "Back to camera" })}
            >
              <Icon name="back" size={20} />
            </button>
            <div>
              <b>{cur.name}</b>
              <small>
                {new Date(cur.created).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
                {cur.duration ? ` · ${hms(cur.duration)}` : ""}
              </small>
            </div>
            <span className="cam-roll-count">
              {roll + 1} / {items.length}
            </span>
          </header>
          {roll < items.length - 1 && (
            <button
              className="cam-roll-nav prev"
              onClick={() => setRoll(roll + 1)}
              aria-label={L({ tr: "Önceki", en: "Previous" })}
            >
              <Icon name="back" size={22} />
            </button>
          )}
          {roll > 0 && (
            <button
              className="cam-roll-nav next"
              onClick={() => setRoll(roll - 1)}
              aria-label={L({ tr: "Sonraki", en: "Next" })}
            >
              <Icon name="forward" size={22} />
            </button>
          )}
          <div className="cam-strip">
            {items.map((it, i) => (
              <button key={it.key} className={i === roll ? "on" : ""} onClick={() => setRoll(i)} title={it.name}>
                {it.kind === "photo" || it.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob: URLs, next/image can't optimize them
                  <img src={it.kind === "photo" ? it.url : it.poster} alt="" />
                ) : (
                  <span />
                )}
                {it.kind === "video" && (
                  <em>
                    <Camcorder size={12} />
                    {it.duration ? hms(it.duration).slice(3) : ""}
                  </em>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <AppBar left={bar.left} right={bar.right} />
    </div>
  );
}
