"use client";
/**
 * Minesweeper (Mayın Tarlası) as it shipped from Windows 7 on: glossy blue tiles, a Game / Help menu bar, the
 * time and mines-left counters under the field, Statistics, Options (difficulty, custom field, question marks)
 * and Change Appearance. First click is never a mine, zeros flood open, both buttons (or the middle one) on a
 * number chord. The fixed window snaps to the size of the field, like Calculator.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useOS } from "@/lib/os";
import { wm } from "@/lib/wm";
import { sound } from "@/lib/sound";
import { MenuBar, useFitWindow, Btn, TextBox, useWindow, useWinKeys, type MenuItem } from "../ui";
import { msgBox, openDialog } from "../dialogs";
import "./minesweeper.css";

// =====================================================================================================
// Game logic (pure)
// =====================================================================================================

export type Cell = { mine: boolean; n: number; s: "" | "open" | "flag" | "q" };
export type Cfg = { w: number; h: number; mines: number };
type Level = "beginner" | "intermediate" | "advanced";

const LEVELS: Record<Level, Cfg> = {
  beginner: { w: 9, h: 9, mines: 10 },
  intermediate: { w: 16, h: 16, mines: 40 },
  advanced: { w: 30, h: 16, mines: 99 },
};

export function neighbors(i: number, w: number, h: number): number[] {
  const x = i % w;
  const y = (i - x) / w;
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx);
    }
  return out;
}

const blank = (c: Cfg): Cell[] => Array.from({ length: c.w * c.h }, () => ({ mine: false, n: 0, s: "" }));

/** Lay the mines anywhere but the first click (and its neighbours when there's room, so it opens an area). */
export function layMines(c: Cfg, safe: number, rand = Math.random): Cell[] {
  const keep = new Set([safe, ...(c.w * c.h - 9 >= c.mines ? neighbors(safe, c.w, c.h) : [])]);
  const spots = [...Array(c.w * c.h).keys()].filter((i) => !keep.has(i));
  // Partial Fisher–Yates: the first `mines` spots are a uniform pick.
  for (let k = 0; k < c.mines; k++) {
    const j = k + Math.floor(rand() * (spots.length - k));
    [spots[k], spots[j]] = [spots[j], spots[k]];
  }
  const cells = blank(c);
  for (const i of spots.slice(0, c.mines)) cells[i].mine = true;
  cells.forEach((cell, i) => (cell.n = neighbors(i, c.w, c.h).filter((j) => cells[j].mine).length));
  return cells;
}

/** Open cell `i`; empty cells flood outwards. Flags stay shut. Returns a new array. */
export function reveal(cells: Cell[], w: number, h: number, i: number): Cell[] {
  const out = cells.slice();
  const todo = [i];
  while (todo.length) {
    const j = todo.pop()!;
    const c = out[j];
    if (c.s === "open" || c.s === "flag") continue;
    out[j] = { ...c, s: "open" };
    if (!c.mine && c.n === 0) todo.push(...neighbors(j, w, h));
  }
  return out;
}

/** Chord on an open number: when its flags add up, open every other neighbour. */
export function chord(cells: Cell[], w: number, h: number, i: number): Cell[] {
  const c = cells[i];
  if (c.s !== "open" || !c.n) return cells;
  const around = neighbors(i, w, h);
  if (around.filter((j) => cells[j].s === "flag").length !== c.n) return cells;
  return around.reduce((acc, j) => reveal(acc, w, h, j), cells);
}

export const boomAt = (cells: Cell[]) => cells.findIndex((c) => c.mine && c.s === "open");
export const cleared = (cells: Cell[]) => cells.every((c) => c.mine || c.s === "open");

export type Stat = {
  played: number;
  won: number;
  best: { t: number; d: number }[];
  cur: number;
  longW: number;
  longL: number;
};
const NO_STAT: Stat = { played: 0, won: 0, best: [], cur: 0, longW: 0, longL: 0 };

