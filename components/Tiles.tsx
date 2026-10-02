"use client";
/** Tile faces: what every tile shows at each size, including the live (flipping / peeking) content. */
import { useEffect, useState, type ReactNode } from "react";
import { useOS, useTick, type View } from "@/lib/os";
import { dayName, monthName, pick } from "@/lib/i18n";
import { VISITOR_ACHIEVEMENTS, app, parseKey, socialColor, socialIcon, type IconName, type TileSize } from "@/lib/model";
import { TRACKS } from "@/lib/sound";
import { media, profile, projects, socials } from "@/content/portfolio";
import { inbox } from "@/content/mailbox";
import { CoverArt } from "./CoverArt";
import { Icon } from "./Icons";

export type TileMeta = { title: string; color: string; icon: IconName; view?: View; url?: string };

export function useTileMeta() {
  const { t, lang } = useOS();
  return (key: string): TileMeta => {
    const ref = parseKey(key);
    if (ref.kind === "app") {
      const a = app(ref.id);
      return { title: t(a.title), color: a.color, icon: a.icon, view: { kind: "app", app: ref.id } };
    }
    if (ref.kind === "project") {
      const p = projects.find((x) => x.id === ref.id)!;
      return { title: p?.title ?? ref.id, color: p?.palette[1] ?? "#333", icon: "projects", view: { kind: "app", app: "projects", param: ref.id } };
    }
    const s = socials.find((x) => x.id === ref.id)!;
    return { title: s?.label === "E-posta" && lang === "en" ? "Email" : s?.label ?? ref.id, color: socialColor(ref.id), icon: socialIcon(ref.id), url: s?.url };
  };
}

/** Cycles 0..n-1 on a per-tile rhythm so tiles don't all flip at once. */
function useCycle(n: number, on: boolean, seed: string) {
  const [i, setI] = useState(0);
  const { motion } = useOS();
  useEffect(() => {
    if (!on || n < 2 || motion === "reduced") return;
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 9973;
    const period = 5200 + (h % 7) * 900;
    let timer = 0;
    const startId = window.setTimeout(() => {
      setI((x) => (x + 1) % n);
      timer = window.setInterval(() => setI((x) => (x + 1) % n), period);
    }, 1500 + (h % 13) * 420);
    return () => {
      window.clearTimeout(startId);
      window.clearInterval(timer);
    };
  }, [n, on, seed, motion]);
  return i;
}

/** Vertical "peek" strip: faces slide up one after another. */
function Peek({ faces, index }: { faces: ReactNode[]; index: number }) {
  return (
    <div className="peek" style={{ transform: `translateY(${-index * 100}%)` }}>
      {faces.map((f, k) => (
        <div className="peek-face" key={k}>
          {f}
        </div>
      ))}
    </div>
  );
}

/** 3D flip between faces around the horizontal axis. */
function Flip({ faces, index }: { faces: ReactNode[]; index: number }) {
  return (
    <div className="flip">
      {faces.map((f, k) => (
        <div className={`flip-face ${k === index ? "on" : ""} ${k === (index + faces.length - 1) % faces.length ? "was" : ""}`} key={k}>
          {f}
        </div>
      ))}
    </div>
  );
}

const IconFace = ({ icon, size }: { icon: IconName; size: TileSize }) => (
  <div className="tile-icon">
    <Icon name={icon} size={size === "small" ? 30 : size === "medium" ? 52 : 60} strokeWidth={1.4} />
  </div>
);

export function TileFace({ tileKey, size, live }: { tileKey: string; size: TileSize; live: boolean }) {
  const ref = parseKey(tileKey);
  if (ref.kind === "project") return <ProjectFace id={ref.id} size={size} live={live} />;
  if (ref.kind === "social") return <SocialFace id={ref.id} size={size} />;
  switch (ref.id) {
    case "profile":
      return <ProfileFace size={size} live={live} />;
    case "mail":
      return <MailFace size={size} live={live} />;
    case "calendar":
      return <CalendarFace size={size} live={live} />;
    case "achievements":
      return <AchievementsFace size={size} live={live} />;
    case "desktop":
      return <DesktopFace size={size} />;
    case "music":
      return <MusicFace size={size} live={live} />;
    case "projects":
      return <ProjectsFace size={size} live={live} />;
    case "reader":
      return <ReaderFace size={size} live={live} />;
    case "photos":
      return <PhotosFace size={size} live={live} />;
    default:
      return <IconFace icon={app(ref.id).icon} size={size} />;
  }
}

