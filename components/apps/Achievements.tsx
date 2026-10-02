"use client";
/** Achievements: a games-hub style profile card, visitor achievements and AFU's certificates and awards. */
import { useOS, useOpenLink } from "@/lib/os";
import { formatDate, pick } from "@/lib/i18n";
import { TIER_COLOR, VISITOR_ACHIEVEMENTS } from "@/lib/model";
import { achievements, profile, projects } from "@/content/portfolio";
import { Icon } from "../Icons";
import { Avatar } from "../Lock";
import { Hub } from "../AppHost";
import { ProjectArt } from "./Projects";

export function AchievementsApp() {
  const { t, lang, earned, user, openApp } = useOS();
  const link = useOpenLink();
  const got = VISITOR_ACHIEVEMENTS.filter((a) => earned[a.id]);
  const score = got.reduce((s, a) => s + a.points, 0);
  const total = VISITOR_ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);
  const pct = Math.round((got.length / VISITOR_ACHIEVEMENTS.length) * 100);

  const hero = (
    <div className="gamercard">
      <Avatar user={user} size={150} />
      <div>
        <h2>{user === "owner" ? profile.onlineId : user === "guest" ? t("login.guest") : t("login.recruiter")}</h2>
        <p className="gamerscore">
          <span className="g">G</span> {score} / {total}
        </p>
        <div className="ring-progress" style={{ "--p": pct } as React.CSSProperties}>
          <span>{pct}%</span>
        </div>
        <p className="dim">
          {t("ach.progress")}: {got.length}/{VISITOR_ACHIEVEMENTS.length}
        </p>
      </div>
    </div>
  );

  return (
    <Hub
      title={t("app.achievements")}
      hero={hero}
      sections={[
        {
          id: "visitor",
          title: t("ach.visitor"),
          wide: true,
          content: (
            <>
              <p className="dim small">{t("ach.visitorNote")}</p>
              <div className="ach-grid">
                {VISITOR_ACHIEVEMENTS.map((a) => (
                  <div key={a.id} className={`ach ${earned[a.id] ? "on" : "locked"}`}>
                    <span className="ach-medal" style={{ background: earned[a.id] ? TIER_COLOR[a.tier] : undefined }}>
                      <Icon name={earned[a.id] ? "achievements" : "lock"} size={22} />
                    </span>
                    <span className="ach-text">
                      <strong>{pick(lang, a.name)}</strong>
                      <small>{pick(lang, a.detail)}</small>
                      <small className="ach-pts">
                        {a.points}G · {t(`tier.${a.tier}`)}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ),
        },
        {
          id: "certs",
          title: t("ach.certs"),
          content: (
            <ul className="p-trophies">
              {achievements.map((a) => (
                <li key={a.id} onClick={() => a.url && link(a.url)} className={a.url ? "clickable" : ""}>
                  <span className="medal" style={{ background: TIER_COLOR[a.tier] }}>
                    <Icon name={a.kind === "certificate" ? "cv" : a.kind === "award" ? "star" : "achievements"} size={18} />
                  </span>
                  <span>
                    <strong>{pick(lang, a.name)}</strong>
                    <small>
                      {t(`kind.${a.kind}`)} · {a.issuer} · {formatDate(lang, a.date)}
                    </small>
                    <small className="dim">{pick(lang, a.detail)}</small>
                  </span>
                </li>
              ))}
            </ul>
          ),
        },
        {
          id: "projects",
          title: t("projects.milestones"),
          content: (
            <div className="ach-projects">
              {projects.map((p) => {
                const e = p.trophies.filter((x) => x.earned).length;
                return (
                  <button key={p.id} className="ach-project" onClick={() => openApp("projects", p.id)}>
                    <span className="ach-project-art">
                      <ProjectArt p={p} />
                    </span>
                    <span>
                      <strong>{p.title}</strong>
                      <span className="bar">
                        <i style={{ width: `${(e / Math.max(1, p.trophies.length)) * 100}%` }} />
                      </span>
                      <small>
                        {e}/{p.trophies.length}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          ),
        },
      ]}
    />
  );
}