/** Add a finished game to a level's statistics (cur > 0 is a winning streak, < 0 a losing one). */
export function record(s: Stat, won: boolean, t: number, d: number): Stat {
  const cur = won ? Math.max(0, s.cur) + 1 : Math.min(0, s.cur) - 1;
  return {
    played: s.played + 1,
    won: s.won + (won ? 1 : 0),
    best: won ? [...s.best, { t, d }].sort((a, b) => a.t - b.t).slice(0, 5) : s.best,
    cur,
    longW: Math.max(s.longW, cur),
    longL: Math.max(s.longL, -cur),
  };
}

// =====================================================================================================
// Storage
// =====================================================================================================

type Opts = { level: Level | "custom"; custom: Cfg; qmarks: boolean; deck: "blue" | "green" };
type Stats = Record<Level, Stat>;
const OPTS_KEY = "afu-metro:v2:minesweeper";
const STATS_KEY = "afu-metro:v2:minesweeper-stats";
const DEFAULT_OPTS: Opts = { level: "beginner", custom: LEVELS.beginner, qmarks: false, deck: "blue" };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* not remembered */
  }
}
const loadStats = () => load<Stats>(STATS_KEY, { beginner: NO_STAT, intermediate: NO_STAT, advanced: NO_STAT });
const cfgOf = (o: Opts) => (o.level === "custom" ? o.custom : LEVELS[o.level]);

// =====================================================================================================
// The program
// =====================================================================================================

type Game = {
  cfg: Cfg;
  cells: Cell[];
  laid: boolean;
  status: "ready" | "play" | "won" | "lost";
  t0: number;
  t1: number;
  boom: number;
};
const fresh = (cfg: Cfg): Game => ({ cfg, cells: blank(cfg), laid: false, status: "ready", t0: 0, t1: 0, boom: -1 });
/** Same mines, all shut again ("Restart this game"). */
const restarted = (g: Game): Game => ({
  ...g,
  cells: g.cells.map((c) => ({ ...c, s: "" })),
  status: "ready",
  t0: 0,
  t1: 0,
  boom: -1,
});

