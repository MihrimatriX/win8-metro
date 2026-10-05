"use client";
/**
 * Notepad (Not Defteri) as in Windows 8.1: a plain-text editor with the classic menu bar, Find / Replace / Go To,
 * Word Wrap, the Font dialog, an optional status bar, Page Setup, printing and "save changes?" prompts.
 * Files are read from and saved to the virtual file system (CRLF line endings, like the real thing).
 *
 * Also exports the pieces WordPad shares with it: the "save changes?" task dialog, the Find / Replace dialogs,
 * text search and printing.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useOS } from "@/lib/os";
import { fs, basename, dirname, normalize, KNOWN } from "@/lib/fs";
import { wm } from "@/lib/wm";
import { MenuBar, ContextMenu, Btn, useWindow, useWinKeys, useCloseGuard, type MenuItem } from "../ui";
import { fileDialog, msgBox, openDialog, type FileFilter } from "../dialogs";
import { DND_TYPE, readDrag } from "../shell";
import "./notepad.css";

type Lang = "tr" | "en";

// =====================================================================================================
// Shared with WordPad
// =====================================================================================================

/** Wait for a dialog window to go away (closing it with X counts as Cancel). */
function onGone(id: string, fn: () => void) {
  const unsub = wm.subscribe(() => {
    if (!wm.get(id)) {
      unsub();
      fn();
    }
  });
}

/**
 * The Vista-style task dialog Notepad and WordPad show before throwing work away:
 * "Do you want to save changes to Untitled?" with Save / Don't Save / Cancel. Resolves 0, 1 or 2.
 */
export function askSave(owner: string, title: string, text: string, lang: Lang): Promise<number> {
  const tr = lang === "tr";
  const w = Math.round(Math.min(540, Math.max(370, text.length * 7.8 + 56)));
  const lines = Math.max(1, Math.ceil((text.length * 8.6) / (w - 60)));
  const h = 39 + 44 + lines * 21 + 44;
  return new Promise((resolve) => {
    let done = false;
    const pick = (i: number) => {
      if (done) return;
      done = true;
      resolve(i);
    };
    const id = openDialog(owner, {
      title,
      w,
      h,
      render: (close) => (
        <SaveTask
          text={text}
          buttons={tr ? ["Kaydet", "Kaydetme", "İptal"] : ["Save", "Don't Save", "Cancel"]}
          onPick={(i) => {
            pick(i);
            close();
          }}
        />
      ),
    });
    onGone(id, () => pick(2));
  });
}

function SaveTask({ text, buttons, onPick }: { text: string; buttons: string[]; onPick: (i: number) => void }) {
  useWinKeys({ escape: () => onPick(2) });
  return (
    <div className="np-task">
      <p className="np-task-main">{text}</p>
      <div className="np-task-btns">
        {buttons.map((b, i) => (
          <Btn key={b} primary={i === 0} autoFocus={i === 0} onClick={() => onPick(i)}>
            {b}
          </Btn>
        ))}
      </div>
    </div>
  );
}

export type FindOpts = { matchCase: boolean; up: boolean; wholeWord: boolean };
/** Remembered between openings of the Find / Replace dialogs (and used by F3). */
export type FindState = FindOpts & { term: string; repl: string };
/** What the Find / Replace dialogs act on. */
export type FindTarget = {
  /** Select the next match; false when there is none. */
  find: (term: string, o: FindOpts) => boolean;
  /** Replace the selected match (when the selection is one), then select the next; false when none is left. */
  replace: (term: string, repl: string, o: FindOpts) => boolean;
  /** Replace every match; returns how many. */
  replaceAll: (term: string, repl: string, o: FindOpts) => number;
};

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);

/** Lower-case without changing the length (so indexes still line up with the original text). */
function fold(s: string, lang: Lang) {
  const loc = lang === "tr" ? "tr-TR" : "en-US";
  let out = "";
  for (const ch of s) {
    const l = ch.toLocaleLowerCase(loc);
    out += l.length === ch.length ? l : ch;
  }
  return out;
}

/** Find `term` in `hay` from `from` (searching up means: the last match that ends at or before `from`). */
export function searchText(hay: string, term: string, from: number, o: FindOpts, lang: Lang): number {
  if (!term) return -1;
  const H = o.matchCase ? hay : fold(hay, lang);
  const N = o.matchCase ? term : fold(term, lang);
  const ok = (i: number) => !o.wholeWord || (!isWordChar(H[i - 1]) && !isWordChar(H[i + N.length]));
  if (o.up) {
    for (let i = H.lastIndexOf(N, Math.max(0, from - N.length)); i >= 0; i = i > 0 ? H.lastIndexOf(N, i - 1) : -1) {
      if (i + N.length <= from && ok(i)) return i;
    }
    return -1;
  }
  for (let i = H.indexOf(N, from); i >= 0; i = H.indexOf(N, i + 1)) if (ok(i)) return i;
  return -1;
}

/** Whether `sel` is a match for `term` under the options (Replace replaces only a real match). */
export function sameText(sel: string, term: string, o: FindOpts, lang: Lang) {
  return o.matchCase ? sel === term : fold(sel, lang) === fold(term, lang);
}

/** Open the Find (or Replace) dialog for a document. */
export function openFind(
  owner: string,
  opts: {
    replace: boolean;
    lang: Lang;
    /** Title of the "not found" message box. */
    appName: string;
    /** Text of the "not found" message box. */
    notFound: (term: string) => string;
    state: FindState;
    target: () => FindTarget;
    /** Notepad's Find has Up / Down; WordPad's has "Match whole word only". */
    direction?: boolean;
    wholeWord?: boolean;
  },
) {
  const tr = opts.lang === "tr";
  const extraRow = opts.wholeWord ? 22 : 0;
  return openDialog(owner, {
    title: opts.replace ? (tr ? "Değiştir" : "Replace") : tr ? "Bul" : "Find",
    w: 392,
    h: (opts.replace ? 196 : 158) + extraRow,
    render: (close) => <FindDlg {...opts} close={close} />,
  });
}

