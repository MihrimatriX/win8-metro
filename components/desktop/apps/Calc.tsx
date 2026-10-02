"use client";
/**
 * Calculator (calc.exe) as it looks in Windows 7/8: a blue-grey body, a glossy display with a history line,
 * and rounded keys that glow gold under the mouse.
 * Standard mode executes immediately like the real one (2 + 3 * 4 = 20); Scientific mode honors operator
 * precedence and parentheses (2 + 3 * 4 = 14). The keyboard works like calc.exe (Esc, Delete, F9, R, @…).
 */
import "./calc.css";
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { useL, useOS } from "@/lib/os";
import { wm } from "@/lib/wm";
import { MenuBar, useWindow, useWinKeys, type MenuItem } from "../ui";

type Mode = "std" | "sci";
type Bin = "+" | "-" | "*" | "/" | "mod" | "pow" | "root";
type Angle = "deg" | "rad" | "grad";
type Err = "div0" | "undef" | "invalid" | "overflow";
type Fn =
  | "sqrt" | "recip" | "negate" | "sqr" | "cube" | "cbrt" | "fact" | "ln" | "exp" | "log" | "pow10" | "int" | "frac" | "dms" | "deg"
  | "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "sinh" | "cosh" | "tanh" | "asinh" | "acosh" | "atanh";

const STORE = "afu-metro:v2:calc";

class CalcError extends Error {
  constructor(public code: Err) {
    super(code);
  }
}

/** Precedence in Scientific mode (Standard mode treats every operator alike). */
const PREC: Record<Bin, number> = { "+": 1, "-": 1, "*": 2, "/": 2, mod: 2, pow: 3, root: 3 };
/** How calc.exe writes operators in the history line. */
const SYM: Record<Bin, string> = { "+": "+", "-": "-", "*": "*", "/": "/", mod: "Mod", pow: "^", root: "yroot" };

/** NaN means the input was invalid; ±Infinity means it overflowed. */
function check(r: number): number {
  if (Number.isNaN(r)) throw new CalcError("invalid");
  if (!Number.isFinite(r)) throw new CalcError("overflow");
  return r;
}

/** Snap results like 0.49999999999999994 (sin 30°) to the value calc.exe would show. */
function tidy(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const p = Number(x.toPrecision(14));
  return Math.abs(x - p) <= Math.abs(p) * 4e-16 ? p : x;
}

function applyBin(a: number, op: Bin, b: number): number {
  switch (op) {
    case "+":
      return check(a + b);
    case "-":
      return check(a - b);
    case "*":
      return check(a * b);
    case "/":
      if (b === 0) throw new CalcError(a === 0 ? "undef" : "div0");
      return check(a / b);
    case "mod":
      if (b === 0) throw new CalcError("div0");
      return check(a % b);
    case "pow":
      if (a === 0 && b < 0) throw new CalcError("div0");
      return check(tidy(a ** b));
    case "root":
      if (b === 0) throw new CalcError("invalid");
      if (a < 0) {
        if (Number.isInteger(b) && Math.abs(b) % 2 === 1) return check(tidy(-((-a) ** (1 / b))));
        throw new CalcError("invalid");
      }
      return check(tidy(a ** (1 / b)));
  }
}

/** Lanczos approximation of Γ(x), for factorials of fractions like calc.exe does. */
function gamma(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a;
}

function factorial(v: number): number {
  if (Number.isInteger(v)) {
    if (v < 0) throw new CalcError("invalid");
    if (v > 170) throw new CalcError("overflow");
    let r = 1;
    for (let i = 2; i <= v; i++) r *= i;
    return r;
  }
  return check(tidy(gamma(v + 1)));
}