function ProjectFace({ id, size, live }: { id: string; size: TileSize; live: boolean }) {
  const { lang, t } = useOS();
  const p = projects.find((x) => x.id === id);
  const i = useCycle(2, live && size !== "small", id);
  if (!p) return null;
  const art = <CoverArt className="tile-art" seed={p.id} motif={p.motif} palette={p.palette} animated={size === "large"} />;
  if (size === "small")
    return (
      <div className="tile-fill" style={{ background: p.palette[1] }}>
        <span className="tile-initials">{p.title.slice(0, 2)}</span>
      </div>
    );
  return (
    <Peek
      index={i}
      faces={[
        <div className="tile-fill" key="a">
          {art}
          <div className={`tile-logo font-${p.logo.font}`} style={p.logo.gradient ? { backgroundImage: `linear-gradient(90deg, ${p.logo.gradient[0]}, ${p.logo.gradient[1]})` } : undefined}>
            <span className={p.logo.caps ? "caps" : undefined}>{p.title}</span>
          </div>
        </div>,
        <div className="tile-fill tile-text" key="b" style={{ background: p.palette[1] }}>
          <strong>{pick(lang, p.tagline)}</strong>
          {size !== "medium" && <p>{pick(lang, p.description)}</p>}
          <span className={`pill pill-${p.status}`}>{t(`status.${p.status}`)}</span>
        </div>,
      ]}
    />
  );
}

function SocialFace({ id, size }: { id: string; size: TileSize }) {
  const s = socials.find((x) => x.id === id);
  return (
    <div className="tile-social">
      <Icon name={socialIcon(id)} size={size === "small" ? 30 : 48} strokeWidth={1.5} />
      {size === "medium" && s && <span className="tile-handle">{s.handle}</span>}
    </div>
  );
}

function ProfileFace({ size, live }: { size: TileSize; live: boolean }) {
  const { lang } = useOS();
  const i = useCycle(3, live && size !== "small", "profile");
  if (size === "small") return <IconFace icon="profile" size={size} />;
  const cells = size === "large" ? 9 : size === "wide" ? 8 : 4;
  const pool = [...projects, ...media];
  const mosaic = (
    <div className={`mosaic mosaic-${size}`}>
      {Array.from({ length: cells }, (_, k) => {
        const it = pool[(k * 3 + i) % pool.length];
        return k === 0 ? (
          <div key={k} className="mosaic-cell mosaic-me">
            {profile.name}
          </div>
        ) : (
          <div key={k} className="mosaic-cell">
            <CoverArt seed={it.id} motif={it.motif} palette={it.palette} variant={k % 3} />
          </div>
        );
      })}
    </div>
  );
  return (
    <Peek
      index={i === 2 ? 1 : 0}
      faces={[
        mosaic,
        <div className="tile-text" key="b">
          <strong>{profile.name}</strong>
          <p>{pick(lang, profile.title)}</p>
          <p className="dim">{pick(lang, profile.location)}</p>
        </div>,
      ]}
    />
  );
}

function MailFace({ size, live }: { size: TileSize; live: boolean }) {
  const { lang } = useOS();
  const i = useCycle(inbox.length, live && size !== "small", "mail");
  const unread = inbox.filter((m) => m.unread).length;
  if (size !== "wide" || !live)
    return (
      <>
        <IconFace icon="mail" size={size} />
        <span className="tile-count">{unread}</span>
      </>
    );
  return (
    <>
      <Flip
        index={i}
        faces={inbox.map((m) => (
          <div className="tile-text mail-face" key={m.id}>
            <strong>{m.from}</strong>
            <p>{pick(lang, m.subject)}</p>
            <p className="dim">{pick(lang, m.preview)}</p>
          </div>
        ))}
      />
      <span className="tile-count">
        <Icon name="mail" size={16} /> {unread}
      </span>
    </>
  );
}

function CalendarFace({ size, live }: { size: TileSize; live: boolean }) {
  const { lang } = useOS();
  const now = new Date(useTick(60_000));
  const next = [...media].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (size === "small") return <div className="tile-cal-small">{now.getDate()}</div>;
  return (
    <div className="tile-cal">
      <div className="tile-cal-day">{now.getDate()}</div>
      <div className="tile-cal-name">{dayName(lang, now.getDay())}</div>
      {size === "wide" && live && next && (
        <div className="tile-cal-event">
          <strong>{pick(lang, next.title)}</strong>
          <span>{monthName(lang, Number(next.date.split("-")[1]) - 1)}</span>
        </div>
      )}
    </div>
  );
}