export default function MinesweeperApp() {
  const { id, close } = useWindow();
  const { lang } = useOS();
  const tr = lang === "tr";
  const [opts, setOpts] = useState(() => load(OPTS_KEY, DEFAULT_OPTS));
  const [game, setGame] = useState(() => fresh(cfgOf(opts)));
  const [now, setNow] = useState(0);
  const [press, setPress] = useState<{ i: number; chord: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const { w, h } = game.cfg;
  const level = opts.level === "custom" ? null : opts.level;

  useEffect(() => save(OPTS_KEY, opts), [opts]);

  // The clock runs from the first click until the game ends.
  useEffect(() => {
    if (game.status !== "play") return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [game.status]);

  // A fixed window that fits the field.
  useFitWindow(root);

  const secs = (g: Game, at: number) => Math.min(999, Math.floor(Math.max(0, at - g.t0) / 1000));
  const time = game.status === "play" ? secs(game, now) : game.t1 ? secs(game, game.t1) : 0;
  const flags = game.cells.filter((c) => c.s === "flag").length;
  const left = game.status === "won" ? 0 : game.cfg.mines - flags;

  /** Count the finished game in this level's statistics; returns the updated numbers. */
  const tally = (won: boolean, t: number) => {
    if (!level) return null;
    const all = loadStats();
    all[level] = record(all[level], won, t, Date.now());
    save(STATS_KEY, all);
    return all[level];
  };

  const newGame = (cfg = game.cfg) => {
    setGame(fresh(cfg));
    setPress(null);
  };

  /** F2 while a game is going: Windows asks what to do with it (leaving counts as a loss). */
  const askNew = () => {
    if (game.status !== "play") return newGame();
    openDialog(id, {
      title: tr ? "Yeni Oyun" : "New Game",
      w: 480,
      h: 140,
      render: (done) => (
        <TaskDlg
          text={tr ? "Devam eden oyunla ne yapmak istiyorsunuz?" : "What do you want to do with the game in progress?"}
          buttons={
            tr
              ? ["Çık ve yeni oyun başlat", "Bu oyunu yeniden başlat", "Oynamaya devam et"]
              : ["Quit and start a new game", "Restart this game", "Keep playing"]
          }
          primary={2}
          onPick={(r) => {
            done();
            if (r === 2) return;
            tally(false, secs(game, Date.now()));
            setGame(r === 0 ? fresh(game.cfg) : restarted(game));
          }}
        />
      ),
    });
  };

  const finished = (won: boolean, t: number) => {
    const s = tally(won, t);
    if (won) sound.ding();
    else sound.error();
    const sec = (n: number) => (tr ? `${n} saniye` : `${n} second${n === 1 ? "" : "s"}`);
    const today = fmtDate(Date.now(), tr);
    const buttons = tr
      ? ["Çıkış", ...(won ? [] : ["Bu oyunu yeniden başlat"]), "Yeniden oyna"]
      : ["Exit", ...(won ? [] : ["Restart this game"]), "Play again"];
    window.setTimeout(
      () =>
        openDialog(id, {
          title: won ? (tr ? "Oyunu Kazandınız" : "Game Won") : tr ? "Oyunu Kaybettiniz" : "Game Lost",
          w: 400,
          h: s ? 214 : 140,
          render: (done) => (
            <TaskDlg
              text={
                won
                  ? tr
                    ? "Tebrikler, oyunu kazandınız!"
                    : "Congratulations, you won the game!"
                  : tr
                    ? "Üzgünüz, bu oyunu kaybettiniz. Bir dahaki sefere bol şans!"
                    : "Sorry, you lost this game. Better luck next time!"
              }
              buttons={buttons}
              primary={buttons.length - 1}
              onPick={(k) => {
                done();
                if (k === 0) close();
                else if (k === buttons.length - 1) setGame((g) => fresh(g.cfg));
                else setGame(restarted);
              }}
            >
              {s && (
                <div className="ms-end-grid">
                  <span>{`${tr ? "Süre:" : "Time:"} ${sec(t)}`}</span>
                  <span>{`${tr ? "Tarih:" : "Date:"} ${today}`}</span>
                  <span>{`${tr ? "En iyi süre:" : "Best time:"} ${s.best[0] ? sec(s.best[0].t) : "–"}`}</span>
                  <span>{`${tr ? "Oynanan oyunlar:" : "Games played:"} ${s.played}`}</span>
                  <span>{`${tr ? "Kazanılan oyunlar:" : "Games won:"} ${s.won}`}</span>
                  <span>{`${tr ? "Yüzde:" : "Percentage:"} %${pct(s)}`}</span>
                </div>
              )}
            </TaskDlg>
          ),
        }),
      won ? 300 : 700,
    );
  };

  const act = (i: number, kind: "open" | "chord" | "mark") => {
    if (game.status === "won" || game.status === "lost") return;
    const cur = game.cells[i];
    if (kind === "mark") {
      if (cur.s === "open") return;
      const s = cur.s === "" ? "flag" : cur.s === "flag" && opts.qmarks ? "q" : "";
      setGame({ ...game, cells: game.cells.map((c, j) => (j === i ? { ...c, s } : c)) });
      return;
    }
    if (kind === "open" && cur.s === "flag") return;
    if (kind === "chord" && !game.laid) return;
    // The field is mined on the first click, keeping any flags placed before it.
    const base = game.laid ? game.cells : layMines(game.cfg, i).map((c, j) => ({ ...c, s: game.cells[j].s }));
    const cells = kind === "open" ? reveal(base, w, h, i) : chord(base, w, h, i);
    if (cells === base && game.laid) return;
    const at = Date.now();
    const t0 = game.status === "ready" ? at : game.t0;
    const boom = boomAt(cells);
    const status = boom >= 0 ? "lost" : cleared(cells) ? "won" : "play";
    const next: Game = { ...game, cells, laid: true, status, t0, t1: status === "play" ? 0 : at, boom };
    setGame(next);
    setNow(at);
    if (status !== "play") finished(status === "won", secs(next, at));
  };

  // ---- mouse: left opens on release, right marks, both / middle chord ----
  const cellAt = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    return el ? Number(el.dataset.i) : -1;
  };
  const onDown = (e: React.MouseEvent) => {
    const i = cellAt(e);
    if (i < 0 || game.status === "won" || game.status === "lost") return;
    if (e.button === 1 || (e.buttons & 3) === 3) {
      e.preventDefault();
      setPress({ i, chord: true });
    } else if (e.button === 0) setPress({ i, chord: false });
  };
  const onOver = (e: React.MouseEvent) => {
    const i = cellAt(e);
    if (press && i >= 0 && i !== press.i) setPress({ ...press, i });
  };
  const onUp = (e: React.MouseEvent) => {
    if (!press) return;
    const i = cellAt(e);
    setPress(null);
    if (i < 0) return;
    if (press.chord) act(i, "chord");
    else if (e.button === 0) act(i, "open");
  };

  const pressed = new Set<number>();
  if (press && game.status !== "won" && game.status !== "lost")
    for (const j of press.chord ? [press.i, ...neighbors(press.i, w, h)] : [press.i])
      if (game.cells[j].s === "" || game.cells[j].s === "q") pressed.add(j);

  const showStats = () =>
    openDialog(id, {
      title: tr ? "Mayın Tarlası İstatistikleri" : "Minesweeper Statistics",
      w: 470,
      h: 300,
      render: (done) => <StatsDlg tr={tr} initial={level ?? "beginner"} onClose={done} />,
    });
  const showOptions = () =>
    openDialog(id, {
      title: tr ? "Seçenekler" : "Options",
      w: 420,
      h: 300,
      render: (done) => (
        <OptionsDlg
          tr={tr}
          opts={opts}
          onClose={done}
          onOk={(o) => {
            setOpts(o);
            const c = cfgOf(o);
            const old = cfgOf(opts);
            if (o.level !== opts.level || c.w !== old.w || c.h !== old.h || c.mines !== old.mines) newGame(c);
          }}
        />
      ),
    });
  const showLook = () =>
    openDialog(id, {
      title: tr ? "Görünümü Değiştir" : "Change Appearance",
      w: 330,
      h: 210,
      render: (done) => (
        <LookDlg tr={tr} deck={opts.deck} onClose={done} onOk={(deck) => setOpts((o) => ({ ...o, deck }))} />
      ),
    });
  const help = () =>
    msgBox(id, {
      title: tr ? "Mayın Tarlası Yardımı" : "Minesweeper Help",
      text: tr
        ? "Mayına basmadan tüm boş kareleri açın.\nSayı, o karenin çevresindeki mayın sayısını gösterir.\nSağ tıklama bayrak koyar; sayıya iki düğmeyle tıklamak çevresini açar."
        : "Uncover every empty square without hitting a mine.\nA number tells how many mines touch that square.\nRight-click plants a flag; clicking a number with both buttons opens its neighbours.",
      icon: "info",
      buttons: [tr ? "Tamam" : "OK"],
    });

  useWinKeys({
    f1: () => void help(),
    f2: askNew,
    f4: () => void showStats(),
    f5: () => void showOptions(),
    f7: () => void showLook(),
  });

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: tr ? "Oyun" : "Game",
      items: [
        { label: tr ? "Yeni Oyun" : "New Game", shortcut: "F2", onClick: askNew },
        { sep: true },
        { label: tr ? "İstatistikler" : "Statistics", shortcut: "F4", onClick: showStats },
        { label: tr ? "Seçenekler" : "Options", shortcut: "F5", onClick: showOptions },
        { label: tr ? "Görünümü Değiştir" : "Change Appearance", shortcut: "F7", onClick: showLook },
        { sep: true },
        { label: tr ? "Çıkış" : "Exit", onClick: close },
      ],
    },
    {
      label: tr ? "Yardım" : "Help",
      items: [
        { label: tr ? "Yardımı Görüntüle" : "View Help", shortcut: "F1", onClick: () => void help() },
        { sep: true },
        {
          label: tr ? "Mayın Tarlası Hakkında" : "About Minesweeper",
          onClick: () => wm.launch("winver", { arg: "minesweeper", owner: id }),
        },
      ],
    },
  ];

  const over = game.status === "won" || game.status === "lost";
  return (
    <div className={`ms ms-${opts.deck}`} ref={root}>
      <MenuBar menus={menus} />
      <div className="ms-body">
        <div
          className="ms-field"
          style={{ gridTemplateColumns: `repeat(${w}, var(--ms-tile))` }}
          onMouseDown={onDown}
          onMouseOver={onOver}
          onMouseUp={onUp}
          onMouseLeave={() => setPress(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            const i = cellAt(e);
            if (i >= 0 && !press?.chord) act(i, "mark");
          }}
        >
          {game.cells.map((c, i) => {
            // When the game is over, the field tells what was where.
            const lostMine = game.status === "lost" && c.mine && c.s !== "flag";
            const wrong = game.status === "lost" && c.s === "flag" && !c.mine;
            const flag = !wrong && (c.s === "flag" || (game.status === "won" && c.mine));
            const opened = c.s === "open" || lostMine || wrong;
            const cls = [
              "ms-cell",
              opened ? "open" : "",
              pressed.has(i) ? "down" : "",
              i === game.boom ? "boom" : "",
              over ? "" : "live",
            ].join(" ");
            return (
              <div key={i} data-i={i} className={cls}>
                {wrong ? (
                  <MineIcon cross />
                ) : flag ? (
                  <FlagIcon />
                ) : opened && c.mine ? (
                  <MineIcon />
                ) : c.s === "open" && c.n ? (
                  <b className={`ms-n${c.n}`}>{c.n}</b>
                ) : c.s === "q" ? (
                  <b className="ms-q">?</b>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="ms-counters">
          <span className="ms-counter" title={tr ? "Süre" : "Time"}>
            <ClockIcon />
            <span>{time}</span>
          </span>
          <span className="ms-counter" title={tr ? "Kalan mayın" : "Mines left"}>
            <span>{left}</span>
            <MineIcon />
          </span>
        </div>
      </div>
    </div>
  );
}

// =====================================================================================================
// Dialogs
// =====================================================================================================

const fmtDate = (d: number, tr: boolean) => new Date(d).toLocaleDateString(tr ? "tr-TR" : "en-US");
const pct = (s: Stat) => (s.played ? Math.round((s.won / s.played) * 100) : 0);

/** A line of text, optional details and a row of buttons (Esc and X do nothing harmful: Esc picks `primary`). */
function TaskDlg({
  text,
  children,
  buttons,
  primary,
  onPick,
}: {
  text: string;
  children?: ReactNode;
  buttons: string[];
  primary: number;
  onPick: (i: number) => void;
}) {
  useWinKeys({ escape: () => onPick(primary) });
  return (
    <div className="ms-dlg">
      <p className="ms-end-main">{text}</p>
      {children}
      <div className="ms-btns">
        {buttons.map((b, i) => (
          <Btn key={b} primary={i === primary} autoFocus={i === primary} onClick={() => onPick(i)}>
            {b}
          </Btn>
        ))}
      </div>
    </div>
  );
}

const levelName = (l: Level | "custom", tr: boolean) =>
  ({
    beginner: tr ? "Başlangıç" : "Beginner",
    intermediate: tr ? "Orta" : "Intermediate",
    advanced: tr ? "İleri" : "Advanced",
    custom: tr ? "Özel" : "Custom",
  })[l];

function StatsDlg({ tr, initial, onClose }: { tr: boolean; initial: Level; onClose: () => void }) {
  const { id } = useWindow();
  const [all, setAll] = useState(loadStats);
  const [lv, setLv] = useState<Level>(initial);
  const s = all[lv];
  useWinKeys({ escape: onClose });
  const reset = async () => {
    const r = await msgBox(id, {
      title: tr ? "İstatistikleri Sıfırla" : "Reset Statistics",
      text: tr
        ? "İstatistiklerinizi sıfırlamak istediğinizden emin misiniz?"
        : "Are you sure you want to reset your statistics?",
      icon: "question",
      buttons: tr ? ["Sıfırla", "Sıfırlama"] : ["Reset", "Do not reset"],
    });
    if (r !== 0) return;
    const empty = { beginner: NO_STAT, intermediate: NO_STAT, advanced: NO_STAT };
    save(STATS_KEY, empty);
    setAll(empty);
  };
  return (
    <div className="ms-dlg">
      <div className="ms-stats">
        <div className="ms-levels" role="listbox">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button key={l} className={l === lv ? "on" : ""} onClick={() => setLv(l)}>
              {levelName(l, tr)}
            </button>
          ))}
        </div>
        <fieldset className="ms-best">
          <legend>{tr ? "En iyi süreler" : "Best times"}</legend>
          {Array.from({ length: 5 }, (_, k) => (
            <div key={k}>
              <span>{s.best[k] ? s.best[k].t : ""}</span>
              <span>{s.best[k] ? fmtDate(s.best[k].d, tr) : ""}</span>
            </div>
          ))}
        </fieldset>
        <div className="ms-nums">
          <span>{tr ? "Oynanan oyunlar:" : "Games played:"}</span>
          <b>{s.played}</b>
          <span>{tr ? "Kazanılan oyunlar:" : "Games won:"}</span>
          <b>{s.won}</b>
          <span>{tr ? "Kazanma yüzdesi:" : "Win percentage:"}</span>
          <b>%{pct(s)}</b>
          <span>{tr ? "En uzun kazanma serisi:" : "Longest winning streak:"}</span>
          <b>{s.longW}</b>
          <span>{tr ? "En uzun kaybetme serisi:" : "Longest losing streak:"}</span>
          <b>{s.longL}</b>
          <span>{tr ? "Geçerli seri:" : "Current streak:"}</span>
          <b>{s.cur}</b>
        </div>
      </div>
      <div className="ms-btns">
        <Btn primary autoFocus onClick={onClose}>
          {tr ? "Kapat" : "Close"}
        </Btn>
        <Btn onClick={() => void reset()}>{tr ? "Sıfırla" : "Reset"}</Btn>
      </div>
    </div>
  );
}

function OptionsDlg({
  tr,
  opts,
  onOk,
  onClose,
}: {
  tr: boolean;
  opts: Opts;
  onOk: (o: Opts) => void;
  onClose: () => void;
}) {
  const [o, setO] = useState(opts);
  const [cust, setCust] = useState({
    h: String(opts.custom.h),
    w: String(opts.custom.w),
    mines: String(opts.custom.mines),
  });
  const ok = () => {
    const clamp = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo));
    const h = clamp(cust.h, 9, 24);
    const w = clamp(cust.w, 9, 30);
    onOk({ ...o, custom: { h, w, mines: clamp(cust.mines, 10, Math.min(668, (h - 1) * (w - 1))) } });
    onClose();
  };
  useWinKeys({ escape: onClose, enter: ok });
  const radio = (l: Level | "custom", sub: string) => (
    <label className="ms-radio">
      <input type="radio" checked={o.level === l} onChange={() => setO({ ...o, level: l })} />
      <span>
        <b>{levelName(l, tr)}</b>
        {sub && <small>{sub}</small>}
      </span>
    </label>
  );
  const sub = (c: Cfg) =>
    tr ? `${c.mines} mayın\n${c.w} x ${c.h} karo kılavuzu` : `${c.mines} mines\n${c.w} x ${c.h} tile grid`;
  const num = (k: keyof typeof cust, label: string, range: string) => (
    <label>
      {label} ({range}):
      <TextBox
        value={cust[k]}
        disabled={o.level !== "custom"}
        onChange={(e) => setCust({ ...cust, [k]: e.target.value.replace(/\D/g, "") })}
      />
    </label>
  );
  return (
    <div className="ms-dlg">
      <fieldset className="ms-diff">
        <legend>{tr ? "Zorluk" : "Difficulty"}</legend>
        <div className="ms-diff-grid">
          {radio("beginner", sub(LEVELS.beginner))}
          {radio("custom", "")}
          {radio("intermediate", sub(LEVELS.intermediate))}
          <div className="ms-custom">
            {num("h", tr ? "Yükseklik" : "Height", "9-24")}
            {num("w", tr ? "Genişlik" : "Width", "9-30")}
            {num("mines", tr ? "Mayınlar" : "Mines", "10-668")}
          </div>
          {radio("advanced", sub(LEVELS.advanced))}
        </div>
      </fieldset>
      <label className="ms-check">
        <input type="checkbox" checked={o.qmarks} onChange={(e) => setO({ ...o, qmarks: e.target.checked })} />
        {tr ? "Soru işaretlerine izin ver (sağ çift tıklamada)" : "Allow question marks (on double right-click)"}
      </label>
      <div className="ms-btns">
        <Btn primary onClick={ok}>
          {tr ? "Tamam" : "OK"}
        </Btn>
        <Btn onClick={onClose}>{tr ? "İptal" : "Cancel"}</Btn>
      </div>
    </div>
  );
}