/** sin/cos/tan with exact answers on quarter turns (sin 180° is 0, tan 90° is invalid). */
function trig(kind: "sin" | "cos" | "tan", v: number, angle: Angle): number {
  const quarter = angle === "deg" ? 90 : angle === "grad" ? 100 : Math.PI / 2;
  if (angle !== "rad" && Number.isInteger(v / quarter)) {
    const m = (((v / quarter) % 4) + 4) % 4;
    if (kind === "sin") return [0, 1, 0, -1][m];
    if (kind === "cos") return [1, 0, -1, 0][m];
    if (m % 2) throw new CalcError("invalid");
    return 0;
  }
  const r = angle === "deg" ? (v * Math.PI) / 180 : angle === "grad" ? (v * Math.PI) / 200 : v;
  const x = Math[kind](r);
  return check(tidy(Math.abs(x) < 1e-15 ? 0 : x));
}

function fromRad(r: number, angle: Angle) {
  return tidy(angle === "deg" ? (r * 180) / Math.PI : angle === "grad" ? (r * 200) / Math.PI : r);
}

/** Format a number like calc.exe: up to `digits` significant digits, then "1,e+16" style. */
function fmtNum(n: number, dec: string, grp: string | null, digits: number, sci = false): string {
  if (n === 0) return sci ? `0${dec}e+0` : "0";
  const [m, e] = n.toExponential(digits - 1).split("e");
  const exp = Number(e);
  const neg = m.startsWith("-");
  const ds = m.replace("-", "").replace(".", "").replace(/0+$/, "") || "0";
  const sign = neg ? "-" : "";
  if (sci || exp >= digits || (exp < 0 && -exp - 1 + ds.length > digits)) {
    return `${sign}${ds[0]}${dec}${ds.slice(1)}e${exp >= 0 ? "+" : "-"}${Math.abs(exp)}`;
  }
  let int: string;
  let frac: string;
  if (exp >= 0) {
    int = ds.slice(0, exp + 1).padEnd(exp + 1, "0");
    frac = ds.slice(exp + 1);
  } else {
    int = "0";
    frac = "0".repeat(-exp - 1) + ds;
  }
  if (grp) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, grp);
  return `${sign}${int}${frac ? dec + frac : ""}`;
}

/**
 * The calculator's brain. Kept outside React state so each key press is a plain method call;
 * the component re-renders after every press.
 */
class Engine {
  sci = false;
  dec = ".";
  /** The number being typed ("12.5", "-3"), or null when the display shows a result. */
  entry: string | null = null;
  /** Exponent digits typed after Exp ("" right after pressing it). */
  exp: string | null = null;
  expNeg = false;
  cur = 0;
  /** How the current value reads in the history line when a function made it ("sqrt(9)"). */
  curExpr: string | null = null;
  vals: number[] = [];
  ops: (Bin | "(")[] = [];
  hist: string[] = [];
  parenAt: number[] = [];
  justOp = false;
  afterEq = false;
  last: { op: Bin; arg: number } | null = null;
  err: Err | null = null;
  mem = 0;
  hasMem = false;
  inv = false;
  angle: Angle = "deg";
  fe = false;

  get maxDigits() {
    return this.sci ? 32 : 16;
  }
  private fmtH(v: number) {
    return fmtNum(v, this.dec, null, 16);
  }
  value(): number {
    if (this.entry === null) return this.cur;
    const e = this.exp !== null ? `e${this.expNeg ? "-" : "+"}${this.exp || "0"}` : "";
    const n = Number(this.entry + e);
    if (!Number.isFinite(n)) throw new CalcError("overflow");
    return n;
  }
  private prec(op: Bin) {
    return this.sci ? PREC[op] : 1;
  }
  /** Apply pending operators whose precedence is at least `p` (stops at an open parenthesis). */
  private reduce(p: number) {
    while (this.ops.length) {
      const top = this.ops[this.ops.length - 1];
      if (top === "(" || this.prec(top) < p) break;
      this.ops.pop();
      const b = this.vals.pop() ?? 0;
      const a = this.vals.pop() ?? 0;
      this.vals.push(applyBin(a, top, b));
    }
  }
  private resetExpr() {
    this.vals = [];
    this.ops = [];
    this.hist = [];
    this.parenAt = [];
  }
  /** After "=", the next calculation starts over (the result stays as its first operand). */
  private fresh() {
    if (!this.afterEq) return;
    this.resetExpr();
    this.afterEq = false;
  }
  private show(v: number, expr: string | null = null) {
    this.cur = v;
    this.curExpr = expr;
    this.entry = null;
    this.exp = null;
    this.expNeg = false;
  }
  /** Run a key's action; math errors put the display into the error state. */
  run(fn: () => void) {
    try {
      fn();
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.err = e.code;
      this.vals = [];
      this.ops = [];
      this.parenAt = [];
      this.entry = null;
      this.exp = null;
      this.justOp = false;
      this.afterEq = false;
    }
  }

