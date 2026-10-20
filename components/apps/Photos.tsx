"use client";
/** Photos: every project and post cover as a gallery, with a full-screen viewer and slide show. */
import { useEffect, useState } from "react";
import { useOS } from "@/lib/os";
import { pick } from "@/lib/i18n";
import { media, projects } from "@/content/portfolio";
import type { Motif } from "@/lib/types";
import { CoverArt } from "../CoverArt";
import { Icon } from "../Icons";
import { Hub } from "../AppHost";

type Photo = {
  key: string;
  seed: string;
  motif: Motif;
  palette: [string, string, string];
  variant: number;
  title: string;
  lockId: string;
};

export function PhotosApp() {
  const { t, lang, setPref, toast } = useOS();
  const [cur, setCur] = useState<number | null>(null);
  const [show, setShow] = useState(false);

  const projectPhotos: Photo[] = projects.flatMap((p) =>
    [0, 1, 2].map((v) => ({
      key: `${p.id}-${v}`,
      seed: p.id,
      motif: p.motif,
      palette: p.palette,
      variant: v,
      title: p.title,
      lockId: p.id,
    })),
  );
  const postPhotos: Photo[] = media.map((m) => ({
    key: m.id,
    seed: m.id,
    motif: m.motif,
    palette: m.palette,
    variant: 0,
    title: pick(lang, m.title),
    lockId: m.id,
  }));
  const all = [...projectPhotos, ...postPhotos];

  useEffect(() => {
    if (!show || cur === null) return;
    const id = window.setTimeout(() => setCur((c) => ((c ?? 0) + 1) % all.length), 3200);
    return () => window.clearTimeout(id);
  }, [show, cur, all.length]);

  useEffect(() => {
    if (cur === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setCur((c) => ((c ?? 0) + 1) % all.length);
      if (e.key === "ArrowLeft") setCur((c) => ((c ?? 0) - 1 + all.length) % all.length);
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setCur(null);
        setShow(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cur, all.length]);

  const grid = (list: Photo[], offset: number) => (
    <div className="photo-grid">
      {list.map((ph, i) => (
        <button
          key={ph.key}
          className={`photo ${i % 5 === 0 ? "big" : ""}`}
          onClick={() => setCur(offset + i)}
          data-nav
          aria-label={ph.title}
        >
          <CoverArt seed={ph.seed} motif={ph.motif} palette={ph.palette} variant={ph.variant} />
        </button>
      ))}
    </div>
  );

  const p = cur !== null ? all[cur] : null;
  return (
    <>
      <Hub
        title={t("app.photos")}
        sections={[
          {
            id: "projects",
            title: `${t("photos.projects")} · ${projectPhotos.length}`,
            wide: true,
            content: grid(projectPhotos, 0),
          },
          {
            id: "posts",
            title: `${t("photos.posts")} · ${postPhotos.length}`,
            wide: true,
            content: grid(postPhotos, projectPhotos.length),
          },
        ]}
      />
      {p && (
        <div className="viewer" onClick={() => setShow(false)}>
          <div key={p.key} className={`viewer-art ${show ? "kb" : ""}`}>
            <CoverArt seed={p.seed} motif={p.motif} palette={p.palette} variant={p.variant} animated />
          </div>
          <button
            className="viewer-nav prev"
            onClick={(e) => {
              e.stopPropagation();
              setCur((cur! - 1 + all.length) % all.length);
            }}
            aria-label="prev"
          >
            <Icon name="back" size={22} />
          </button>
          <button
            className="viewer-nav next"
            onClick={(e) => {
              e.stopPropagation();
              setCur((cur! + 1) % all.length);
            }}
            aria-label="next"
          >
            <Icon name="forward" size={22} />
          </button>
          <div className="viewer-bar" onClick={(e) => e.stopPropagation()}>
            <span className="viewer-title">{p.title}</span>
            <button onClick={() => setShow((s) => !s)}>
              <Icon name={show ? "pause" : "play"} size={20} />
              <span>{t("photos.slideshow")}</span>
            </button>
            <button
              onClick={() => {
                setPref("lockImage", p.lockId);
                toast({ title: t("photos.lockSet"), body: p.title, color: "#008299", icon: "lock" });
              }}
            >
              <Icon name="lock" size={20} />
              <span>{t("photos.setLock")}</span>
            </button>
            <button
              onClick={() => {
                setCur(null);
                setShow(false);
              }}
            >
              <Icon name="close" size={20} />
              <span>{t("back")}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
