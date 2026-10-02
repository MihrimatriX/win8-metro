"use client";
/**
 * Run (Win+R): type a program, folder, document or web address and Windows opens it.
 * Understands program names (notepad, calc, mspaint…), paths relative to the user profile, %ENV% variables,
 * shell: folders, web addresses and "control <panel>". Remembers what was run, like the real MRU list.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useOS } from "@/lib/os";
import { fs, normalize, resolve, KNOWN, HOME, USER, RECYCLE } from "@/lib/fs";
import { appByExe, type AppId } from "@/lib/model";
import { wm } from "@/lib/wm";
import { sound } from "@/lib/sound";
import { ShellIcon } from "../../icons/ShellIcons";
import { Btn, useWindow, useWinKeys } from "../ui";
import { fileDialog, msgBox } from "../dialogs";
import { useOpenPath } from "../shell";
import "./run.css";

const MRU_KEY = "afu-metro:v2:run-mru";
const MRU_MAX = 26;

function loadMru(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(MRU_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function saveMru(list: string[]) {
  try {
    window.localStorage.setItem(MRU_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: Run just won't remember */
  }
}

/** Environment variables, as cmd.exe and Run expand them. */
const ENV: Record<string, string> = {
  userprofile: HOME,
  homepath: HOME.slice(2),
  homedrive: "C:",
  systemdrive: "C:",
  windir: "C:\\Windows",
  systemroot: "C:\\Windows",
  programfiles: "C:\\Program Files",
  "programfiles(x86)": "C:\\Program Files",
  public: "C:\\Users\\Public",
  username: USER,
  appdata: `${HOME}\\AppData\\Roaming`,
  localappdata: `${HOME}\\AppData\\Local`,
  temp: `${HOME}\\AppData\\Local\\Temp`,
  tmp: `${HOME}\\AppData\\Local\\Temp`,
};
function expandEnv(s: string) {
  return s.replace(/%([^%]+)%/g, (m, k: string) => ENV[k.toLowerCase()] ?? m);
}

/** shell:<name> folders (both the real canonical names and the friendly ones people guess). */
const SHELL: Record<string, string> = {
  desktop: KNOWN.desktop,
  personal: KNOWN.documents,
  documents: KNOWN.documents,
  "my documents": KNOWN.documents,
  downloads: KNOWN.downloads,
  "my pictures": KNOWN.pictures,
  pictures: KNOWN.pictures,
  "my music": KNOWN.music,
  music: KNOWN.music,
  "my video": KNOWN.videos,
  videos: KNOWN.videos,
  profile: HOME,
  userprofiles: "C:\\Users",
  favorites: `${HOME}\\Favorites`,
  windows: "C:\\Windows",
  system: "C:\\Windows\\System32",
  programfiles: "C:\\Program Files",
  recyclebinfolder: RECYCLE,
  public: "C:\\Users\\Public",
};

/** "control <name>" → Control Panel page. */
const CONTROL: Record<string, string> = {
  desktop: "personalize",
  color: "personalize",
  "desk.cpl": "display",
  display: "display",
  mouse: "mouse",
  "main.cpl": "mouse",
  keyboard: "keyboard",
  "date/time": "clock",
  "timedate.cpl": "clock",
  "appwiz.cpl": "programs",
  "mmsys.cpl": "sound",
  "powercfg.cpl": "power",
  fonts: "fonts",
  international: "region",
  "intl.cpl": "region",
  "access.cpl": "ease",
  userpasswords: "accounts",
  "nusrmgr.cpl": "accounts",
  printers: "devices",
  "wuaucpl.cpl": "update",
  "sysdm.cpl": "system",
  system: "system",
};

/** Split `cmd` into the program part and its arguments ("notepad C:\a.txt", "\"C:\Program Files\x\" y"). */
function splitCommand(cmd: string): [string, string] {
  const s = cmd.trim();
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1);
    if (end > 0) return [s.slice(1, end), s.slice(end + 1).trim()];
  }
  const i = s.search(/\s/);
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1).trim()];
}