  clear() {
    this.resetExpr();
    this.show(0);
    this.justOp = false;
    this.afterEq = false;
    this.err = null;
    this.inv = false;
  }
  clearEntry() {
    if (this.err) return this.clear();
    this.show(0);
  }
  digit(d: string) {
    if (this.err) this.clear();
    if (this.entry === null) {
      this.fresh();
      this.entry = d;
      this.exp = null;
      this.expNeg = false;
      this.curExpr = null;
      this.justOp = false;
      return;
    }
    if (this.exp !== null) {
      if (this.exp.length < 4) this.exp = (this.exp === "0" ? "" : this.exp) + d;
      return;
    }
    if (this.entry.replace(/\D/g, "").replace(/^0+/, "").length >= this.maxDigits) return;
    if (this.entry === "0") this.entry = d;
    else if (this.entry === "-0") this.entry = `-${d}`;
    else this.entry += d;
  }
  point() {
    if (this.err) this.clear();
    if (this.exp !== null) return;
    if (this.entry === null) {
      this.fresh();
      this.entry = "0.";
      this.curExpr = null;
      this.justOp = false;
    } else if (!this.entry.includes(".")) this.entry += ".";
  }
  back() {
    if (this.err) return this.clear();
    if (this.entry === null) return;
    if (this.exp !== null) {
      if (this.exp.length) this.exp = this.exp.slice(0, -1);
      else this.exp = null;
      return;
    }
    this.entry = this.entry.slice(0, -1);
    if (this.entry === "" || this.entry === "-") this.entry = "0";
  }
  negate() {
    if (this.err) return;
    if (this.entry !== null) {
      if (this.exp !== null) this.expNeg = !this.expNeg;
      else if (this.entry !== "0") this.entry = this.entry.startsWith("-") ? this.entry.slice(1) : `-${this.entry}`;
      return;
    }
    this.unary("negate");
  }
  expKey() {
    if (this.err) return;
    if (this.entry === null) {
      this.fresh();
      this.entry = Number.isInteger(this.cur) && Math.abs(this.cur) < 1e15 ? String(this.cur) : "0";
      this.curExpr = null;
      this.justOp = false;
    }
    if (this.exp === null) this.exp = "";
  }
  binary(op: Bin) {
    if (this.err) return;
    const top = this.ops[this.ops.length - 1];
    if (this.justOp && top && top !== "(") {
      // A second operator in a row just replaces the first.
      this.ops[this.ops.length - 1] = op;
      this.hist[this.hist.length - 1] = SYM[op];
      return;
    }
    this.fresh();
    const v = this.value();
    this.hist.push(this.curExpr ?? this.fmtH(v), SYM[op]);
    this.vals.push(v);
    this.reduce(this.prec(op));
    this.show(this.vals[this.vals.length - 1]);
    this.ops.push(op);
    this.justOp = true;
  }
  equals() {
    if (this.err) return;
    if (this.afterEq) {
      // Pressing = again repeats the last operation (2 + 3 = = = gives 5, 8, 11).
      if (this.last) this.show(applyBin(this.cur, this.last.op, this.last.arg));
      return;
    }
    const v = this.value();
    const bins = this.ops.filter((o): o is Bin => o !== "(");
    if (!bins.length) {
      this.show(!this.sci && this.last ? applyBin(v, this.last.op, this.last.arg) : v);
    } else {
      this.last = { op: bins[bins.length - 1], arg: v };
      this.vals.push(v);
      while (this.ops.length) {
        const o = this.ops.pop();
        if (!o || o === "(") continue;
        const b = this.vals.pop() ?? 0;
        const a = this.vals.pop() ?? 0;
        this.vals.push(applyBin(a, o, b));
      }
      this.show(this.vals.pop() ?? v);
    }
    this.resetExpr();
    this.justOp = false;
    this.afterEq = true;
  }
  percent() {
    if (this.err) return;
    const v = this.value();
    const base = this.afterEq ? 0 : (this.vals[this.vals.length - 1] ?? 0);
    const r = check((base * v) / 100);
    this.show(r, this.fmtH(r));
    this.justOp = false;
  }
  openParen() {
    if (this.err || this.parenAt.length >= 25) return;
    this.fresh();
    this.parenAt.push(this.hist.length);
    this.hist.push("(");
    this.ops.push("(");
    this.entry = null;
    this.exp = null;
    this.curExpr = null;
    this.justOp = false;
  }
  closeParen() {
    if (this.err || !this.parenAt.length) return;
    const v = this.value();
    const at = this.parenAt.pop() ?? 0;
    const inner = [...this.hist.slice(at + 1), this.curExpr ?? this.fmtH(v)].join(" ");
    this.hist.length = at;
    this.vals.push(v);
    this.reduce(0);
    this.ops.pop();
    this.show(this.vals.pop() ?? v, `(${inner})`);
    this.justOp = false;
  }
  unary(fn: Fn) {
    if (this.err) return;
    this.fresh();
    const v = this.value();
    const a = this.angle;
    const sfx = a === "deg" ? "d" : a === "rad" ? "r" : "g";
    let r: number;
    let label: string = fn;
    switch (fn) {
      case "sqrt":
        if (v < 0) throw new CalcError("invalid");
        r = tidy(Math.sqrt(v));
        break;
      case "recip":
        if (v === 0) throw new CalcError("div0");
        r = 1 / v;
        label = "reciproc";
        break;
      case "negate":
        r = -v;
        break;
      case "sqr":
        r = v * v;
        break;
      case "cube":
        r = v * v * v;
        break;
      case "cbrt":
        r = tidy(Math.cbrt(v));
        label = "cuberoot";
        break;
      case "fact":
        r = factorial(v);
        break;
      case "ln":
        if (v <= 0) throw new CalcError("invalid");
        r = tidy(Math.log(v));
        break;
      case "exp":
        r = tidy(Math.exp(v));
        label = "powe";
        break;
      case "log":
        if (v <= 0) throw new CalcError("invalid");
        r = tidy(Math.log10(v));
        break;
      case "pow10":
        r = tidy(10 ** v);
        label = "powten";
        break;
      case "int":
        r = Math.trunc(v);
        break;
      case "frac":
        r = tidy(v - Math.trunc(v));
        break;
      case "dms": {
        const d = Math.trunc(v);
        const mf = (v - d) * 60;
        const m = Math.trunc(mf);
        r = tidy(d + m / 100 + ((mf - m) * 60) / 10000);
        break;
      }
      case "deg": {
        const d = Math.trunc(v);
        const rest = (v - d) * 100;
        const m = Math.trunc(tidy(rest));
        r = tidy(d + m / 60 + ((rest - m) * 100) / 3600);
        label = "degrees";
        break;
      }
      case "sin":
      case "cos":
      case "tan":
        r = trig(fn, v, a);
        label = fn + sfx;
        break;
      case "asin":
      case "acos":
        if (v < -1 || v > 1) throw new CalcError("invalid");
        r = fromRad(Math[fn](v), a);
        label = fn + sfx;
        break;
      case "atan":
        r = fromRad(Math.atan(v), a);
        label = fn + sfx;
        break;
      case "sinh":
      case "cosh":
      case "tanh":
      case "asinh":
        r = tidy(Math[fn](v));
        break;
      case "acosh":
        if (v < 1) throw new CalcError("invalid");
        r = tidy(Math.acosh(v));
        break;
      case "atanh":
        if (v <= -1 || v >= 1) throw new CalcError("invalid");
        r = tidy(Math.atanh(v));
        break;
    }
    this.show(check(r), `${label}(${this.curExpr ?? this.fmtH(v)})`);
    this.justOp = false;
    this.inv = false;
  }
  pi() {
    if (this.err) return;
    this.fresh();
    this.show(this.inv ? 2 * Math.PI : Math.PI);
    this.justOp = false;
    this.inv = false;
  }
  /** The typed number becomes a settled value (after MS / M+), so the next digit starts a new one. */
  private commit() {
    if (this.entry !== null) this.show(this.value());
  }
  memory(k: "mc" | "mr" | "ms" | "m+" | "m-") {
    if (k === "mc") {
      this.mem = 0;
      this.hasMem = false;
      return;
    }
    if (k === "mr") {
      if (this.err) this.clear();
      this.fresh();
      this.show(this.mem);
      this.justOp = false;
      return;
    }
    if (this.err) return;
    const v = this.value();
    this.mem = k === "ms" ? v : check(this.mem + (k === "m+" ? v : -v));
    this.hasMem = true;
    this.commit();
  }

