"use client";
/** Profile: the CV, laid out like the Win8 People app's profile page. */
import { useOS, useOpenLink } from "@/lib/os";
import { formatDate, pick } from "@/lib/i18n";
import { TIER_COLOR, socialColor, socialIcon } from "@/lib/model";
import { achievements, profile, projects, socials } from "@/content/portfolio";
import { Icon } from "../Icons";
import { Avatar } from "../Lock";
import { Hub, type Section } from "../AppHost";
import { ProjectCard } from "./Projects";

export function ProfileApp() {
  const { t, lang, openApp } = useOS();
  const link = useOpenLink();
  const mail = socials.find((s) => s.id === "mail");

  const sections: Section[] = [
    {
      id: "exp",
      title: t("profile.experience"),
      content: (
        <ol className="timeline">
          {profile.experience.map((e) => (
            <li key={e.company + e.period}>
              <span className="timeline-period">{e.period}</span>
              <strong>{pick(lang, e.role)}</strong>
              <span className="accent-text">{e.company}</span>
              <p>{pick(lang, e.summary)}</p>
            </li>
          ))}
        </ol>
      ),
    },
    {
      id: "skills",
      title: t("profile.skills"),
      content: (
        <ul className="skills">
          {profile.skills.map((s) => (
            <li key={s.name}>
              <span>{s.name}</span>
              <span className="bar">
                <i style={{ width: `${s.value}%` }} />
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "edu",
      title: `${t("profile.education")} · ${t("profile.languages")}`,
      content: (
        <div className="edu">
          {profile.education.map((e) => (
            <div key={e.school} className="edu-item">
              <strong>{pick(lang, e.degree)}</strong>
              <span className="accent-text">{e.school}</span>
              <small>{e.period}</small>
            </div>
          ))}
          <div className="langs">
            {profile.languages.map((l) => (
              <div key={l.name.en}>
                <strong>{pick(lang, l.name)}</strong>
                <small>{pick(lang, l.level)}</small>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "certs",
      title: t("ach.certs"),
      onTitle: () => openApp("achievements"),
      content: (
        <ul className="p-trophies">
          {achievements.map((a) => (
            <li key={a.id}>
              <span className="medal" style={{ background: TIER_COLOR[a.tier] }}>
                <Icon name={a.kind === "certificate" ? "cv" : "achievements"} size={18} />
              </span>
              <span>
                <strong>{pick(lang, a.name)}</strong>
                <small>
                  {a.issuer} · {formatDate(lang, a.date)}
                </small>
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "links",
      title: t("profile.links"),
      content: (
        <div className="social-tiles">
          {socials.map((s) => (
            <button key={s.id} className="social-tile" style={{ background: socialColor(s.id) }} onClick={() => link(s.url)}>
              <Icon name={socialIcon(s.id)} size={30} />
              <span>
                {s.label}
                <small>{s.handle}</small>
              </span>
            </button>
          ))}
        </div>
      ),
    },
    {
      id: "work",
      title: t("group.projects"),
      onTitle: () => openApp("projects"),
      content: (
        <div className="store-grid">
          {projects.slice(0, 4).map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      ),
    },
  ];

  return (
    <Hub
      title={profile.name}
      appTitle={t("app.profile")}
      hero={
        <div className="profile-hero">
          <Avatar user="owner" size={180} />
          <div className="profile-hero-text">
            <h2>{profile.name}</h2>
            <p className="lead">{pick(lang, profile.title)}</p>
            <p className="dim">
              {pick(lang, profile.location)} · {profile.level} {t("profile.years")}
            </p>
            {profile.sample && <span className="sample-badge">{t("sample")}</span>}
            <p>{pick(lang, profile.about)}</p>
            <div className="p-actions">
              <button className="btn primary" onClick={() => link(profile.cvUrl)}>
                <Icon name="cv" size={16} /> {t("profile.cv")}
              </button>
              <button className="btn" onClick={() => (mail ? openApp("mail", "compose") : undefined)}>
                <Icon name="mail" size={16} /> {t("profile.contact")}
              </button>
            </div>
          </div>
        </div>
      }
      sections={sections}
    />
  );
}
