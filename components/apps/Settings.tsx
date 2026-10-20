"use client";
/** PC settings: personalize, account, language, ease of access, recovery and PC info. */
import { useEffect, useState } from "react";
import { useOS, useTick } from "@/lib/os";
import { COLORS, PATTERNS, defaultTiles } from "@/lib/model";
import { media, profile, projects } from "@/content/portfolio";
import { CoverArt } from "../CoverArt";
import { Icon } from "../Icons";
import { Avatar, lockArt } from "../Lock";
import { BackButton } from "../AppHost";
import { fs, formatSize, HOME, useFS } from "@/lib/fs";

type Cat = "personalize" | "accounts" | "skydrive" | "privacy" | "network" | "time" | "ease" | "update" | "pcinfo";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  const { t } = useOS();
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <button
        className={`toggle ${on ? "on" : ""}`}
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
        aria-label={label}
      >
        <i />
      </button>
      <small>{on ? t("on") : t("off")}</small>
    </div>
  );
}

export function SettingsApp({ param }: { param?: string }) {
  const os = useOS();
  const { t, phone } = os;
  const [cat, setCat] = useState<Cat | null>((param as Cat) ?? (phone ? null : "personalize"));
  const cats: [Cat, Parameters<typeof t>[0]][] = [
    ["personalize", "pc.personalize"],
    ["accounts", "pc.accounts"],
    ["skydrive", "pc.skydrive"],
    ["privacy", "pc.privacy"],
    ["network", "pc.network"],
    ["time", "pc.time"],
    ["ease", "pc.ease"],
    ["update", "pc.update"],
    ["pcinfo", "pc.pcInfo"],
  ];

  const nav = (
    <nav className="pcs-nav">
      <header>
        {phone ? <BackButton /> : <BackButton />}
        <h1>{phone ? t("app.settingsPhone") : t("app.settings")}</h1>
      </header>
      {cats.map(([id, k]) => (
        <button key={id} className={cat === id ? "on" : ""} onClick={() => setCat(id)} data-nav>
          {t(k)}
        </button>
      ))}
    </nav>
  );

  if (phone && !cat) return <div className="pcs phone">{nav}</div>;
  return (
    <div className={`pcs ${phone ? "phone" : ""}`}>
      {!phone && nav}
      <div className="pcs-main" key={cat}>
        {phone && (
          <header className="pcs-phone-head">
            <button className="circle-btn back-btn" onClick={() => setCat(null)} aria-label={t("back")}>
              <Icon name="back" size={20} />
            </button>
            <h1>{t(cats.find((c) => c[0] === cat)![1])}</h1>
          </header>
        )}
        {cat === "personalize" && <Personalize />}
        {cat === "accounts" && <Accounts />}
        {cat === "skydrive" && <SkyDriveInfo />}
        {cat === "privacy" && <Privacy />}
        {cat === "network" && <Network />}
        {cat === "time" && <TimeLang />}
        {cat === "ease" && <Ease />}
        {cat === "update" && <Update />}
        {cat === "pcinfo" && <PcInfo />}
      </div>
    </div>
  );
}

function Personalize() {
  const { t, lockImage, setPref, color, pattern, phoneTheme, lang } = useOS();
  const art = lockArt(lockImage);
  const pics = [
    ...projects.map((p) => ({ id: p.id, ...lockArt(p.id) })),
    ...media.slice(0, 3).map((m) => ({ id: m.id, ...lockArt(m.id) })),
  ];
  return (
    <>
      <h2>{t("settings.lockImage")}</h2>
      <div className="pcs-lockprev">
        <CoverArt seed={art.seed} motif={art.motif} palette={art.palette} />
        <span>9:41</span>
      </div>
      <div className="pcs-thumbs">
        {pics.map((p) => (
          <button
            key={p.id}
            className={lockImage === p.id ? "on" : ""}
            onClick={() => setPref("lockImage", p.id)}
            aria-label={p.id}
          >
            <CoverArt seed={p.seed} motif={p.motif} palette={p.palette} />
          </button>
        ))}
      </div>
      <h2>{t("settings.bgColor")}</h2>
      <div className="swatches big">
        {COLORS.map((c, i) => (
          <button
            key={i}
            className={`swatch ${color === i ? "on" : ""}`}
            style={{ background: c.bg }}
            onClick={() => setPref("color", i)}
            aria-label={`${i + 1}`}
          >
            <i style={{ background: c.accent }} />
          </button>
        ))}
      </div>
      <h2>{t("settings.background")}</h2>
      <div className="pcs-chips">
        {PATTERNS.map((p) => (
          <button key={p} className={`chip-btn ${pattern === p ? "on" : ""}`} onClick={() => setPref("pattern", p)}>
            {p === "none" ? (lang === "tr" ? "Düz" : "Plain") : p}
          </button>
        ))}
      </div>
      <h2>{t("settings.theme")}</h2>
      <div className="pcs-chips">
        {(["dark", "light"] as const).map((th) => (
          <button
            key={th}
            className={`chip-btn ${phoneTheme === th ? "on" : ""}`}
            onClick={() => setPref("phoneTheme", th)}
          >
            {t(th === "dark" ? "settings.dark" : "settings.light")}
          </button>
        ))}
      </div>
    </>
  );
}