  /** The big number on the display. */
  display(grp: string | null): string {
    if (this.entry !== null) {
      const neg = this.entry.startsWith("-");
      const body = neg ? this.entry.slice(1) : this.entry;
      const [int, frac] = body.split(".");
      const g = grp ? int.replace(/\B(?=(\d{3})+(?!\d))/g, grp) : int;
      let s = `${neg ? "-" : ""}${g}${frac !== undefined ? this.dec + frac : ""}`;
      if (this.exp !== null) s += `${frac === undefined ? this.dec : ""}e${this.expNeg ? "-" : "+"}${this.exp || "0"}`;
      return s;
    }
    return fmtNum(this.cur, this.dec, this.fe ? null : grp, 16, this.fe && this.sci);
  }
}

const ERR: Record<Err, { tr: string; en: string }> = {
  div0: { tr: "Sıfıra bölünemez", en: "Cannot divide by zero" },
  undef: { tr: "Sonuç tanımsız", en: "Result is undefined" },
  invalid: { tr: "Geçersiz giriş", en: "Invalid input" },
  overflow: { tr: "Taşma", en: "Overflow" },
};

type Key = { id: string; label: ReactNode; act: () => void; cls?: string; title?: string; on?: boolean };

/** Calculator window: menu bar, display and keypad; it resizes its window to fit each mode exactly. */
export default function CalcApp() {
  const { id, setTitle } = useWindow();
  const { lang, open } = useOS();
  const L = useL();
  const tr = lang === "tr";
  const eng = useRef<Engine | null>(null);
  if (!eng.current) eng.current = new Engine();
  const E = eng.current;
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const saved = useRef<{ mode?: Mode; group?: boolean }>(null);
  if (!saved.current) {
    try {
      saved.current = JSON.parse(window.localStorage.getItem(STORE) ?? "{}") as { mode?: Mode; group?: boolean };
    } catch {
      saved.current = {};
    }
  }
  const [mode, setMode] = useState<Mode>(saved.current.mode === "sci" ? "sci" : "std");
  const [group, setGroup] = useState(!!saved.current.group);
  const [down, setDown] = useState<string | null>(null);
  const flashTimer = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  E.sci = mode === "sci";
  E.dec = tr ? "," : ".";
  const grp = group ? (tr ? "." : ",") : null;

  useEffect(() => setTitle(L({ tr: "Hesap Makinesi", en: "Calculator" })), [L, setTitle]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORE, JSON.stringify({ mode, group }));
    } catch {
      /* not remembered */
    }
  }, [mode, group]);

  // calc.exe is a fixed-size window that snaps to the size of each mode (re-fit whenever the content's size changes,
  // e.g. once its stylesheet or fonts arrive).
  useLayoutEffect(() => {
    const el = root.current;
    const client = el?.closest(".w8-client") as HTMLElement | null;
    if (!el || !client) return;
    const fit = () => {
      const w = wm.get(id);
      if (!w) return;
      const nw = el.offsetWidth + (w.w - client.clientWidth);
      const nh = el.offsetHeight + (w.h - client.clientHeight);
      if (nw === w.w && nh === w.h) return;
      const x = Math.max(0, Math.min(w.x, window.innerWidth - nw - 4));
      wm.patch(id, { w: nw, h: nh, x });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id]);

  /** Press a key: run it, re-render, and light the key up briefly (also for keyboard input). */
  const press = (keyId: string, fn: () => void) => {
    E.run(fn);
    bump();
    setDown(keyId);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setDown(null), 110);
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    E.clear();
    setMode(m);
  };

  const copy = () => {
    const text = E.err ? L(ERR[E.err]) : E.display(null);
    void navigator.clipboard?.writeText(text).catch(() => {});
  };
  const paste = () => {
    void navigator.clipboard
      ?.readText()
      .then((text) => {
        for (const ch of text.trim().slice(0, 200)) {
          const k = keyFor(ch);
          if (k) E.run(k.act);
        }
        bump();
      })
      .catch(() => {});
  };

  // ---- keys ----
  const k = (id: string, label: ReactNode, act: () => void, cls?: string, title?: string): Key => ({ id, label, act, cls, title });
  const inv = E.inv;
  const sup = (base: ReactNode, s: ReactNode) => (
    <>
      {base}
      <sup>{s}</sup>
    </>
  );
  const std: Key[] = [
    k("mc", "MC", () => E.memory("mc"), "mem"),
    k("mr", "MR", () => E.memory("mr"), "mem"),
    k("ms", "MS", () => E.memory("ms"), "mem"),
    k("m+", "M+", () => E.memory("m+"), "mem"),
    k("m-", "M-", () => E.memory("m-"), "mem"),
    k("back", <span className="calc-arrow">←</span>, () => E.back()),
    k("ce", "CE", () => E.clearEntry()),
    k("c", "C", () => E.clear()),
    k("neg", "±", () => E.negate()),
    k("sqrt", "√", () => E.unary("sqrt")),
    k("7", "7", () => E.digit("7"), "num"),
    k("8", "8", () => E.digit("8"), "num"),
    k("9", "9", () => E.digit("9"), "num"),
    k("/", "/", () => E.binary("/")),
    k("%", "%", () => E.percent()),
    k("4", "4", () => E.digit("4"), "num"),
    k("5", "5", () => E.digit("5"), "num"),
    k("6", "6", () => E.digit("6"), "num"),
    k("*", "*", () => E.binary("*")),
    k("recip", "1/x", () => E.unary("recip")),
    k("1", "1", () => E.digit("1"), "num"),
    k("2", "2", () => E.digit("2"), "num"),
    k("3", "3", () => E.digit("3"), "num"),
    k("-", "-", () => E.binary("-")),
    k("=", "=", () => E.equals(), "eq"),
    k("0", "0", () => E.digit("0"), "num zero"),
    k(".", tr ? "," : ".", () => E.point(), "num"),
    k("+", "+", () => E.binary("+")),
  ];
  const x = <i>x</i>;
  const y = <i>y</i>;
  const sci: (Key | null)[] = [
    null,
    { ...k("inv", "Inv", () => (E.inv = !E.inv)), on: inv },
    k("ln", inv ? sup(<i>e</i>, x) : "ln", () => E.unary(inv ? "exp" : "ln")),
    k("(", "(", () => E.openParen()),
    k(")", ")", () => E.closeParen()),
    k("int", inv ? "Frac" : "Int", () => E.unary(inv ? "frac" : "int")),
    k("sinh", inv ? sup("sinh", "-1") : "sinh", () => E.unary(inv ? "asinh" : "sinh")),
    k("sin", inv ? sup("sin", "-1") : "sin", () => E.unary(inv ? "asin" : "sin")),
    k("sqr", sup(x, "2"), () => E.unary("sqr")),
    k("fact", "n!", () => E.unary("fact")),
    k("dms", inv ? "deg" : "dms", () => E.unary(inv ? "deg" : "dms")),
    k("cosh", inv ? sup("cosh", "-1") : "cosh", () => E.unary(inv ? "acosh" : "cosh")),
    k("cos", inv ? sup("cos", "-1") : "cos", () => E.unary(inv ? "acos" : "cos")),
    k("pow", sup(x, y), () => E.binary("pow")),
    k("root", <>{<sup>{y}</sup>}√{x}</>, () => E.binary("root")),
    k("pi", inv ? "2*π" : "π", () => E.pi()),
    k("tanh", inv ? sup("tanh", "-1") : "tanh", () => E.unary(inv ? "atanh" : "tanh")),
    k("tan", inv ? sup("tan", "-1") : "tan", () => E.unary(inv ? "atan" : "tan")),
    k("cube", sup(x, "3"), () => E.unary("cube")),
    k("cbrt", <>{<sup>3</sup>}√{x}</>, () => E.unary("cbrt")),
    { ...k("fe", "F-E", () => (E.fe = !E.fe)), on: E.fe },
    k("exp", "Exp", () => E.expKey()),
    k("mod", "Mod", () => E.binary("mod")),
    k("log", "log", () => E.unary("log")),
    k("pow10", sup("10", x), () => E.unary("pow10")),
  ];
  const all = [...std, ...sci.filter((s): s is Key => !!s)];
  const byId = (kid: string) => all.find((s) => s.id === kid);

  /** Which key a typed character presses (the same map calc.exe uses). */
  function keyFor(ch: string): Key | undefined {
    if (/^[0-9]$/.test(ch)) return byId(ch);
    if (ch === "." || ch === ",") return byId(".");
    const map: Record<string, string> = { "+": "+", "-": "-", "*": "*", "/": "/", "%": "%", "=": "=", "@": "sqrt", r: "recip" };
    const sciMap: Record<string, string> = { "(": "(", ")": ")", s: "sin", o: "cos", t: "tan", n: "ln", l: "log", q: "sqr", y: "pow", "#": "cube", "!": "fact", p: "pi", i: "inv", x: "exp", v: "fe", m: "dms", d: "mod", ";": "int" };
    const lc = ch.toLowerCase();
    const kid = map[lc] ?? (mode === "sci" ? sciMap[lc] : undefined);
    return kid ? byId(kid) : undefined;
  }

  const keys: Record<string, () => void> = {
    enter: () => press("=", () => E.equals()),
    backspace: () => press("back", () => E.back()),
    escape: () => press("c", () => E.clear()),
    delete: () => press("ce", () => E.clearEntry()),
    f9: () => press("neg", () => E.negate()),
    "alt+1": () => switchMode("std"),
    "alt+2": () => switchMode("sci"),
    "ctrl+c": copy,
    "ctrl+v": paste,
    "ctrl+l": () => press("mc", () => E.memory("mc")),
    "ctrl+r": () => press("mr", () => E.memory("mr")),
    "ctrl+m": () => press("ms", () => E.memory("ms")),
    "ctrl+p": () => press("m+", () => E.memory("m+")),
    "ctrl+q": () => press("m-", () => E.memory("m-")),
    ...(mode === "sci"
      ? {
          f3: () => ((E.angle = "deg"), bump()),
          f4: () => ((E.angle = "rad"), bump()),
          f5: () => ((E.angle = "grad"), bump()),
        }
      : {}),
  };
  for (const ch of "0123456789.,+-*/%=@rRsotnlqy#!pixvmd;()") {
    const fire = () => {
      const key = keyFor(ch);
      if (!key) return false;
      press(key.id, key.act);
    };
    keys[ch.toLowerCase()] = fire;
    keys[`shift+${ch.toLowerCase()}`] = fire;
  }
  useWinKeys(keys);

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: L({ tr: "Görünüm", en: "View" }),
      items: [
        { label: L({ tr: "Standart", en: "Standard" }), shortcut: "Alt+1", checked: mode === "std", radio: true, onClick: () => switchMode("std") },
        { label: L({ tr: "Bilimsel", en: "Scientific" }), shortcut: "Alt+2", checked: mode === "sci", radio: true, onClick: () => switchMode("sci") },
        { sep: true },
        { label: L({ tr: "Basamak gruplama", en: "Digit grouping" }), checked: group, onClick: () => setGroup((g) => !g) },
      ],
    },
    {
      label: L({ tr: "Düzen", en: "Edit" }),
      items: [
        { label: L({ tr: "Kopyala", en: "Copy" }), shortcut: "Ctrl+C", onClick: copy },
        { label: L({ tr: "Yapıştır", en: "Paste" }), shortcut: "Ctrl+V", onClick: paste },
      ],
    },
    {
      label: L({ tr: "Yardım", en: "Help" }),
      items: [{ label: L({ tr: "Hesap Makinesi Hakkında", en: "About Calculator" }), onClick: () => open({ kind: "app", app: "winver" }) }],
    },
  ];

  const text = E.err ? L(ERR[E.err]) : E.display(grp);
  const width = mode === "sci" ? 380 : 178;
  const size = Math.max(11, Math.min(E.err ? 17 : 23, width / (text.length * 0.56)));
  // The history line: the expression so far, plus the function that made the current value ("9 + sqrt(16)").
  const hist = E.curExpr ? [...E.hist, E.curExpr] : E.hist;

  const renderKey = (key: Key | null, i: number) =>
    key ? (
      <button
        key={key.id}
        tabIndex={-1}
        className={`calc-key ${key.cls ?? ""} ${down === key.id || key.on ? "down" : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => press(key.id, key.act)}
      >
        <span>{key.label}</span>
      </button>
    ) : (
      <span key={`gap${i}`} />
    );

  const angles: [Angle, string][] = [
    ["deg", L({ tr: "Derece", en: "Degrees" })],
    ["rad", L({ tr: "Radyan", en: "Radians" })],
    ["grad", L({ tr: "Grad", en: "Grads" })],
  ];

  return (
    <div className={`calc calc-${mode}`} ref={root}>
      <MenuBar menus={menus} />
      <div className="calc-body">
        <div className="calc-display" onContextMenu={(e) => e.preventDefault()}>
          <div className="calc-hist">{hist.join(" ")}</div>
          <div className="calc-main" style={{ fontSize: size }}>
            {text}
          </div>
          <div className="calc-ind">
            {E.hasMem && <span>M</span>}
            {E.parenAt.length > 0 && <span>(={E.parenAt.length}</span>}
          </div>
        </div>
        <div className="calc-pads">
          {mode === "sci" && (
            <div className="calc-keys calc-sci">
              <div className="calc-angles">
                {angles.map(([a, label]) => (
                  <label key={a} className={E.angle === a ? "on" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => ((E.angle = a), bump())}>
                    <span className="calc-radio" />
                    {label}
                  </label>
                ))}
              </div>
              {sci.map(renderKey)}
            </div>
          )}
          <div className="calc-keys calc-std">{std.map(renderKey)}</div>
        </div>
      </div>
    </div>
  );
}
