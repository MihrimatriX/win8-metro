"use client";
/** Lock screen (drag the curtain up), sign-in and the welcome / first-run "Hi" sequence. */
import { useEffect, useRef, useState } from "react";
import { useOS, useTick, type User } from "@/lib/os";
import { longDate, time } from "@/lib/i18n";
import { COLORS } from "@/lib/model";
import { media, profile, projects } from "@/content/portfolio";
import { CoverArt } from "./CoverArt";
import { Icon } from "./Icons";
import { Ring } from "./Shell";

export function lockArt(id: string) {
  const p = projects.find((x) => x.id === id);
  if (p) return { seed: p.id, motif: p.motif, palette: p.palette };
  const m = media.find((x) => x.id === id);
  if (m) return { seed: m.id, motif: m.motif, palette: m.palette };
  const f = projects[0];
  return { seed: f.id, motif: f.motif, palette: f.palette };
}

export function LockScreen() {
  const os = useOS();
  const { lang, lockImage, setPhase, phone, t, earn, notifications } = os;
  const now = new Date(useTick(5000));
  const [dy, setDy] = useState(0);
  const [state, setState] = useState<"idle" | "drag" | "leaving" | "bounce">("idle");
  const start = useRef<{ y: number; t: number } | null>(null);
  const moved = useRef(false);
  const art = lockArt(lockImage);

  const leave = (dragged: boolean) => {
    if (state === "leaving") return;
    if (dragged) earn("unlock");
    setState("leaving");
    window.setTimeout(() => setPhase(phone ? "os" : "login"), 420);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") return;
      leave(false);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 20) leave(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  });

  const onDown = (e: React.PointerEvent) => {
    if (state === "leaving") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, t: performance.now() };
    moved.current = false;
    setState("drag");
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const d = Math.min(0, e.clientY - start.current.y);
    if (d < -6) moved.current = true;
    setDy(d);
  };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const d = e.clientY - s.y;
    const v = d / Math.max(1, performance.now() - s.t);
    if (d < -window.innerHeight * 0.22 || v < -0.6) {
      leave(true);
      return;
    }
    setDy(0);
    if (!moved.current) {
      setState("bounce");
      window.setTimeout(() => setState("idle"), 650);
    } else setState("idle");
  };

  const unread = 3 + notifications.length;
  const style = state === "drag" ? { transform: `translateY(${dy}px)` } : undefined;
  return (
    <div className="lock-wrap">
      <div className="lock-under" style={{ background: "var(--start-bg)" }} />
      <div
        className={`lock lock-${state}`}
        style={style}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="button"
        aria-label={t("lock.hint")}
        tabIndex={0}
      >
        <CoverArt className="lock-art" seed={art.seed} motif={art.motif} palette={art.palette} animated />
        <div className="lock-shade" />
        <div className="lock-clock">
          <div className="lock-time">{time(now)}</div>
          <div className="lock-date">{longDate(lang, now)}</div>
          <div className="lock-badges">
            <span>
              <Icon name="mail" size={22} /> {unread}
            </span>
            <span>
              <Icon name="achievements" size={22} /> {Object.keys(os.earned).length}
            </span>
            <span className="lock-net">
              <Icon name="wifi" size={22} />
              <Icon name="battery" size={22} />
            </span>
          </div>
        </div>
        <div className="lock-hint">
          <Icon name="up" size={18} /> {phone ? t("lock.hint") : t("lock.hintMouse")}
        </div>
      </div>
    </div>
  );
}

/** Generated avatar: initials over a soft gradient in the accent color. */
export function Avatar({ user, size = 190 }: { user: User; size?: number }) {
  const label = user === "owner" ? profile.name.slice(0, 3) : user === "guest" ? "" : "HR";
  return (
    <div className={`avatar avatar-${user}`} style={{ width: size, height: size, fontSize: size * 0.3 }}>
      {user === "guest" ? <Icon name="user" size={size * 0.55} strokeWidth={1.2} /> : label}
    </div>
  );
}

