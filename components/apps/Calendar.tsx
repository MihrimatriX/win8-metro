"use client";
/** Calendar: a month view where posts, talks and certificates are events, plus an agenda of everything. */
import { useState } from "react";
import { useOS, type View } from "@/lib/os";
import { dayName, formatDate, monthName, pick } from "@/lib/i18n";
import { app } from "@/lib/model";
import { achievements, media, profile } from "@/content/portfolio";
import { Icon } from "../Icons";
import { BackButton } from "../AppHost";

type Ev = { date: string; label: string; title: string; color: string; view: View };

export function CalendarApp() {
  const { t, lang, open, phone } = useOS();
  const today = new Date();
  // Open on this month, or on the latest month that has something in it.
  const [ym, setYm] = useState(() => {
    const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const latest = [...media.map((m) => m.date), ...achievements.map((a) => a.date)].sort().reverse()[0] ?? thisMonth;
    const key = media.some((m) => m.date.startsWith(thisMonth)) ? thisMonth : latest.slice(0, 7);
    return { y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 };
  });

  const events: Ev[] = [
    ...media.map((m) => ({
      date: m.date,
      label: formatDate(lang, m.date),
      title: pick(lang, m.title),
      color: app("reader").color,
      view: { kind: "app", app: "reader", param: m.id } as View,
    })),
    ...achievements.map((a) => ({
      date: `${a.date}-01`.slice(0, 10),
      label: formatDate(lang, a.date),
      title: pick(lang, a.name),
      color: app("achievements").color,
      view: { kind: "app", app: "achievements" } as View,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const first = new Date(ym.y, ym.m, 1);
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(ym.y, ym.m, i - lead + 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { d, iso, inMonth: d.getMonth() === ym.m, evs: events.filter((e) => e.date === iso) };
  });
  const rows = lead + days > 35 ? 6 : 5;
  const shift = (n: number) =>
    setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));

  const agenda = (
    <div className="agenda">
      <h2>{t("cal.timeline")}</h2>
      {events.map((e, i) => (
        <button key={i} className="agenda-item" onClick={() => open(e.view)} style={{ borderColor: e.color }} data-nav>
          <small>{e.label}</small>
          <strong>{e.title}</strong>
        </button>
      ))}
      {profile.experience.map((e) => (
        <div key={e.company} className="agenda-item static" style={{ borderColor: app("profile").color }}>
          <small>{e.period}</small>
          <strong>
            {pick(lang, e.role)} · {e.company}
          </strong>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`calendar ${phone ? "phone" : ""}`}>
      <header className="cal-head">
        <BackButton />
        <h1>
          {monthName(lang, ym.m)} {ym.y}
        </h1>
        <div className="cal-nav">
          <button className="circle-btn small" onClick={() => shift(-1)} aria-label="prev">
            <Icon name="back" size={16} />
          </button>
          <button className="circle-btn small" onClick={() => shift(1)} aria-label="next">
            <Icon name="forward" size={16} />
          </button>
          <button className="btn" onClick={() => setYm({ y: today.getFullYear(), m: today.getMonth() })}>
            {t("cal.today")}
          </button>
        </div>
      </header>
      <div className="cal-main">
        <div className="month" style={{ gridTemplateRows: `auto repeat(${rows}, 1fr)` }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="month-dow">
              {phone ? dayName(lang, (i + 1) % 7).slice(0, 2) : dayName(lang, (i + 1) % 7)}
            </div>
          ))}
          {cells.slice(0, rows * 7).map((c) => {
            const isToday = c.d.toDateString() === today.toDateString();
            return (
              <div key={c.iso} className={`month-cell ${c.inMonth ? "" : "out"} ${isToday ? "today" : ""}`}>
                <span className="month-num">{c.d.getDate()}</span>
                {c.evs.map((e, k) => (
                  <button
                    key={k}
                    className="month-ev"
                    style={{ background: e.color }}
                    onClick={() => open(e.view)}
                    title={e.title}
                  >
                    {phone ? "" : e.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        {agenda}
      </div>
    </div>
  );
}
