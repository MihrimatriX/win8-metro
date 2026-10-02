"use client";
/** Reader: posts, tutorials and talks, laid out like the Win8.1 News app. */
import { useOS, useOpenLink } from "@/lib/os";
import { formatDate, pick } from "@/lib/i18n";
import { media } from "@/content/portfolio";
import type { MediaItem } from "@/lib/types";
import { CoverArt } from "../CoverArt";
import { Icon } from "../Icons";
import { BackButton, Hub, type Section } from "../AppHost";

const sorted = () => [...media].sort((a, b) => b.date.localeCompare(a.date));

function NewsCard({ m, big }: { m: MediaItem; big?: boolean }) {
  const { openApp, lang, t } = useOS();
  return (
    <button className={`news-card ${big ? "big" : ""}`} onClick={() => openApp("reader", m.id)} data-nav>
      <span className="news-art">
        <CoverArt seed={m.id} motif={m.motif} palette={m.palette} />
      </span>
      <span className="news-text">
        <strong>{pick(lang, m.title)}</strong>
        <small>
          {t(`kind.${m.kind}`)} · {formatDate(lang, m.date)}
        </small>
      </span>
    </button>
  );
}

export function ReaderApp({ param }: { param?: string }) {
  const m = media.find((x) => x.id === param);
  return m ? <Article m={m} /> : <ReaderHub />;
}

function ReaderHub() {
  const { t, lang, openApp } = useOS();
  const all = sorted();
  const top = all[0];
  const kinds: [MediaItem["kind"][], Parameters<typeof t>[0]][] = [
    [["post"], "reader.posts"],
    [["tutorial", "video"], "reader.tutorials"],
    [["talk"], "reader.talks"],
  ];
  const sections: Section[] = kinds
    .map(([ks, title]) => ({ items: all.filter((m) => ks.includes(m.kind)), title }))
    .filter((x) => x.items.length)
    .map(({ items, title }) => ({
      id: title,
      title: t(title),
      content: (
        <div className="news-col">
          {items.map((m, i) => (
            <NewsCard key={m.id} m={m} big={i === 0} />
          ))}
        </div>
      ),
    }));
  return (
    <Hub
      title={t("app.reader")}
      hero={
        <button className="news-hero" onClick={() => openApp("reader", top.id)}>
          <CoverArt seed={top.id} motif={top.motif} palette={top.palette} animated />
          <span className="news-hero-text">
            <small>{t("reader.top")}</small>
            <strong>{pick(lang, top.title)}</strong>
            <span>{pick(lang, top.summary)}</span>
          </span>
        </button>
      }
      sections={sections}
    />
  );
}

function Article({ m }: { m: MediaItem }) {
  const { t, lang, phone } = useOS();
  const link = useOpenLink();
  const more = sorted().filter((x) => x.id !== m.id).slice(0, 3);
  return (
    <div className="article">
      {!phone && (
        <header className="page-head">
          <BackButton />
          <h1>{t("app.reader")}</h1>
        </header>
      )}
      <div className="article-scroll">
        <div className="article-art">
          <CoverArt seed={m.id} motif={m.motif} palette={m.palette} animated />
        </div>
        <div className="article-text">
          {phone && <BackButton />}
          <small className="accent-text">
            {t(`kind.${m.kind}`).toLocaleUpperCase(lang)} · {formatDate(lang, m.date)} · {m.minutes} {t("minutes")} {t("reader.readTime")}
          </small>
          <h1>{pick(lang, m.title)}</h1>
          {m.sample && <span className="sample-badge">{t("sample")}</span>}
          <p className="lead">{pick(lang, m.summary)}</p>
          <button className="btn primary" onClick={() => link(m.url)}>
            <Icon name="reader" size={16} /> {t("reader.readOn")}
          </button>
        </div>
        <div className="article-more">
          {more.map((x) => (
            <NewsCard key={x.id} m={x} />
          ))}
        </div>
      </div>
    </div>
  );
}