/** Where a relative name is looked for: the user profile (Run's working folder), then the Windows folders. */
function findPath(name: string): string | null {
  const n = name.trim().replace(/^"|"$/g, "");
  if (!n) return null;
  if (/^[a-z]:$/i.test(n)) return fs.exists(`${n}\\`) ? normalize(`${n}\\`) : null;
  const candidates = /^[a-z]:|^\\/i.test(n) ? [resolve(HOME, n)] : [resolve(HOME, n), resolve("C:\\Windows\\System32", n), resolve("C:\\Windows", n)];
  for (const c of candidates) {
    if (fs.exists(c)) return c;
    // "notepad" finds notepad.exe in the Windows folders.
    if (!/\.[a-z0-9]+$/i.test(c) && fs.exists(`${c}.exe`)) return `${c}.exe`;
  }
  return null;
}

export default function RunApp() {
  const { id, close } = useWindow();
  const { lang, open } = useOS();
  const openPath = useOpenPath();
  const tr = lang === "tr";
  const [mru, setMru] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [list, setList] = useState(false);
  const [hot, setHot] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const fieldId = useId();

  // Start with the last command, selected — like the real dialog.
  useEffect(() => {
    const m = loadMru();
    setMru(m);
    if (m[0]) setValue(m[0]);
    window.setTimeout(() => {
      input.current?.focus();
      input.current?.select();
    }, 30);
  }, []);

  const launch = (app: AppId, param?: string) => open({ kind: "app", app, param });

  /** Try to run `raw`; true when something opened. */
  const execute = (raw: string): boolean => {
    const cmd = expandEnv(raw.trim());
    if (!cmd) return false;
    const low = cmd.toLowerCase();

    // Web addresses go to Internet Explorer.
    if (/^(https?|ftp):\/\//i.test(cmd) || /^www\.[^\s]+\.[a-z]{2,}/i.test(cmd)) {
      launch("ie", /^www\./i.test(cmd) ? `http://${cmd}` : cmd);
      return true;
    }
    if (low.startsWith("mailto:")) {
      launch("mail");
      return true;
    }
    if (low.startsWith("ms-settings:")) {
      launch("settings");
      return true;
    }
    // shell:Desktop, shell:Downloads…
    if (low.startsWith("shell:")) {
      const key = low.slice(6).trim();
      if (key === "mycomputerfolder") {
        wm.launch("explorer");
        return true;
      }
      if (key === "controlpanelfolder") {
        launch("control");
        return true;
      }
      const p = SHELL[key];
      if (p && fs.exists(p)) {
        wm.launch("explorer", { arg: normalize(p) });
        return true;
      }
      return false;
    }
    // A whole path, spaces included ("C:\Program Files").
    const whole = findPath(cmd);
    if (whole) return openPath(whole);

    const [prog, args] = splitCommand(cmd);
    const progLow = prog.toLowerCase().replace(/\.exe$/, "");
    if (progLow === "control") {
      const page = args ? CONTROL[args.toLowerCase().replace(/^\/name\s+microsoft\./, "")] ?? args.toLowerCase() : undefined;
      launch("control", page);
      return true;
    }
    if (progLow === "explorer") {
      if (!args) {
        wm.launch("explorer");
        return true;
      }
      const p = findPath(expandEnv(args));
      if (!p) return false;
      if (fs.isDir(p)) wm.launch("explorer", { arg: p });
      else openPath(p);
      return true;
    }
    if (progLow === "iexplore" && args) {
      launch("ie", /^[a-z]+:\/\//i.test(args) ? args : `http://${args}`);
      return true;
    }
    const app = appByExe(prog);
    if (app && app.kind === "desktop") {
      // Programs that open documents get the (resolved) path.
      const p = args ? findPath(args) : null;
      const takesFile = ["notepad", "wordpad", "paint", "ie"].includes(app.id);
      if (takesFile && args) launch(app.id, p ?? resolve(HOME, args));
      else launch(app.id);
      return true;
    }
    // A program found on disk ("C:\Windows\System32\calc.exe", "System32\cmd.exe").
    const exe = findPath(prog);
    if (exe) return openPath(exe);
    return false;
  };

  const run = async (raw = value) => {
    const cmd = raw.trim();
    if (!cmd || busy.current) return;
    setList(false);
    if (execute(cmd)) {
      const next = [cmd, ...mru.filter((m) => m.toLowerCase() !== cmd.toLowerCase())].slice(0, MRU_MAX);
      saveMru(next);
      setMru(next);
      sound.tap();
      close();
      return;
    }
    busy.current = true;
    await msgBox(id, {
      title: cmd,
      text: tr
        ? `Windows '${cmd}' öğesini bulamıyor. Adı doğru yazdığınızdan emin olun ve yeniden deneyin.`
        : `Windows cannot find '${cmd}'. Make sure you typed the name correctly, and then try again.`,
      icon: "error",
      buttons: [tr ? "Tamam" : "OK"],
    });
    busy.current = false;
    window.setTimeout(() => {
      input.current?.focus();
      input.current?.select();
    }, 20);
  };

  const browse = async () => {
    setList(false);
    const p = await fileDialog(id, {
      mode: "open",
      title: tr ? "Gözat" : "Browse",
      lang,
      dir: "C:\\Windows\\System32",
      filters: [
        { label: tr ? "Programlar" : "Programs", exts: ["exe", "com", "bat", "cmd", "lnk"] },
        { label: tr ? "Tüm Dosyalar" : "All Files", exts: ["*"] },
      ],
    });
    if (p) setValue(/\s/.test(p) ? `"${p}"` : p);
    window.setTimeout(() => input.current?.focus(), 20);
  };

  useWinKeys({ escape: () => (list ? setList(false) : close()) });

  return (
    <div className="run" onPointerDown={(e) => !(e.target as HTMLElement).closest(".run-combo") && setList(false)}>
      <div className="run-main">
        <div className="run-head">
          <ShellIcon name="run" size={32} />
          <p>{tr ? "Bir program, klasör, belge veya İnternet kaynağının adını yazın; Windows sizin için açsın." : "Type the name of a program, folder, document, or Internet resource, and Windows will open it for you."}</p>
        </div>
        <div className="run-row">
          <label htmlFor={fieldId}>
            {tr ? (
              <>
                <u>A</u>ç:
              </>
            ) : (
              <>
                <u>O</u>pen:
              </>
            )}
          </label>
          <div className="run-combo">
            <input
              id={fieldId}
              ref={input}
              value={value}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setValue(e.target.value);
                setHot(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (list && hot >= 0 && mru[hot]) {
                    setValue(mru[hot]);
                    setList(false);
                  } else void run();
                } else if (e.key === "ArrowDown" && (e.altKey || list)) {
                  e.preventDefault();
                  if (!list) setList(true);
                  else setHot((h) => Math.min(mru.length - 1, h + 1));
                } else if (e.key === "ArrowUp" && list) {
                  e.preventDefault();
                  setHot((h) => Math.max(0, h - 1));
                } else if (e.key === "ArrowDown" && mru.length) {
                  // Without the list open, the arrows walk through the history in place.
                  e.preventDefault();
                  const i = Math.min(mru.length - 1, mru.indexOf(value) + 1);
                  setValue(mru[i]);
                } else if (e.key === "ArrowUp" && mru.length) {
                  e.preventDefault();
                  const i = Math.max(0, mru.indexOf(value) - 1);
                  setValue(mru[i]);
                }
              }}
            />
            <button
              className={`run-drop ${list ? "on" : ""}`}
              tabIndex={-1}
              aria-label="history"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setList((l) => !l);
                setHot(Math.max(0, mru.indexOf(value)));
                input.current?.focus();
              }}
            >
              <svg width="7" height="4" viewBox="0 0 7 4">
                <path d="M0 0h7L3.5 4z" fill="currentColor" />
              </svg>
            </button>
            {list && (
              <div className="run-list" role="listbox">
                {mru.length ? (
                  mru.map((m, i) => (
                    <div
                      key={m}
                      role="option"
                      aria-selected={i === hot}
                      className={i === hot ? "on" : ""}
                      onPointerEnter={() => setHot(i)}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setValue(m);
                        setList(false);
                        input.current?.focus();
                        input.current?.select();
                      }}
                    >
                      {m}
                    </div>
                  ))
                ) : (
                  <div className="run-empty" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="run-btns">
        <Btn primary disabled={!value.trim()} onClick={() => void run()}>
          {tr ? "Tamam" : "OK"}
        </Btn>
        <Btn onClick={() => close()}>{tr ? "İptal" : "Cancel"}</Btn>
        <Btn onClick={() => void browse()}>{tr ? "Gözat..." : "Browse..."}</Btn>
      </div>
    </div>
  );
}
