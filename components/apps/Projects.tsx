"use client";
/** Projects: laid out like the Win8.1 Store. The hub lists projects, each project page is a Store listing. */
import { useState } from "react";
import { useOS, useOpenLink } from "@/lib/os";
import { pick } from "@/lib/i18n";
import { TIER_COLOR } from "@/lib/model";
import { projects } from "@/content/portfolio";
import type { Project } from "@/lib/types";
import { CoverArt } from "../CoverArt";
import { Icon } from "../Icons";
import { Hub, type Section } from "../AppHost";

export function ProjectArt({ p, variant = 0, animated, className }: { p: Project; variant?: number; animated?: boolean; className?: string }) {
  return <CoverArt className={className ?? "fill-art"} seed={p.id} motif={p.motif} palette={p.palette} variant={variant} animated={animated} />;
}

export function Logo({ p, className }: { p: Project; className?: string }) {
  return (
    <div className={`p-logo font-${p.logo.font} ${className ?? ""}`} style={p.logo.gradient ? { backgroundImage: `linear-gradient(90deg, ${p.logo.gradient[0]}, ${p.logo.gradient[1]})` } : undefined}>
      <span className={p.logo.caps ? "caps" : undefined}>{p.title}</span>
    </div>
  );
}

export function ProjectCard({ p, big }: { p: Project; big?: boolean }) {
  const { openApp, lang, t } = useOS();
  return (
    <button className={`store-card ${big ? "big" : ""}`} onClick={() => openApp("projects", p.id)} data-nav>
      <span className="store-card-art" style={{ background: p.palette[1] }}>
        <ProjectArt p={p} />
      </span>
      <span className="store-card-text">
        <strong>{p.title}</strong>
        <small>{pick(lang, p.genre)}</small>
        <span className={`pill pill-${p.status}`}>{t(`status.${p.status}`)}</span>
      </span>
    </button>
  );
}

export function ProjectsApp({ param }: { param?: string }) {
  const p = projects.find((x) => x.id === param);
  return p ? <ProjectPage p={p} /> : <ProjectsHub />;
}