function AchievementsFace({ size, live }: { size: TileSize; live: boolean }) {
  const { earned, lang } = useOS();
  const i = useCycle(2, live && size !== "small", "ach");
  const got = VISITOR_ACHIEVEMENTS.filter((a) => earned[a.id]);
  const score = got.reduce((s, a) => s + a.points, 0);
  const last = [...got].sort((a, b) => earned[b.id] - earned[a.id])[0];
  if (size === "small") return <IconFace icon="achievements" size={size} />;
  return (
    <Flip
      index={last ? i : 0}
      faces={[
        <div className="tile-ach" key="a">
          <Icon name="achievements" size={size === "medium" ? 44 : 52} strokeWidth={1.4} />
          <span>
            {got.length}/{VISITOR_ACHIEVEMENTS.length} · {score}G
          </span>
        </div>,
        <div className="tile-text" key="b">
          <strong>{last ? pick(lang, last.name) : ""}</strong>
          <p className="dim">{last ? pick(lang, last.detail) : ""}</p>
        </div>,
      ]}
    />
  );
}

export const WALLPAPER = { seed: "wallpaper", motif: "dunes" as const, palette: ["#0b1a3a", "#1e4fa8", "#7dd3fc"] as [string, string, string] };

function DesktopFace({ size }: { size: TileSize }) {
  if (size === "small") return <IconFace icon="desktop" size={size} />;
  return (
    <div className="tile-fill">
      <CoverArt className="tile-art" {...WALLPAPER} />
      <div className="tile-taskbar" />
    </div>
  );
}

function MusicFace({ size, live }: { size: TileSize; live: boolean }) {
  const { track } = useOS();
  const tr = TRACKS.find((x) => x.id === track);
  if (!tr || !live || size === "small") return <IconFace icon="music" size={size} />;
  return (
    <div className="tile-fill">
      <CoverArt className="tile-art" seed={tr.id} motif="waves" palette={tr.palette} animated />
      <div className="tile-text tile-text-over">
        <div className="eq">
          <i />
          <i />
          <i />
          <i />
        </div>
        <strong>{tr.title}</strong>
        {size !== "medium" && <p className="dim">{tr.artist}</p>}
      </div>
    </div>
  );
}

function ProjectsFace({ size, live }: { size: TileSize; live: boolean }) {
  const i = useCycle(projects.length, live && size !== "small" && size !== "medium", "store");
  if (size === "small" || size === "medium")
    return (
      <>
        <IconFace icon="projects" size={size} />
        {size === "medium" && <span className="tile-count">{projects.length}</span>}
      </>
    );
  const p = projects[i];
  return (
    <div className="tile-store">
      <Icon name="projects" size={52} strokeWidth={1.4} />
      <div key={p.id} className="tile-store-card">
        <CoverArt className="tile-store-art" seed={p.id} motif={p.motif} palette={p.palette} />
        <span>{p.title}</span>
      </div>
    </div>
  );
}

function ReaderFace({ size, live }: { size: TileSize; live: boolean }) {
  const { lang } = useOS();
  const items = [...media].sort((a, b) => b.date.localeCompare(a.date));
  const i = useCycle(items.length, live && size !== "small", "reader");
  if (size === "small") return <IconFace icon="reader" size={size} />;
  return (
    <Peek
      index={i}
      faces={items.map((m) => (
        <div className="tile-fill" key={m.id}>
          <CoverArt className="tile-art" seed={m.id} motif={m.motif} palette={m.palette} />
          <div className="tile-headline">{pick(lang, m.title)}</div>
        </div>
      ))}
    />
  );
}

function PhotosFace({ size, live }: { size: TileSize; live: boolean }) {
  const pool = [...projects, ...media];
  const i = useCycle(pool.length, live && size !== "small", "photos");
  if (size === "small") return <IconFace icon="photos" size={size} />;
  return (
    <div className="tile-fill">
      {pool.map((it, k) =>
        k === i || k === (i + pool.length - 1) % pool.length ? (
          <div key={it.id} className={`kenburns ${k === i ? "on" : ""}`}>
            <CoverArt className="tile-art" seed={it.id} motif={it.motif} palette={it.palette} variant={1} />
          </div>
        ) : null,
      )}
    </div>
  );
}