function Accounts() {
  const { t, user, power } = useOS();
  return (
    <>
      <h2>{t("pc.yourAccount")}</h2>
      <div className="pcs-account">
        <Avatar user={user} size={110} />
        <div>
          <strong>
            {user === "owner" ? profile.name : user === "guest" ? t("login.guest") : t("login.recruiter")}
          </strong>
          <small>
            {t("pc.signedInAs")}: {user === "owner" ? profile.onlineId : user}
          </small>
          <button className="btn" onClick={() => power("signout")}>
            {t("power.signout")}
          </button>
        </div>
      </div>
    </>
  );
}

function SkyDriveInfo() {
  const { t, lang, openApp } = useOS();
  useFS();
  const used = fs.size(fs.get(HOME) ?? { name: "", kind: "dir", created: 0, modified: 0 });
  const total = 7 * 1024 ** 3;
  return (
    <>
      <h2>{t("pc.storage")}</h2>
      <p className="pcs-big">
        {formatSize(total - used, lang)} {lang === "tr" ? "kullanılabilir" : "available"}
      </p>
      <div className="pcs-meter">
        <i style={{ width: `${Math.max(1, (used / total) * 100)}%` }} />
      </div>
      <p className="dim">
        {formatSize(used, lang)} / {formatSize(total, lang)}
      </p>
      <button className="btn" onClick={() => openApp("skydrive")}>
        {lang === "tr" ? "SkyDrive'ı aç" : "Open SkyDrive"}
      </button>
    </>
  );
}

function Privacy() {
  const { t, lang } = useOS();
  const [st, setSt] = useState({ location: true, camera: true, mic: true, ads: false });
  const flip = (k: keyof typeof st) => (v: boolean) => setSt((x) => ({ ...x, [k]: v }));
  return (
    <>
      <h2>{t("pc.privacy")}</h2>
      <Toggle
        label={lang === "tr" ? "Uygulamaların konumumu kullanmasına izin ver" : "Let apps use my location"}
        on={st.location}
        onChange={flip("location")}
      />
      <Toggle
        label={lang === "tr" ? "Uygulamaların web kameramı kullanmasına izin ver" : "Let apps use my webcam"}
        on={st.camera}
        onChange={flip("camera")}
      />
      <Toggle
        label={lang === "tr" ? "Uygulamaların mikrofonumu kullanmasına izin ver" : "Let apps use my microphone"}
        on={st.mic}
        onChange={flip("mic")}
      />
      <Toggle
        label={
          lang === "tr" ? "Uygulamaların reklam kimliğimi kullanmasına izin ver" : "Let apps use my advertising ID"
        }
        on={st.ads}
        onChange={flip("ads")}
      />
      <p className="dim small">
        {lang === "tr"
          ? "Kamera, mikrofon ve konum için tarayıcınız ayrıca izin isteyecektir."
          : "Your browser will also ask before apps use the camera, microphone or location."}
      </p>
    </>
  );
}