function FindDlg({
  replace,
  lang,
  appName,
  notFound,
  state,
  target,
  direction,
  wholeWord,
  close,
}: {
  replace: boolean;
  lang: Lang;
  appName: string;
  notFound: (term: string) => string;
  state: FindState;
  target: () => FindTarget;
  direction?: boolean;
  wholeWord?: boolean;
  close: () => void;
}) {
  const { id } = useWindow();
  const tr = lang === "tr";
  const [term, setTerm] = useState(state.term);
  const [repl, setRepl] = useState(state.repl);
  const [matchCase, setMatchCase] = useState(state.matchCase);
  const [whole, setWhole] = useState(state.wholeWord);
  const [up, setUp] = useState(state.up);
  const box = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);

  const o = (): FindOpts => ({ matchCase, up: !replace && !!direction && up, wholeWord: !!wholeWord && whole });
  const remember = () => Object.assign(state, { term, repl, ...o(), up: up && !!direction });
  const miss = async () => {
    busy.current = true;
    await msgBox(id, { title: appName, text: notFound(term), icon: "info", buttons: [tr ? "Tamam" : "OK"] });
    busy.current = false;
    box.current?.focus();
  };
  const next = () => {
    if (!term || busy.current) return;
    remember();
    if (!target().find(term, o())) void miss();
  };
  const one = () => {
    if (!term || busy.current) return;
    remember();
    if (!target().replace(term, repl, o())) void miss();
  };
  const all = () => {
    if (!term || busy.current) return;
    remember();
    target().replaceAll(term, repl, o());
  };

  useWinKeys({
    escape: () => {
      remember();
      close();
    },
    enter: (e) => {
      if ((e.target as HTMLElement).tagName === "BUTTON") return false;
      next();
    },
    f3: () => next(),
  });

  const L = (a: string, b: string) => (tr ? a : b);
  return (
    <div className={`np-dlg np-find ${replace ? "is-replace" : ""}`}>
      <div className="np-find-fields">
        <label className="np-find-row">
          <span>{L("Aranan:", "Find what:")}</span>
          <input
            ref={box}
            className="w8-input"
            value={term}
            spellCheck={false}
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>
        {replace && (
          <label className="np-find-row">
            <span>{L("Yeni değer:", "Replace with:")}</span>
            <input className="w8-input" value={repl} spellCheck={false} onChange={(e) => setRepl(e.target.value)} />
          </label>
        )}
        <div className="np-find-opts">
          <div className="np-find-checks">
            {wholeWord && (
              <label className="np-check">
                <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} />
                {L("Yalnızca sözcüğün tamamını bul", "Match whole word only")}
              </label>
            )}
            <label className="np-check">
              <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
              {L("Büyük/küçük harf duyarlı", "Match case")}
            </label>
          </div>
          {direction && !replace && (
            <fieldset className="np-group np-find-dir">
              <legend>{L("Yön", "Direction")}</legend>
              <label className="np-check">
                <input type="radio" name={`${id}-dir`} checked={up} onChange={() => setUp(true)} />
                {L("Yukarı", "Up")}
              </label>
              <label className="np-check">
                <input type="radio" name={`${id}-dir`} checked={!up} onChange={() => setUp(false)} />
                {L("Aşağı", "Down")}
              </label>
            </fieldset>
          )}
        </div>
      </div>
      <div className="np-find-btns">
        <Btn primary disabled={!term} onClick={next}>
          {L("Sonrakini Bul", "Find Next")}
        </Btn>
        {replace && (
          <>
            <Btn disabled={!term} onClick={one}>
              {L("Değiştir", "Replace")}
            </Btn>
            <Btn disabled={!term} onClick={all}>
              {L("Tümünü Değiştir", "Replace All")}
            </Btn>
          </>
        )}
        <Btn
          onClick={() => {
            remember();
            close();
          }}
        >
          {L("İptal", "Cancel")}
        </Btn>
      </div>
    </div>
  );
}

const escHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Print through a hidden frame so only the document (not the whole desktop) reaches the printer. */
export function printHtml(title: string, bodyHtml: string, css: string) {
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(f);
  const d = f.contentDocument;
  const w = f.contentWindow;
  if (!d || !w) {
    f.remove();
    return;
  }
  d.open();
  d.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`,
  );
  d.close();
  window.setTimeout(() => {
    try {
      w.focus();
      w.print();
    } finally {
      window.setTimeout(() => f.remove(), 1500);
    }
  }, 60);
}

/** Where the caret at `pos` sits inside a textarea's content (measured with a hidden mirror). */
function caretXY(t: HTMLTextAreaElement, pos: number) {
  const cs = getComputedStyle(t);
  const m = document.createElement("div");
  const copy = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "lineHeight",
    "letterSpacing",
    "tabSize",
    "paddingTop",
    "paddingLeft",
    "paddingRight",
    "paddingBottom",
    "whiteSpace",
    "overflowWrap",
    "wordBreak",
    "direction",
  ] as const;
  for (const p of copy) m.style[p] = cs[p];
  Object.assign(m.style, {
    position: "absolute",
    visibility: "hidden",
    top: "0",
    left: "-99999px",
    boxSizing: "border-box",
    border: "0",
    width: `${t.clientWidth}px`,
  });
  m.textContent = t.value.slice(0, pos);
  const sp = document.createElement("span");
  sp.textContent = t.value.slice(pos, pos + 1) || ".";
  m.appendChild(sp);
  document.body.appendChild(m);
  const r = { x: sp.offsetLeft, y: sp.offsetTop, h: sp.offsetHeight };
  m.remove();
  return r;
}

/** Scroll a textarea so `pos` is in view. */
function revealPos(t: HTMLTextAreaElement, pos: number) {
  const { x, y, h } = caretXY(t, pos);
  if (y < t.scrollTop) t.scrollTop = Math.max(0, y - h);
  else if (y + h > t.scrollTop + t.clientHeight) t.scrollTop = y + h * 2 - t.clientHeight;
  if (x < t.scrollLeft) t.scrollLeft = Math.max(0, x - 60);
  else if (x + 16 > t.scrollLeft + t.clientWidth) t.scrollLeft = x - t.clientWidth + 80;
}

/** A Win32-style group box. */
function Group({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <fieldset className={`np-group ${className ?? ""}`}>
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}

// =====================================================================================================
// Notepad
// =====================================================================================================

type FontStyle = "normal" | "italic" | "bold" | "bolditalic";
type NpFont = { family: string; style: FontStyle; size: number };
type PageSetup = {
  paper: string;
  orient: "portrait" | "landscape";
  left: number;
  right: number;
  top: number;
  bottom: number;
  header: string;
  footer: string;
};
type NpPrefs = { wrap: boolean; status: boolean; font: NpFont; page: PageSetup };

const PREFS_KEY = "afu-metro:v2:notepad";
const DEFAULT_PREFS: NpPrefs = {
  wrap: false,
  status: false,
  font: { family: "Lucida Console", style: "normal", size: 10 },
  page: { paper: "A4", orient: "portrait", left: 20, right: 20, top: 25, bottom: 25, header: "&f", footer: "" },
};

/** Fonts in the Font dialog, with fallbacks for machines that don't have them. */
const FONTS: Record<string, string> = {
  Arial: `Arial, "Liberation Sans", Helvetica, sans-serif`,
  Calibri: `Calibri, Carlito, "Segoe UI", sans-serif`,
  Cambria: `Cambria, Caladea, Georgia, serif`,
  "Comic Sans MS": `"Comic Sans MS", "Comic Neue", cursive`,
  Consolas: `Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace`,
  "Courier New": `"Courier New", Courier, "Liberation Mono", monospace`,
  Georgia: `Georgia, "DejaVu Serif", serif`,
  "Lucida Console": `"Lucida Console", "Lucida Sans Typewriter", Monaco, "DejaVu Sans Mono", monospace`,
  "Segoe UI": `"Segoe UI", Selawik, "Open Sans", sans-serif`,
  Tahoma: `Tahoma, Verdana, "DejaVu Sans", sans-serif`,
  "Times New Roman": `"Times New Roman", "Liberation Serif", Times, serif`,
  "Trebuchet MS": `"Trebuchet MS", "DejaVu Sans", sans-serif`,
  Verdana: `Verdana, "DejaVu Sans", sans-serif`,
};
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

function loadPrefs(): NpPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<NpPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...raw,
      font: { ...DEFAULT_PREFS.font, ...raw.font },
      page: { ...DEFAULT_PREFS.page, ...raw.page },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

const fontCss = (f: NpFont): React.CSSProperties => ({
  fontFamily: FONTS[f.family] ?? `"${f.family}", monospace`,
  fontSize: `${Math.round((f.size * 4) / 3)}px`,
  fontWeight: f.style.startsWith("bold") ? 700 : 400,
  fontStyle: f.style.endsWith("italic") ? "italic" : "normal",
});

/** File contents as the editor holds them (LF), or null when the path isn't a readable file. */
function readText(path: string): string | null {
  const n = fs.get(path);
  if (!n || n.kind === "dir" || n.kind === "drive") return null;
  return (n.text ?? "").replace(/\r\n?/g, "\n");
}

/** "11:24 02.10.2026", what F5 inserts. */
function stamp(lang: Lang) {
  const d = new Date();
  if (lang === "tr") {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
  return `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ${d.toLocaleDateString("en-US")}`;
}

/** Fallback clipboard when the browser won't let us read the real one. */
let localClip = "";

export default function NotepadApp() {
  const { id, win, focused, setTitle } = useWindow();
  const { lang, openApp } = useOS();
  const tr = lang === "tr";
  const L = (a: string, b: string) => (tr ? a : b);
  const appName = L("Not Defteri", "Notepad");
  const untitled = L("Adsız", "Untitled");

  const [path, setPath] = useState<string | null>(() => (win.arg ? normalize(win.arg) : null));
  const [text, setText] = useState(() => (win.arg ? (readText(win.arg) ?? "") : ""));
  const [saved, setSaved] = useState(text);
  const [prefs, setPrefs] = useState<NpPrefs>(loadPrefs);
  const [caret, setCaret] = useState({ line: 1, col: 1, sel: false });
  const [rtl, setRtl] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const findState = useRef<FindState>({ term: "", repl: "", matchCase: false, up: false, wholeWord: false });
  const dirty = text !== saved;
  const filters: FileFilter[] = [
    { label: L("Metin Belgeleri (*.txt)", "Text Documents (*.txt)"), exts: ["txt"] },
    { label: L("Tüm Dosyalar (*.*)", "All Files (*.*)"), exts: ["*"] },
  ];

  // Settings survive between sessions, like Notepad's registry key.
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* not remembered */
    }
  }, [prefs]);
  const setPref = <K extends keyof NpPrefs>(k: K, v: NpPrefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    setTitle(`${path ? basename(path) : untitled} - ${appName}`);
  }, [path, untitled, appName, setTitle]);

  // Opened with a path that isn't there: offer to create it, like the real Notepad.
  useEffect(() => {
    const p = win.arg ? normalize(win.arg) : null;
    if (!p || readText(p) !== null) return;
    void (async () => {
      const r = await msgBox(id, {
        title: appName,
        text: tr
          ? `${p} dosyası bulunamıyor.\n\nYeni dosya oluşturmak istiyor musunuz?`
          : `Cannot find the ${p} file.\n\nDo you want to create a new file?`,
        icon: "warning",
        buttons: tr ? ["Evet", "Hayır", "İptal"] : ["Yes", "No", "Cancel"],
      });
      if (r === 0) {
        try {
          fs.writeText(p, "");
          return;
        } catch {
          /* the folder isn't there either: fall back to Untitled */
        }
      }
      if (r === 2 || r === -1) {
        wm.close(id);
        return;
      }
      setPath(null);
    })();
    // Only for the path the window was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A freshly loaded document starts at the top with the caret at the beginning.
  useEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.setSelectionRange(0, 0);
    t.scrollTop = 0;
    t.scrollLeft = 0;
    setCaret({ line: 1, col: 1, sel: false });
  }, [loaded]);

  // Activating the window puts the caret back in the text.
  useEffect(() => {
    if (focused) ta.current?.focus({ preventScroll: true });
  }, [focused]);

  const updateCaret = () => {
    const t = ta.current;
    if (!t) return;
    const pos = t.selectionDirection === "backward" ? t.selectionStart : t.selectionEnd;
    const before = t.value.slice(0, pos);
    const line = before.split("\n").length;
    setCaret({ line, col: pos - before.lastIndexOf("\n"), sel: t.selectionStart !== t.selectionEnd });
  };

  const focusTa = () => {
    const t = ta.current;
    t?.focus({ preventScroll: true });
    return t;
  };

  /** Select a range in the text and scroll to it, leaving keyboard focus where it was (the Find dialog). */
  const selectRange = (s: number, e: number) => {
    const t = ta.current;
    if (!t) return;
    const back = document.activeElement as HTMLElement | null;
    t.focus({ preventScroll: true });
    t.setSelectionRange(s, e);
    revealPos(t, s);
    if (back && back !== t && back !== document.body) back.focus({ preventScroll: true });
    updateCaret();
  };

  // ---------- files ----------

  const load = (p: string, body: string) => {
    setPath(p);
    setText(body);
    setSaved(body);
    setLoaded((n) => n + 1);
  };

  const writeTo = async (p: string, body: string): Promise<boolean> => {
    try {
      fs.write(p, { text: body.replace(/\n/g, "\r\n") });
    } catch {
      await msgBox(id, {
        title: appName,
        text: tr
          ? `${p}\nDosya kaydedilemedi. Klasör bulunamadı.`
          : `${p}\nThe file could not be saved. The folder doesn't exist.`,
        icon: "error",
        buttons: [L("Tamam", "OK")],
      });
      return false;
    }
    setPath(p);
    setSaved(body);
    return true;
  };

  const saveAs = async (): Promise<boolean> => {
    const body = text;
    for (;;) {
      const p = await fileDialog(id, {
        mode: "save",
        lang,
        filters,
        name: path ? basename(path) : "*.txt",
        dir: path ? dirname(path) : KNOWN.documents,
      });
      if (!p) return false;
      if (/[*?"<>|]/.test(basename(p))) {
        await msgBox(id, {
          title: L("Farklı Kaydet", "Save As"),
          text: `${basename(p)}\n${L("Dosya adı geçerli değil.", "The file name is not valid.")}`,
          icon: "warning",
          buttons: [L("Tamam", "OK")],
        });
        continue;
      }
      return writeTo(p, body);
    }
  };

  const save = async (): Promise<boolean> => (path ? writeTo(path, text) : saveAs());

  /** Before New / Open / Exit: ask about unsaved changes. True when it's fine to go on. */
  const confirmSave = async (): Promise<boolean> => {
    if (!dirty) return true;
    const name = path ?? untitled;
    const r = await askSave(
      id,
      appName,
      tr ? `Değişiklikleri ${name} dosyasına kaydetmek istiyor musunuz?` : `Do you want to save changes to ${name}?`,
      lang,
    );
    if (r === 0) return save();
    return r === 1;
  };

  useCloseGuard(confirmSave, dirty);

  const newDoc = async () => {
    if (!(await confirmSave())) return;
    setPath(null);
    setText("");
    setSaved("");
    setLoaded((n) => n + 1);
  };

  const openPathIn = async (p: string) => {
    const body = readText(p);
    if (body === null) {
      await msgBox(id, {
        title: appName,
        text: tr ? `${p}\nDosya bulunamadı.` : `${p}\nFile not found.`,
        icon: "warning",
        buttons: [L("Tamam", "OK")],
      });
      return;
    }
    load(normalize(p), body);
  };

  const openDoc = async () => {
    if (!(await confirmSave())) return;
    const p = await fileDialog(id, { mode: "open", lang, filters, dir: path ? dirname(path) : KNOWN.documents });
    if (p) await openPathIn(p);
  };

  const print = () => {
    const pg = prefs.page;
    const f = prefs.font;
    const css = `@page{size:${pg.paper === "Letter" ? "letter" : pg.paper} ${pg.orient};margin:${pg.top}mm ${pg.right}mm ${pg.bottom}mm ${pg.left}mm}
      body{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:${f.style.endsWith("italic") ? "italic" : "normal"} ${f.style.startsWith("bold") ? 700 : 400} ${f.size}pt ${FONTS[f.family] ?? "monospace"}}
      header{text-align:center;font:10pt Arial,sans-serif;margin-bottom:8mm}`;
    const head = pg.header
      .replace(/&f/gi, path ? basename(path) : untitled)
      .replace(/&d/gi, new Date().toLocaleDateString(lang))
      .replace(/&t/gi, new Date().toLocaleTimeString(lang))
      .replace(/&[a-z]/gi, "");
    printHtml(
      path ? basename(path) : untitled,
      `${head ? `<header>${escHtml(head)}</header>` : ""}${escHtml(text)}`,
      css,
    );
  };

  // ---------- editing ----------

  const insert = (s: string) => {
    const t = focusTa();
    if (!t) return;
    if (!document.execCommand("insertText", false, s)) {
      // Fallback without undo support.
      const a = t.selectionStart;
      const v = t.value.slice(0, a) + s + t.value.slice(t.selectionEnd);
      setText(v);
      requestAnimationFrame(() => t.setSelectionRange(a + s.length, a + s.length));
    }
  };

  const edit = {
    undo: () => (focusTa(), document.execCommand("undo")),
    cut: () => {
      const t = focusTa();
      if (t) localClip = t.value.slice(t.selectionStart, t.selectionEnd);
      document.execCommand("cut");
    },
    copy: () => {
      const t = focusTa();
      if (t) localClip = t.value.slice(t.selectionStart, t.selectionEnd);
      document.execCommand("copy");
    },
    paste: async () => {
      let s = localClip;
      try {
        s = (await navigator.clipboard.readText()) || localClip;
      } catch {
        /* no permission: use what was copied here */
      }
      if (s) insert(s);
    },
    del: () => {
      const t = focusTa();
      if (!t) return;
      document.execCommand(t.selectionStart === t.selectionEnd ? "forwardDelete" : "delete");
    },
    selectAll: () => {
      focusTa()?.select();
      updateCaret();
    },
    timeDate: () => insert(stamp(lang)),
  };

  // ---------- find / replace / go to ----------

  const target = (): FindTarget => ({
    find: (term, o) => {
      const t = ta.current;
      if (!t) return false;
      const i = searchText(t.value, term, o.up ? t.selectionStart : t.selectionEnd, o, lang);
      if (i < 0) return false;
      selectRange(i, i + term.length);
      return true;
    },
    replace: (term, repl, o) => {
      const t = ta.current;
      if (!t) return false;
      if (
        t.selectionStart !== t.selectionEnd &&
        sameText(t.value.slice(t.selectionStart, t.selectionEnd), term, o, lang)
      ) {
        const back = document.activeElement as HTMLElement | null;
        t.focus({ preventScroll: true });
        document.execCommand(repl ? "insertText" : "delete", false, repl);
        back?.focus({ preventScroll: true });
      }
      return target().find(term, { ...o, up: false });
    },
    replaceAll: (term, repl, o) => {
      const t = ta.current;
      if (!t) return 0;
      let out = "";
      let at = 0;
      let n = 0;
      for (
        let i = searchText(t.value, term, 0, { ...o, up: false }, lang);
        i >= 0;
        i = searchText(t.value, term, at, { ...o, up: false }, lang)
      ) {
        out += t.value.slice(at, i) + repl;
        at = i + term.length;
        n++;
      }
      if (!n) return 0;
      out += t.value.slice(at);
      const back = document.activeElement as HTMLElement | null;
      t.focus({ preventScroll: true });
      t.select();
      if (!document.execCommand(out ? "insertText" : "delete", false, out)) setText(out);
      t.setSelectionRange(0, 0);
      t.scrollTop = 0;
      back?.focus({ preventScroll: true });
      updateCaret();
      return n;
    },
  });

  const notFound = (term: string) => (tr ? `"${term}" bulunamıyor` : `Cannot find "${term}"`);
  const find = (replace: boolean) =>
    openFind(id, { replace, lang, appName, notFound, state: findState.current, target, direction: true });

  const findNext = () => {
    const st = findState.current;
    if (!st.term) {
      find(false);
      return;
    }
    if (!target().find(st.term, st))
      void msgBox(id, { title: appName, text: notFound(st.term), icon: "info", buttons: [L("Tamam", "OK")] });
  };

  const goTo = () => {
    if (prefs.wrap) return;
    openDialog(id, {
      title: L("Satıra Git", "Go To Line"),
      w: 266,
      h: 148,
      render: (close) => (
        <GoToDlg
          lang={lang}
          line={caret.line}
          lines={text.split("\n").length}
          close={close}
          go={(n) => {
            const v = ta.current?.value ?? text;
            let idx = 0;
            for (let k = 1; k < n; k++) idx = v.indexOf("\n", idx) + 1;
            close();
            window.setTimeout(() => selectRange(idx, idx), 0);
          }}
        />
      ),
    });
  };

  const fontDlg = () =>
    openDialog(id, {
      title: L("Yazı Tipi", "Font"),
      w: 452,
      h: 400,
      render: (close) => (
        <FontDlg
          lang={lang}
          font={prefs.font}
          close={close}
          apply={(f) => {
            setPref("font", f);
            close();
          }}
        />
      ),
    });

  const pageDlg = () =>
    openDialog(id, {
      title: L("Sayfa Yapısı", "Page Setup"),
      w: 560,
      h: 380,
      render: (close) => (
        <PageDlg
          lang={lang}
          page={prefs.page}
          close={close}
          apply={(p) => {
            setPref("page", p);
            close();
          }}
        />
      ),
    });

  const about = () => wm.launch("winver", { arg: "notepad", owner: id });

  useWinKeys({
    "ctrl+n": () => void newDoc(),
    "ctrl+o": () => void openDoc(),
    "ctrl+s": () => void save(),
    "ctrl+p": () => print(),
    "ctrl+f": () => void find(false),
    "ctrl+h": () => void find(true),
    "ctrl+g": () => {
      if (prefs.wrap) return false;
      goTo();
    },
    f3: () => void findNext(),
    f5: () => edit.timeDate(),
  });

  const hasText = text.length > 0;
  const editItems = (withUndo = true): MenuItem[] => [
    ...(withUndo
      ? ([
          { label: L("Geri Al", "Undo"), shortcut: "Ctrl+Z", onClick: edit.undo, disabled: !dirty },
          { sep: true },
        ] as MenuItem[])
      : []),
    { label: L("Kes", "Cut"), shortcut: "Ctrl+X", onClick: edit.cut, disabled: !caret.sel },
    { label: L("Kopyala", "Copy"), shortcut: "Ctrl+C", onClick: edit.copy, disabled: !caret.sel },
    { label: L("Yapıştır", "Paste"), shortcut: "Ctrl+V", onClick: () => void edit.paste() },
    { label: L("Sil", "Delete"), shortcut: "Del", onClick: edit.del, disabled: !caret.sel },
  ];

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: L("Dosya", "File"),
      items: [
        { label: L("Yeni", "New"), shortcut: "Ctrl+N", onClick: () => void newDoc() },
        { label: L("Aç...", "Open..."), shortcut: "Ctrl+O", onClick: () => void openDoc() },
        { label: L("Kaydet", "Save"), shortcut: "Ctrl+S", onClick: () => void save() },
        { label: L("Farklı Kaydet...", "Save As..."), onClick: () => void saveAs() },
        { sep: true },
        { label: L("Sayfa Yapısı...", "Page Setup..."), onClick: pageDlg },
        { label: L("Yazdır...", "Print..."), shortcut: "Ctrl+P", onClick: print },
        { sep: true },
        { label: L("Çıkış", "Exit"), onClick: () => void wm.requestClose(id) },
      ],
    },
    {
      label: L("Düzen", "Edit"),
      items: [
        ...editItems(),
        { sep: true },
        { label: L("Bul...", "Find..."), shortcut: "Ctrl+F", onClick: () => void find(false), disabled: !hasText },
        { label: L("Sonrakini Bul", "Find Next"), shortcut: "F3", onClick: findNext, disabled: !hasText },
        { label: L("Değiştir...", "Replace..."), shortcut: "Ctrl+H", onClick: () => void find(true) },
        { label: L("Git...", "Go To..."), shortcut: "Ctrl+G", onClick: goTo, disabled: prefs.wrap },
        { sep: true },
        { label: L("Tümünü Seç", "Select All"), shortcut: "Ctrl+A", onClick: edit.selectAll },
        { label: L("Saat/Tarih", "Time/Date"), shortcut: "F5", onClick: edit.timeDate },
      ],
    },
    {
      label: L("Biçim", "Format"),
      items: [
        { label: L("Sözcük Kaydır", "Word Wrap"), checked: prefs.wrap, onClick: () => setPref("wrap", !prefs.wrap) },
        { label: L("Yazı Tipi...", "Font..."), onClick: fontDlg },
      ],
    },
    {
      label: L("Görünüm", "View"),
      items: [
        {
          label: L("Durum Çubuğu", "Status Bar"),
          checked: prefs.status && !prefs.wrap,
          disabled: prefs.wrap,
          onClick: () => setPref("status", !prefs.status),
        },
      ],
    },
    {
      label: L("Yardım", "Help"),
      items: [
        {
          label: L("Yardımı Görüntüle", "View Help"),
          onClick: () =>
            openApp(
              "ie",
              `https://www.bing.com/search?q=${encodeURIComponent(tr ? "windows 8.1 not defteri yardım" : "get help with notepad in windows 8.1")}`,
            ),
        },
        { sep: true },
        { label: L("Not Defteri Hakkında", "About Notepad"), onClick: about },
      ],
    },
  ];

  // Right-click menu of the edit control.
  const unicode: [string, string][] = [
    ["LRM", "‎"],
    ["RLM", "‏"],
    ["ZWJ", "‍"],
    ["ZWNJ", "‌"],
    ["LRE", "‪"],
    ["RLE", "‫"],
    ["LRO", "‭"],
    ["RLO", "‮"],
    ["PDF", "‬"],
  ];
  const ctxItems: MenuItem[] = [
    ...editItems(),
    { sep: true },
    { label: L("Tümünü Seç", "Select All"), onClick: edit.selectAll },
    { sep: true },
    {
      label: L("Sağdan sola okuma düzeni", "Right to left Reading order"),
      checked: rtl,
      onClick: () => setRtl((r) => !r),
    },
    { label: L("Unicode denetim karakterlerini göster", "Show Unicode control characters"), disabled: true },
    {
      label: L("Unicode denetim karakteri ekle", "Insert Unicode control character"),
      sub: unicode.map(([n, ch]) => ({ label: n, onClick: () => insert(ch) })),
    },
    { sep: true },
    { label: L("IME'yi Aç", "Open IME"), disabled: true },
    { label: L("Yeniden Dönüştür", "Reconversion"), disabled: true },
  ];

  const showStatus = prefs.status && !prefs.wrap;

  return (
    <div className="np">
      <MenuBar menus={menus} />
      <textarea
        ref={ta}
        className={`np-edit ${prefs.wrap ? "wrap" : ""}`}
        style={fontCss(prefs.font)}
        dir={rtl ? "rtl" : "ltr"}
        value={text}
        wrap={prefs.wrap ? "soft" : "off"}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onChange={(e) => {
          setText(e.target.value);
          updateCaret();
        }}
        onSelect={updateCaret}
        onKeyDown={(e) => {
          if (e.key === "Tab" && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            insert("\t");
          }
        }}
        onCopy={(e) =>
          (localClip = e.currentTarget.value.slice(e.currentTarget.selectionStart, e.currentTarget.selectionEnd))
        }
        onCut={(e) =>
          (localClip = e.currentTarget.value.slice(e.currentTarget.selectionStart, e.currentTarget.selectionEnd))
        }
        onContextMenu={(e) => {
          e.preventDefault();
          setCtx({ x: e.clientX, y: e.clientY });
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DND_TYPE) || e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          const paths = readDrag(e);
          const file = e.dataTransfer.files?.[0];
          if (!paths.length && !file) return;
          e.preventDefault();
          void (async () => {
            if (!(await confirmSave())) return;
            if (paths[0]) await openPathIn(paths[0]);
            else if (file) {
              const body = (await file.text()).replace(/\r\n?/g, "\n");
              setPath(null);
              setText(body);
              setSaved("");
              setLoaded((n) => n + 1);
            }
          })();
        }}
      />
      {showStatus && (
        <div className="np-status">
          <span className="np-status-main" />
          <span className="np-status-pos">
            {tr ? `Satır ${caret.line}, Sütun ${caret.col}` : `Ln ${caret.line}, Col ${caret.col}`}
          </span>
          <svg className="np-grip" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            {[
              [9, 1],
              [9, 5],
              [5, 5],
              [9, 9],
              [5, 9],
              [1, 9],
            ].map(([x, y]) => (
              <rect key={`${x}${y}`} x={x} y={y} width="2" height="2" fill="#a0a0a0" />
            ))}
          </svg>
        </div>
      )}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems} onClose={() => setCtx(null)} />}
    </div>
  );
}

