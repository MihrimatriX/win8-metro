"use client";
/** Mail: the Win8.1 three-pane mail app. The inbox introduces the site; New writes to AFU through the visitor's mail app. */
import { useEffect, useState } from "react";
import { useOS } from "@/lib/os";
import { formatDate, pick } from "@/lib/i18n";
import { socialIcon } from "@/lib/model";
import { profile, socials } from "@/content/portfolio";
import { inbox } from "@/content/mailbox";
import { Icon } from "../Icons";
import { BackButton } from "../AppHost";

export function MailApp({ param }: { param?: string }) {
  const os = useOS();
  const { t, lang, phone, openApp, earn, toast } = os;
  const [sel, setSel] = useState<string | null>(phone ? null : inbox[0].id);
  const [read, setRead] = useState<Set<string>>(new Set(phone ? [] : [inbox[0].id]));
  const [compose, setCompose] = useState(param === "compose");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const address = socials.find((s) => s.id === "mail");
  const to = address?.url.replace(/^mailto:/, "") ?? "";

  useEffect(() => {
    if (compose) earn("letter");
  }, [compose, earn]);

  const pickMsg = (id: string) => {
    setSel(id);
    setRead((r) => new Set(r).add(id));
  };

  const send = () => {
    if (!to) return;
    toast({ title: t("mail.sent"), body: to, color: "#0072c6", icon: "send" });
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject || t("mail.subjectDefault"))}&body=${encodeURIComponent(body)}`;
    setCompose(false);
  };

  const msg = inbox.find((m) => m.id === sel);
  const unread = inbox.filter((m) => m.unread && !read.has(m.id)).length;

  if (compose)
    return (
      <div className="mail-compose">
        <header className="mail-compose-head">
          <div className="mail-compose-from">
            <small>{t("mail.from")}</small>
            <span>{lang === "tr" ? "Sen" : "You"}</span>
          </div>
          <div className="mail-compose-actions">
            <button className="icon-btn" onClick={send} aria-label={t("mail.send")} title={t("mail.send")}>
              <Icon name="send" size={22} />
            </button>
            <button
              className="icon-btn"
              onClick={() => (param === "compose" ? os.back() : setCompose(false))}
              aria-label={t("mail.cancel")}
              title={t("mail.cancel")}
            >
              <Icon name="close" size={22} />
            </button>
          </div>
        </header>
        <div className="mail-compose-body">
          <label>
            <small>{t("mail.to")}</small>
            <span className="mail-to-chip">
              {profile.name} &lt;{to}&gt;
            </span>
          </label>
          <input
            className="mail-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("mail.subjectDefault")}
            aria-label={t("mail.subject")}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("mail.body")}
            aria-label={t("mail.body")}
            autoFocus
          />
        </div>
      </div>
    );

  const list = (
    <div className="mail-list">
      <header className="mail-list-head">
        {phone && <BackButton />}
        <div>
          <h1>{t("mail.inbox")}</h1>
          <small>
            {profile.name} · {unread} {t("mail.unread")}
          </small>
        </div>
        <button className="icon-btn" onClick={() => setCompose(true)} aria-label={t("mail.new")} title={t("mail.new")}>
          <Icon name="plus" size={22} />
        </button>
      </header>
      {inbox.map((m) => (
        <button
          key={m.id}
          className={`mail-item ${sel === m.id ? "on" : ""} ${m.unread && !read.has(m.id) ? "unread" : ""}`}
          onClick={() => pickMsg(m.id)}
          data-nav
        >
          <span className="mail-item-top">
            <strong>{m.from}</strong>
            <small>{formatDate(lang, m.date)}</small>
          </span>
          <span className="mail-item-subject">{pick(lang, m.subject)}</span>
          <span className="mail-item-preview">{pick(lang, m.preview)}</span>
        </button>
      ))}
    </div>
  );

  const reading = msg && (
    <article className="mail-read">
      <header>
        {phone && (
          <button className="circle-btn back-btn" onClick={() => setSel(null)} aria-label={t("back")}>
            <Icon name="back" size={20} />
          </button>
        )}
        <h2>{pick(lang, msg.subject)}</h2>
        <div className="mail-read-meta">
          <span className="mail-avatar">{msg.from.slice(0, 1)}</span>
          <span>
            <strong>{msg.from}</strong>
            <small>{formatDate(lang, msg.date)}</small>
          </span>
          <button
            className="icon-btn"
            onClick={() => {
              setSubject(`Re: ${pick(lang, msg.subject)}`);
              setCompose(true);
            }}
            aria-label={t("mail.reply")}
            title={t("mail.reply")}
          >
            <Icon name="reply" size={22} />
          </button>
        </div>
      </header>
      <div className="mail-read-body">
        {pick(lang, msg.body)
          .split("\n\n")
          .map((para, i) => (
            <p key={i}>
              {para.split("\n").map((line, k) => (
                <span key={k}>
                  {line}
                  <br />
                </span>
              ))}
            </p>
          ))}
        {msg.app && (
          <button className="btn primary" onClick={() => openApp(msg.app!)}>
            <Icon name="forward" size={16} /> {t(`app.${msg.app}`)}
          </button>
        )}
      </div>
    </article>
  );

  if (phone) return <div className="mail mail-phone">{msg ? reading : list}</div>;

  return (
    <div className="mail">
      <nav className="mail-folders">
        <BackButton />
        <div className="mail-account">
          <strong>{profile.name}</strong>
          <span>{to}</span>
        </div>
        <button className="mail-folder on">
          <span>{t("mail.inbox")}</span>
          <b>{unread || ""}</b>
        </button>
        <h3>{t("mail.accounts")}</h3>
        {socials
          .filter((s) => s.id !== "mail")
          .map((s) => (
            <a
              key={s.id}
              className="mail-folder"
              href={s.url === "#" ? undefined : s.url}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name={socialIcon(s.id)} size={16} />
              <span>{s.label}</span>
            </a>
          ))}
      </nav>
      {list}
      {reading}
    </div>
  );
}
