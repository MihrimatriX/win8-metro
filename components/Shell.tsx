"use client";
import { useEffect, useState } from "react";
import { OSProvider, useOS } from "@/lib/os";
import { sound } from "@/lib/sound";
import { WinLogo } from "./Icons";
import { DesktopShell } from "./desktop/DesktopShell";
import { LockScreen, Login, Welcome } from "./Lock";
import { StartScreen } from "./Start";
import { AppHost, AppsView } from "./AppHost";
import { Charms, Toasts } from "./Charms";
import { Phone } from "./Phone";

export default function App() {
  return (
    <OSProvider>
      <Root />
    </OSProvider>
  );
}

/** The Win8 progress ring: five dots chasing each other around a circle. */
export function Ring({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <div className={`ring ${className ?? ""}`} style={{ width: size, height: size }} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ animationDelay: `${i * 0.12}s` }}>
          <i />
        </span>
      ))}
    </div>
  );
}

function Root() {
  const os = useOS();
  const { phase, setPhase, phone } = os;

  // Unlock audio on the first gesture anywhere.
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Boot → lock screen.
  useEffect(() => {
    if (phase !== "boot") return;
    const id = window.setTimeout(() => setPhase("lock"), 2600);
    return () => window.clearTimeout(id);
  }, [phase, setPhase]);

  return (
    <div className="screen" data-phase={phase}>
      {phase === "off" && <Off />}
      {phase === "boot" && <Boot />}
      {phase === "lock" && <LockScreen />}
      {phase === "login" && <Login />}
      {phase === "welcome" && <Welcome />}
      {phase === "os" && (phone ? <Phone /> : <Desktop />)}
      {phase === "power" && <PowerScreen />}
    </div>
  );
}

function Off() {
  const { setPhase, t } = useOS();
  useEffect(() => {
    const on = () => setPhase("boot");
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [setPhase]);
  return (
    <button className="off" onClick={() => setPhase("boot")}>
      <span>{t("off.title")}</span>
      <small>{t("boot.hint")}</small>
    </button>
  );
}

function Boot() {
  const [skip, setSkip] = useState(false);
  const { setPhase } = useOS();
  useEffect(() => {
    if (skip) setPhase("lock");
  }, [skip, setPhase]);
  return (
    <div className="boot" onClick={() => setSkip(true)}>
      <WinLogo size={110} className="boot-logo" />
      <Ring size={44} className="boot-ring" />
    </div>
  );
}

function PowerScreen() {
  const { powerAction, t } = useOS();
  const label = powerAction === "restart" ? t("restart") : powerAction === "signout" ? t("signout") : t("shutdown");
  return (
    <div className="power-screen">
      <Ring size={36} />
      <span>{label}</span>
    </div>
  );
}

/** Tablet / PC layout: Start, apps, charms and toasts. */
function Desktop() {
  const os = useOS();
  const { view, charm, setCharm, back, canBack, open, recent } = os;

  // Keyboard: Esc goes back (or closes charms); typing on Start opens Search, like the real thing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (e.key === "Escape" || (e.key === "Backspace" && !typing)) {
        if (charm) setCharm(null);
        else if (view.kind === "apps") open({ kind: "start" });
        else if (canBack) back();
        e.preventDefault();
        return;
      }
      if (e.key === "Meta" || e.key === "OS") {
        if (view.kind === "start" && recent[0]) open(recent[0]);
        else open({ kind: "start" });
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (view.kind === "start" && !charm && e.key.length === 1 && /\p{L}|\p{N}/u.test(e.key)) {
        setCharm("search");
        window.dispatchEvent(new CustomEvent("metro:search", { detail: e.key }));
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, charm, setCharm, back, canBack, open, recent]);

  const onDesktop = view.kind === "app" && view.app === "desktop";
  // The desktop stays mounted after the first visit so its windows survive trips to Start.
  const [deskMounted, setDeskMounted] = useState(false);
  useEffect(() => {
    if (onDesktop) setDeskMounted(true);
  }, [onDesktop]);

  return (
    <div className="desk" data-view={view.kind}>
      {(deskMounted || onDesktop) && <DesktopShell active={onDesktop} />}
      <StartScreen hidden={view.kind !== "start"} />
      {view.kind === "apps" && <AppsView />}
      {view.kind === "app" && !onDesktop && <AppHost key={`${view.app}`} view={view} />}
      <Charms />
      <Toasts />
    </div>
  );
}