// ---------- Go To ----------

function GoToDlg({
  lang,
  line,
  lines,
  go,
  close,
}: {
  lang: Lang;
  line: number;
  lines: number;
  go: (n: number) => void;
  close: () => void;
}) {
  const { id } = useWindow();
  const tr = lang === "tr";
  const [v, setV] = useState(String(line));
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  const submit = async () => {
    const n = parseInt(v, 10);
    if (!n || n < 1 || n > lines) {
      await msgBox(id, {
        title: tr ? "Not Defteri - Satıra Git" : "Notepad - Goto Line",
        text: tr
          ? "Satır numarası toplam satır sayısının dışında"
          : "The line number is beyond the total number of lines",
        buttons: [tr ? "Tamam" : "OK"],
      });
      box.current?.focus();
      box.current?.select();
      return;
    }
    go(n);
  };
  useWinKeys({ escape: close, enter: () => void submit() });
  return (
    <div className="np-dlg np-goto">
      <label>
        {tr ? "Satır numarası:" : "Line number:"}
        <input
          ref={box}
          className="w8-input"
          inputMode="numeric"
          value={v}
          onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <div className="np-dlg-btns">
        <Btn primary onClick={() => void submit()}>
          {tr ? "Git" : "Go To"}
        </Btn>
        <Btn onClick={close}>{tr ? "İptal" : "Cancel"}</Btn>
      </div>
    </div>
  );
}