export function Login() {
  const os = useOS();
  const { t, lang, setPref, signIn, power } = os;
  const [list, setList] = useState(false);
  const [chosen, setChosen] = useState<User>("owner");
  const [pw, setPw] = useState("");
  const [menu, setMenu] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!list) input.current?.focus({ preventScroll: true });
  }, [list, chosen]);

  const users: { id: User; name: string; note: string }[] = [
    { id: "owner", name: profile.name, note: t("login.owner") },
    { id: "guest", name: t("login.guest"), note: t("login.guestNote") },
    { id: "recruiter", name: t("login.recruiter"), note: t("login.recruiterNote") },
  ];
  const u = users.find((x) => x.id === chosen)!;

  return (
    <div className="login" onClick={() => setMenu(false)}>
      <Pattern />
      {list ? (
        <div className="login-users">
          {users.map((x) => (
            <button
              key={x.id}
              className="login-user"
              onClick={() => {
                setChosen(x.id);
                setList(false);
              }}
            >
              <Avatar user={x.id} size={120} />
              <strong>{x.name}</strong>
              <small>{x.note}</small>
            </button>
          ))}
        </div>
      ) : (
        <form
          className="login-one"
          onSubmit={(e) => {
            e.preventDefault();
            signIn(chosen);
          }}
        >
          <Avatar user={chosen} />
          <h1>{u.name}</h1>
          <p className="login-note">{u.note}</p>
          <div className="login-pw">
            <input ref={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("login.password")} aria-label={t("login.password")} />
            <button type="submit" aria-label={t("login.signIn")}>
              <Icon name="forward" size={20} />
            </button>
          </div>
          <p className="login-hint">{t("login.passwordHint")}</p>
        </form>
      )}

      <div className="login-bottom-left">
        {!list && (
          <button className="circle-btn" onClick={() => setList(true)} aria-label={t("login.switch")} title={t("login.switch")}>
            <Icon name="back" size={22} />
          </button>
        )}
        <button className="lang-chip" onClick={() => setPref("lang", lang === "tr" ? "en" : "tr")}>
          {lang === "tr" ? "TUR" : "ENG"}
        </button>
      </div>
      <div className="login-bottom-right" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" onClick={() => setMenu((m) => !m)} aria-label={t("settings.power")}>
          <Icon name="power" size={24} />
        </button>
        {menu && (
          <div className="flyout">
            <button onClick={() => power("sleep")}>{t("power.sleep")}</button>
            <button onClick={() => power("shutdown")}>{t("power.off")}</button>
            <button onClick={() => power("restart")}>{t("power.restart")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const HI_STEPS = ["hi.1", "hi.2", "hi.3", "hi.4"] as const;

export function Welcome() {
  const { t, firstRun, setPhase, earn, color } = useOS();
  const [step, setStep] = useState(0);
  const steps = firstRun ? HI_STEPS : null;

  useEffect(() => {
    if (!steps) {
      const id = window.setTimeout(() => setPhase("os"), 1500);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      if (step < steps.length - 1) setStep(step + 1);
      else setPhase("os");
    }, step === 2 ? 5200 : 2400);
    return () => window.clearTimeout(id);
  }, [step, steps, setPhase]);

  useEffect(() => {
    const id = window.setTimeout(() => earn("signin"), 1800);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!steps)
    return (
      <div className="welcome">
        <Pattern />
        <div className="welcome-row">
          <Ring size={30} />
          <span>{t("welcome")}</span>
        </div>
      </div>
    );

  // The first-run sequence slowly cycles through the Start colors, like the real setup screens.
  const hue = COLORS[(color + step * 3) % COLORS.length];
  return (
    <div
      className="hi"
      style={{ background: hue.bg }}
      onClick={() => setPhase("os")}
    >
      <div key={step} className="hi-text">
        {t(steps[step])}
      </div>
      {step === 2 && (
        <div className="hi-corner">
          <p>{t("hi.corner")}</p>
          <div className="hi-demo" aria-hidden="true">
            <div className="hi-demo-screen">
              <div className="hi-demo-charms">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="hi-demo-cursor" />
            </div>
          </div>
        </div>
      )}
      {step !== 2 && step > 0 && <Ring size={34} className="hi-ring" />}
      <small className="hi-skip">{t("hi.skip")}</small>
    </div>
  );
}

/** Decorative Start background pattern (also used on sign-in). `offset` gives the Start parallax. */
export function Pattern({ offset = 0 }: { offset?: number }) {
  const { pattern } = useOS();
  if (pattern === "none") return null;
  return (
    <div className="pattern" aria-hidden="true" style={{ transform: `translate3d(${-offset * 0.15}px,0,0)` }}>
      <svg viewBox="0 0 1600 400" preserveAspectRatio="xMinYMid slice">
        {pattern === "waves" &&
          Array.from({ length: 18 }, (_, i) => {
            let d = `M0 ${120 + i * 9}`;
            for (let x = 0; x <= 1600; x += 20) d += ` L${x} ${(120 + i * 9 + Math.sin(x / 140 + i * 0.35) * (40 + i * 2) + Math.sin(x / 47) * 6).toFixed(1)}`;
            return <path key={i} d={d} fill="none" stroke="#fff" strokeOpacity={0.05 + (i % 5) * 0.012} strokeWidth="1.2" />;
          })}
        {pattern === "geo" &&
          Array.from({ length: 40 }, (_, i) => {
            const x = (i * 97) % 1600;
            const y = (i * 53) % 400;
            const s = 30 + ((i * 37) % 90);
            return <polygon key={i} points={`${x},${y} ${x + s},${y + s * 0.5} ${x},${y + s}`} fill="#fff" fillOpacity={0.025 + (i % 4) * 0.012} />;
          })}
        {pattern === "circuit" &&
          Array.from({ length: 34 }, (_, i) => {
            const x = (i * 131) % 1600;
            const y = 30 + ((i * 71) % 340);
            const w = 60 + ((i * 29) % 160);
            return (
              <g key={i} stroke="#fff" strokeOpacity="0.08" fill="none" strokeWidth="1.5">
                <path d={`M${x} ${y} h${w} l20 20 v${30 + (i % 3) * 20}`} />
                <circle cx={x} cy={y} r="4" fill="#fff" fillOpacity="0.08" />
              </g>
            );
          })}
        {pattern === "bubbles" &&
          Array.from({ length: 46 }, (_, i) => (
            <circle key={i} cx={(i * 113) % 1600} cy={(i * 61) % 400} r={8 + ((i * 17) % 60)} fill="#fff" fillOpacity={0.02 + (i % 5) * 0.01} />
          ))}
      </svg>
    </div>
  );
}