function ProjectsHub() {
  const { t, lang, openApp } = useOS();
  const featured = projects[0];
  const by = (s: Project["status"]) => projects.filter((p) => p.status === s);
  const sections: Section[] = [
    {
      id: "spot",
      title: t("projects.featured"),
      wide: true,
      content: (
        <div className="store-grid two">
          {projects.slice(1, 5).map((p) => (
            <ProjectCard key={p.id} p={p} big />
          ))}
        </div>
      ),
    },
    ...(["live", "dev", "archived"] as const)
      .filter((s) => by(s).length)
      .map((s) => ({
        id: s,
        title: t(s === "live" ? "projects.live" : s === "dev" ? "projects.dev" : "projects.archived"),
        content: (
          <div className="store-grid">
            {by(s).map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </div>
        ),
      })),
  ];
  return (
    <Hub
      title={t("app.projects")}
      hero={
        <button className="store-hero" onClick={() => openApp("projects", featured.id)}>
          <ProjectArt p={featured} animated />
          <span className="store-hero-text">
            <Logo p={featured} />
            <span>{pick(lang, featured.tagline)}</span>
            <small>
              {projects.length} {t("projects.count")}
            </small>
          </span>
        </button>
      }
      sections={sections}
    />
  );
}

function ProjectPage({ p }: { p: Project }) {
  const { t, lang, phone } = useOS();
  const link = useOpenLink();
  const [shot, setShot] = useState<number | null>(null);
  const others = projects.filter((x) => x.id !== p.id).slice(0, 4);
  const earned = p.trophies.filter((x) => x.earned).length;

  const links = (
    <div className="p-actions">
      {p.links.demo !== undefined && (
        <button className="btn primary" onClick={() => link(p.links.demo)}>
          <Icon name="play" size={16} /> {t("demo")}
        </button>
      )}
      {p.links.repo !== undefined && (
        <button className="btn" onClick={() => link(p.links.repo)}>
          <Icon name="github" size={16} /> {t("source")}
        </button>
      )}
      {p.links.demo === undefined && p.links.repo === undefined && <span className="dim">{t("noLinks")}</span>}
    </div>
  );

  const sections: Section[] = [
    {
      id: "overview",
      title: t("projects.overview"),
      content: (
        <div className="p-overview">
          {p.sample && <span className="sample-badge">{t("sample")}</span>}
          <p className="lead">{pick(lang, p.tagline)}</p>
          <p>{pick(lang, p.description)}</p>
          {phone && links}
        </div>
      ),
    },
    {
      id: "shots",
      title: t("projects.screens"),
      wide: true,
      content: (
        <div className="p-shots">
          {[1, 2, 3, 4].map((v) => (
            <button key={v} className="p-shot" onClick={() => setShot(v)}>
              <ProjectArt p={p} variant={v} />
            </button>
          ))}
        </div>
      ),
    },
    {
      id: "features",
      title: t("projects.features"),
      content: (
        <ul className="p-features">
          {p.features.map((f, i) => (
            <li key={i}>
              <strong>{pick(lang, f.title)}</strong>
              <span>{pick(lang, f.body)}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "details",
      title: t("projects.details"),
      content: (
        <dl className="p-details">
          <dt>{t("projects.status")}</dt>
          <dd>
            <span className={`pill pill-${p.status}`}>{t(`status.${p.status}`)}</span>
          </dd>
          <dt>{t("projects.genre")}</dt>
          <dd>{pick(lang, p.genre)}</dd>
          <dt>{t("projects.year")}</dt>
          <dd>{p.year}</dd>
          <dt>{t("projects.role")}</dt>
          <dd>{pick(lang, p.role)}</dd>
          <dt>{t("projects.time")}</dt>
          <dd>
            {p.hours} {t("hours")}
          </dd>
          <dt>{t("projects.tech")}</dt>
          <dd className="chips">
            {p.tech.map((x) => (
              <span key={x} className="chip">
                {x}
              </span>
            ))}
          </dd>
        </dl>
      ),
    },
    {
      id: "milestones",
      title: `${t("projects.milestones")} · ${earned}/${p.trophies.length}`,
      content: (
        <ul className="p-trophies">
          {p.trophies.map((x, i) => (
            <li key={i} className={x.earned ? "" : "locked"}>
              <span className="medal" style={{ background: TIER_COLOR[x.tier] }}>
                <Icon name={x.earned ? "achievements" : "lock"} size={18} />
              </span>
              <span>
                <strong>{pick(lang, x.name)}</strong>
                <small>{pick(lang, x.detail)}</small>
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "more",
      title: t("group.projects"),
      content: (
        <div className="store-grid">
          {others.map((o) => (
            <ProjectCard key={o.id} p={o} />
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      <Hub
        title={p.title}
        appTitle={t("app.projects")}
        className="p-page"
        hero={
          <div className="p-hero" style={{ background: p.palette[0] }}>
            <ProjectArt p={p} animated />
            <div className="p-hero-text">
              <Logo p={p} />
              <span className="p-hero-genre">
                {pick(lang, p.genre)} · {p.year}
              </span>
              {!phone && links}
            </div>
          </div>
        }
        sections={sections}
      />
      {shot !== null && (
        <div className="viewer" onClick={() => setShot(null)}>
          <ProjectArt p={p} variant={shot} animated className="viewer-art" />
          <button className="viewer-nav prev" onClick={(e) => { e.stopPropagation(); setShot(((shot + 2) % 4) + 1); }} aria-label="prev">
            <Icon name="back" size={22} />
          </button>
          <button className="viewer-nav next" onClick={(e) => { e.stopPropagation(); setShot((shot % 4) + 1); }} aria-label="next">
            <Icon name="forward" size={22} />
          </button>
          <span className="viewer-caption">
            {p.title} · {shot}/4
          </span>
        </div>
      )}
    </>
  );
}