function LookDlg({
  tr,
  deck,
  onOk,
  onClose,
}: {
  tr: boolean;
  deck: Opts["deck"];
  onOk: (d: Opts["deck"]) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState(deck);
  useWinKeys({ escape: onClose });
  return (
    <div className="ms-dlg">
      <p>{tr ? "Bir karo rengi seçin:" : "Choose a tile color:"}</p>
      <div className="ms-decks">
        {(["blue", "green"] as const).map((k) => (
          <button key={k} className={`ms-deck ms-${k} ${d === k ? "on" : ""}`} onClick={() => setD(k)}>
            <span className="ms-cell" />
            <span className="ms-cell" />
            <span className="ms-cell open">
              <b className="ms-n1">1</b>
            </span>
            <span className="ms-cell">
              <FlagIcon />
            </span>
            <small>{k === "blue" ? (tr ? "Mavi" : "Blue") : tr ? "Yeşil" : "Green"}</small>
          </button>
        ))}
      </div>
      <div className="ms-btns">
        <Btn
          primary
          onClick={() => {
            onOk(d);
            onClose();
          }}
        >
          {tr ? "Tamam" : "OK"}
        </Btn>
        <Btn onClick={onClose}>{tr ? "İptal" : "Cancel"}</Btn>
      </div>
    </div>
  );
}

// =====================================================================================================
// Glyphs
// =====================================================================================================

function MineIcon({ cross }: { cross?: boolean }) {
  return (
    <svg className="ms-mine" viewBox="0 0 16 16" aria-hidden="true">
      <g stroke="#111" strokeWidth="1.4" strokeLinecap="round">
        <path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" />
      </g>
      <circle cx="8" cy="8" r="4.6" fill="#1a1a1a" />
      <circle cx="6.5" cy="6.5" r="1.3" fill="#fff" opacity="0.85" />
      {cross && <path d="M2 2l12 12M14 2L2 14" stroke="#e00" strokeWidth="1.8" />}
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg className="ms-flag" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5.5 2v11" stroke="#333" strokeWidth="1.4" />
      <path d="M6 2.2l7 3-7 3z" fill="#e8251f" stroke="#a00" strokeWidth="0.6" />
      <path d="M3 13.6h6" stroke="#333" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="ms-clock" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="6.5" y="0.5" width="3" height="2" rx="0.5" fill="#9aa8bd" />
      <circle cx="8" cy="9" r="6" fill="#fdfdfd" stroke="#55657e" strokeWidth="1.3" />
      <path d="M8 9V5.5M8 9l2.4 1.6" stroke="#2b3a52" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