// ---------- Font ----------

function ListPick<T extends string | number>({
  items,
  value,
  label,
  onPick,
  className,
}: {
  items: T[];
  value: T | null;
  label: (v: T) => string;
  onPick: (v: T) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(".on")?.scrollIntoView({ block: "nearest" });
  }, [value]);
  return (
    <div ref={ref} className={`np-list ${className ?? ""}`} role="listbox">
      {items.map((it) => (
        <div
          key={String(it)}
          role="option"
          aria-selected={it === value}
          className={it === value ? "on" : ""}
          onPointerDown={() => onPick(it)}
        >
          {label(it)}
        </div>
      ))}
    </div>
  );
}

function FontDlg({
  lang,
  font,
  apply,
  close,
}: {
  lang: Lang;
  font: NpFont;
  apply: (f: NpFont) => void;
  close: () => void;
}) {
  const tr = lang === "tr";
  const families = Object.keys(FONTS);
  const styles: FontStyle[] = ["normal", "italic", "bold", "bolditalic"];
  const styleName = (s: FontStyle) =>
    tr
      ? { normal: "Normal", italic: "İtalik", bold: "Kalın", bolditalic: "Kalın İtalik" }[s]
      : { normal: "Regular", italic: "Italic", bold: "Bold", bolditalic: "Bold Italic" }[s];
  const [family, setFamily] = useState(font.family);
  const [familyText, setFamilyText] = useState(font.family);
  const [style, setStyle] = useState<FontStyle>(font.style);
  const [styleText, setStyleText] = useState(styleName(font.style));
  const [size, setSize] = useState(font.size);
  const [sizeText, setSizeText] = useState(String(font.size));
  const [script, setScript] = useState(tr ? "Türkçe" : "Western");

  const ok = () => {
    const n = parseFloat(sizeText.replace(",", "."));
    apply({ family, style, size: n >= 1 && n <= 1638 ? n : size });
  };
  useWinKeys({ escape: close, enter: (e) => ((e.target as HTMLElement).tagName === "BUTTON" ? false : ok()) });

  const L = (a: string, b: string) => (tr ? a : b);
  return (
    <div className="np-dlg np-font">
      <div className="np-font-cols">
        <label className="np-font-col fam">
          <span>{L("Yazı tipi:", "Font:")}</span>
          <input
            className="w8-input"
            value={familyText}
            onChange={(e) => {
              setFamilyText(e.target.value);
              const hit = families.find((f) => f.toLowerCase().startsWith(e.target.value.toLowerCase()));
              if (hit && e.target.value) setFamily(hit);
            }}
          />
          <ListPick
            items={families}
            value={family}
            label={(f) => f}
            onPick={(f) => {
              setFamily(f);
              setFamilyText(f);
            }}
          />
        </label>
        <label className="np-font-col sty">
          <span>{L("Yazı tipi stili:", "Font style:")}</span>
          <input className="w8-input" value={styleText} readOnly />
          <ListPick
            items={styles}
            value={style}
            label={styleName}
            onPick={(s) => {
              setStyle(s);
              setStyleText(styleName(s));
            }}
          />
        </label>
        <label className="np-font-col siz">
          <span>{L("Boyut:", "Size:")}</span>
          <input
            className="w8-input"
            value={sizeText}
            onChange={(e) => {
              setSizeText(e.target.value.replace(/[^\d.,]/g, ""));
              const n = parseFloat(e.target.value.replace(",", "."));
              if (n) setSize(n);
            }}
          />
          <ListPick
            items={SIZES}
            value={SIZES.includes(size) ? size : null}
            label={(s) => String(s)}
            onPick={(s) => {
              setSize(s);
              setSizeText(String(s));
            }}
          />
        </label>
        <div className="np-font-btns">
          <Btn primary onClick={ok}>
            {L("Tamam", "OK")}
          </Btn>
          <Btn onClick={close}>{L("İptal", "Cancel")}</Btn>
        </div>
      </div>
      <div className="np-font-lower">
        <div className="np-font-sample-col">
          <Group label={L("Örnek", "Sample")} className="np-font-sample">
            <div style={fontCss({ family, style, size: Math.min(size, 26) })}>AaBbYyZz</div>
          </Group>
          <label className="np-font-script">
            <span>{L("Betik:", "Script:")}</span>
            <select className="w8-select" value={script} onChange={(e) => setScript(e.target.value)}>
              {(tr
                ? ["Batı", "Türkçe", "Yunanca", "Kiril", "Orta Avrupa"]
                : ["Western", "Turkish", "Greek", "Cyrillic", "Central European"]
              ).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <button className="np-link" onClick={close}>
        {L("Daha fazla yazı tipi göster", "Show more fonts")}
      </button>
    </div>
  );
}

// ---------- Page Setup ----------

function PageDlg({
  lang,
  page,
  apply,
  close,
}: {
  lang: Lang;
  page: PageSetup;
  apply: (p: PageSetup) => void;
  close: () => void;
}) {
  const tr = lang === "tr";
  const L = (a: string, b: string) => (tr ? a : b);
  const [p, setP] = useState(page);
  const set = <K extends keyof PageSetup>(k: K, v: PageSetup[K]) => setP((x) => ({ ...x, [k]: v }));
  const num = (k: "left" | "right" | "top" | "bottom") => (
    <input
      className="w8-input"
      value={p[k]}
      onChange={(e) => set(k, Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0))}
    />
  );
  useWinKeys({ escape: close, enter: () => apply(p) });
  const land = p.orient === "landscape";
  const [pw, ph] = land ? [86, 62] : [62, 86];
  const s = pw / (land ? 297 : 210);
  return (
    <div className="np-dlg np-page">
      <div className="np-page-top">
        <div className="np-page-left">
          <Group label={L("Kağıt", "Paper")}>
            <label className="np-page-row">
              <span>{L("Boyut:", "Size:")}</span>
              <select className="w8-select" value={p.paper} onChange={(e) => set("paper", e.target.value)}>
                {["A4", "A5", "A3", "B5", "Letter", "Legal"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="np-page-row">
              <span>{L("Kaynak:", "Source:")}</span>
              <select className="w8-select" defaultValue="auto">
                <option value="auto">{L("Otomatik Seç", "Automatically Select")}</option>
                <option value="manual">{L("El ile besleme", "Manual Feed")}</option>
              </select>
            </label>
          </Group>
          <div className="np-page-mid">
            <Group label={L("Yönlendirme", "Orientation")} className="np-page-orient">
              <label className="np-check">
                <input type="radio" checked={!land} onChange={() => set("orient", "portrait")} />
                {L("Dikey", "Portrait")}
              </label>
              <label className="np-check">
                <input type="radio" checked={land} onChange={() => set("orient", "landscape")} />
                {L("Yatay", "Landscape")}
              </label>
            </Group>
            <Group label={L("Kenar Boşlukları (milimetre)", "Margins (millimeters)")} className="np-page-margins">
              <label>
                {L("Sol:", "Left:")} {num("left")}
              </label>
              <label>
                {L("Sağ:", "Right:")} {num("right")}
              </label>
              <label>
                {L("Üst:", "Top:")} {num("top")}
              </label>
              <label>
                {L("Alt:", "Bottom:")} {num("bottom")}
              </label>
            </Group>
          </div>
        </div>
        <Group label={L("Önizleme", "Preview")} className="np-page-preview">
          <div className="np-page-sheet" style={{ width: pw, height: ph }}>
            <div
              className="np-page-text"
              style={{ left: p.left * s, right: p.right * s, top: p.top * s, bottom: p.bottom * s }}
            />
          </div>
        </Group>
      </div>
      <label className="np-page-hf">
        <span>{L("Üst Bilgi:", "Header:")}</span>
        <input className="w8-input" value={p.header} onChange={(e) => set("header", e.target.value)} />
      </label>
      <label className="np-page-hf">
        <span>{L("Alt Bilgi:", "Footer:")}</span>
        <input className="w8-input" value={p.footer} onChange={(e) => set("footer", e.target.value)} />
      </label>
      <div className="np-dlg-btns">
        <Btn primary onClick={() => apply(p)}>
          {L("Tamam", "OK")}
        </Btn>
        <Btn onClick={close}>{L("İptal", "Cancel")}</Btn>
      </div>
    </div>
  );
}