function Network() {
  const { t, lang } = useOS();
  const [airplane, setAirplane] = useState(false);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const conn =
    (typeof navigator !== "undefined"
      ? (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection
      : undefined) ?? {};
  return (
    <>
      <h2>{t("pc.network")}</h2>
      <Toggle label={lang === "tr" ? "Uçak modu" : "Airplane mode"} on={airplane} onChange={setAirplane} />
      <h2>{lang === "tr" ? "Bağlantılar" : "Connections"}</h2>
      <div className="pcs-net">
        <Icon name="wifi" size={28} />
        <div>
          <strong>AFU-Ev</strong>
          <small>
            {airplane
              ? lang === "tr"
                ? "Kapalı"
                : "Off"
              : online
                ? lang === "tr"
                  ? "Bağlı"
                  : "Connected"
                : lang === "tr"
                  ? "İnternet erişimi yok"
                  : "No Internet access"}
          </small>
          {conn.effectiveType && <small>{`${conn.effectiveType.toUpperCase()} · ${conn.downlink ?? "?"} Mb/s`}</small>}
        </div>
      </div>
    </>
  );
}

function TimeLang() {
  const { t, lang, setPref } = useOS();
  const now = new Date(useTick(1000));
  return (
    <>
      <h2>{t("settings.language")}</h2>
      <div className="pcs-radio">
        {(["tr", "en"] as const).map((l) => (
          <button key={l} className={lang === l ? "on" : ""} onClick={() => setPref("lang", l)}>
            <span className="radio" /> {l === "tr" ? "Türkçe" : "English"}
          </button>
        ))}
      </div>
      <h2>{t("cal.today")}</h2>
      <p className="pcs-big">
        {now.toLocaleString(lang === "tr" ? "tr-TR" : "en-US", { dateStyle: "full", timeStyle: "medium" })}
      </p>
      <p className="dim">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
    </>
  );
}

function Ease() {
  const { t, sfx, motion, setPref } = useOS();
  return (
    <>
      <h2>{t("pc.ease")}</h2>
      <Toggle
        label={t("settings.motion")}
        on={motion === "full"}
        onChange={(v) => setPref("motion", v ? "full" : "reduced")}
      />
      <Toggle label={t("settings.sound")} on={sfx} onChange={(v) => setPref("sfx", v)} />
    </>
  );
}

function Update() {
  const { t, resetAchievements, toast, setTiles } = useOS();
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!checking) return;
    const id = window.setTimeout(() => setChecking(false), 2600);
    return () => window.clearTimeout(id);
  }, [checking]);
  return (
    <>
      <h2>{t("pc.update")}</h2>
      <p className="pcs-big">{checking ? t("pc.checking") : t("pc.upToDate")}</p>
      {checking && (
        <div className="dots-bar">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      <button className="btn" onClick={() => setChecking(true)} disabled={checking}>
        {t("pc.check")}
      </button>
      <h2>{t("settings.reset")}</h2>
      <button
        className="btn"
        onClick={() => {
          resetAchievements();
          toast({ title: t("settings.resetDone"), body: "", color: "#1e7145", icon: "achievements" });
        }}
      >
        {t("settings.reset")}
      </button>
      <h2>{t("tile.reset")}</h2>
      <button className="btn" onClick={() => setTiles(() => defaultTiles())}>
        {t("tile.reset")}
      </button>
      <h2>{t("pc.resetAll")}</h2>
      <p className="dim">{t("pc.resetAllNote")}</p>
      <button
        className="btn"
        onClick={() => {
          if (!window.confirm(t("pc.resetAllConfirm"))) return;
          try {
            Object.keys(window.localStorage)
              .filter((k) => k.startsWith("afu-metro:"))
              .forEach((k) => window.localStorage.removeItem(k));
          } catch {
            /* nothing stored */
          }
          window.location.reload();
        }}
      >
        {t("pc.resetAllGo")}
      </button>
    </>
  );
}

function PcInfo() {
  const { t, sessionStart, lang } = useOS();
  const now = useTick(1000);
  const s = Math.floor((now - sessionStart) / 1000);
  const rows: [string, string][] = [
    [t("pc.edition"), "Windows 8.1 Pro"],
    [t("pc.build"), "6.3.9600"],
    [lang === "tr" ? "Bilgisayar adı" : "PC name", `${profile.name}-PC`],
    [
      "CPU",
      `${typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? "?") : "?"} ${lang === "tr" ? "çekirdek" : "cores"}`,
    ],
    [t("pc.screen"), typeof window !== "undefined" ? `${window.innerWidth} × ${window.innerHeight}` : ""],
    [t("group.projects"), String(projects.length)],
    [t("pc.uptime"), `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`],
  ];
  return (
    <>
      <h2>{t("pc.pcInfo")}</h2>
      <dl className="p-details">
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="dim small">
        {lang === "tr"
          ? "Tarayıcıda çalışan, hayran yapımı bir Windows 8.1 yeniden yapımı. Microsoft ile bağlantılı değildir; tüm simgeler sıfırdan çizildi."
          : "A fan-made Windows 8.1 re-creation that runs in the browser. Not affiliated with Microsoft; every icon is drawn from scratch."}
      </p>
    </>
  );
}
