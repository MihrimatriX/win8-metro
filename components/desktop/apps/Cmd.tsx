"use client";
/**
 * Command Prompt (Komut İstemi) as in Windows 8.1: a black console with the blinking underscore cursor, working
 * over the virtual file system (dir, cd, md, rd, del, copy, move, ren, type, tree, echo with > and >> redirection),
 * plus ver, vol, date, time, title, color, whoami, hostname, ipconfig, systeminfo, tasklist, taskkill, start and exit.
 * Up/Down recall history, Tab completes paths, Ctrl+C cancels the line, right-click copies a selection or pastes.
 * Typing a program name (notepad, calc, mspaint…) or a document starts it, like PATH and file associations do.
 */
import { useEffect, useRef, useState } from "react";
import { useOS } from "@/lib/os";
import { fs, normalize, resolve, basename, dirname, join, splitPath, HOME, USER, type FNode } from "@/lib/fs";
import { wm } from "@/lib/wm";
import { appByExe, app as appDef } from "@/lib/model";
import { useWindow } from "../ui";
import { msgBox } from "../dialogs";
import { useOpenPath } from "../shell";
import { listProcs, metroApps, endProc, HOST, IPV4, IPV6 } from "./TaskMgr";
import "./cmd.css";

/** The 16 console colors, as `color XY` numbers them. */
const PALETTE = [
  "#000000",
  "#000080",
  "#008000",
  "#008080",
  "#800000",
  "#800080",
  "#808000",
  "#c0c0c0",
  "#808080",
  "#0000ff",
  "#00ff00",
  "#00ffff",
  "#ff0000",
  "#ff00ff",
  "#ffff00",
  "#ffffff",
];
const SERIAL = "6A3C-1F2E";
const DISK = 48_318_382_080;
const MAX_LINES = 2000;

// name, English, Turkish (the HELP list, abridged to the commands this console knows)
const HELP: [string, string, string][] = [
  ["CD", "Displays the name of or changes the current directory.", "Geçerli dizinin adını görüntüler veya değiştirir."],
  [
    "CHDIR",
    "Displays the name of or changes the current directory.",
    "Geçerli dizinin adını görüntüler veya değiştirir.",
  ],
  ["CLS", "Clears the screen.", "Ekranı temizler."],
  [
    "COLOR",
    "Sets the default console foreground and background colors.",
    "Varsayılan konsol ön plan ve arka plan renklerini ayarlar.",
  ],
  ["COPY", "Copies one or more files to another location.", "Bir veya daha çok dosyayı başka bir konuma kopyalar."],
  ["DATE", "Displays or sets the date.", "Tarihi görüntüler veya ayarlar."],
  ["DEL", "Deletes one or more files.", "Bir veya daha çok dosyayı siler."],
  [
    "DIR",
    "Displays a list of files and subdirectories in a directory.",
    "Bir dizindeki dosya ve alt dizinlerin listesini görüntüler.",
  ],
  [
    "ECHO",
    "Displays messages, or turns command echoing on or off.",
    "İletileri görüntüler veya komut yankılamayı açar veya kapatır.",
  ],
  ["ERASE", "Deletes one or more files.", "Bir veya daha çok dosyayı siler."],
  ["EXIT", "Quits the CMD.EXE program (command interpreter).", "CMD.EXE programından (komut yorumlayıcısı) çıkar."],
  ["HELP", "Provides Help information for Windows commands.", "Windows komutları için Yardım bilgisi sağlar."],
  ["MD", "Creates a directory.", "Bir dizin oluşturur."],
  ["MKDIR", "Creates a directory.", "Bir dizin oluşturur."],
  [
    "MOVE",
    "Moves one or more files from one directory to another directory.",
    "Bir veya daha çok dosyayı bir dizinden başka bir dizine taşır.",
  ],
  ["RD", "Removes a directory.", "Bir dizini kaldırır."],
  ["REN", "Renames a file or files.", "Bir veya daha çok dosyayı yeniden adlandırır."],
  ["RENAME", "Renames a file or files.", "Bir veya daha çok dosyayı yeniden adlandırır."],
  ["RMDIR", "Removes a directory.", "Bir dizini kaldırır."],
  [
    "START",
    "Starts a separate window to run a specified program or command.",
    "Belirtilen bir programı veya komutu çalıştırmak için ayrı bir pencere başlatır.",
  ],
  [
    "SYSTEMINFO",
    "Displays machine specific properties and configuration.",
    "Makineye özgü özellikleri ve yapılandırmayı görüntüler.",
  ],
  [
    "TASKKILL",
    "Kill or stop a running process or application.",
    "Çalışan bir işlemi veya uygulamayı sonlandırır ya da durdurur.",
  ],
  [
    "TASKLIST",
    "Displays all currently running tasks including services.",
    "Hizmetler dahil, şu anda çalışan tüm görevleri görüntüler.",
  ],
  ["TIME", "Displays or sets the system time.", "Sistem saatini görüntüler veya ayarlar."],
  ["TITLE", "Sets the window title for a CMD.EXE session.", "CMD.EXE oturumu için pencere başlığını ayarlar."],
  [
    "TREE",
    "Graphically displays the directory structure of a drive or path.",
    "Bir sürücünün veya yolun dizin yapısını grafik olarak görüntüler.",
  ],
  ["TYPE", "Displays the contents of a text file.", "Bir metin dosyasının içeriğini görüntüler."],
  ["VER", "Displays the Windows version.", "Windows sürümünü görüntüler."],
  ["VOL", "Displays a disk volume label and serial number.", "Disk birimi etiketini ve seri numarasını görüntüler."],
];

/** Split arguments on spaces, keeping "quoted strings" together (without their quotes). */
const tokens = (s: string) => [...s.matchAll(/"([^"]*)"?|(\S+)/g)].map((m) => m[1] ?? m[2]);

/** Cut an unquoted `> file` / `>> file` off the end of a command line. */
function splitRedirect(line: string): [string, string | null, boolean] {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ">" && !quoted) {
      const append = line[i + 1] === ">";
      const target = line.slice(i + (append ? 2 : 1)).trim();
      return [line.slice(0, i).trimEnd(), target.replace(/^"|"$/g, ""), append];
    }
  }
  return [line, null, false];
}

const isDir = (n: FNode) => n.kind === "dir" || n.kind === "drive";
const isWild = (p: string) => /[*?]/.test(basename(p));
/** Children of `dir` matching a wildcard pattern (* and ?, with *.* meaning everything). */
function matching(dir: string, pattern: string, hidden = false): FNode[] {
  if (pattern === "*.*") pattern = "*";
  const re = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
    "i",
  );
  return fs.list(dir, hidden).filter((n) => re.test(n.name));
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** "14.09.2026  10:24" / "09/14/2026  10:24 AM", the dir listing's date column. */
function stamp(ms: number, tr: boolean) {
  const d = new Date(ms);
  if (tr)
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}  ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const h = d.getHours() % 12 || 12;
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}  ${pad2(h)}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
}
function today(tr: boolean) {
  const d = new Date();
  return tr
    ? `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`
    : `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
}
function clock(seconds: boolean) {
  const d = new Date();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return seconds ? `${hm}:${pad2(d.getSeconds())},${pad2(Math.floor(d.getMilliseconds() / 10))}` : hm;
}

export default function CmdApp() {
  const { id, win, focused, close, setTitle } = useWindow();
  const { lang, t, recent, view, open, closeApp } = useOS();
  const openPath = useOpenPath();
  const tr = lang === "tr";
  const banner = `Microsoft Windows [${tr ? "Sürüm" : "Version"} 6.3.9600]\n(c) 2013 Microsoft Corporation. ${tr ? "Tüm hakları saklıdır." : "All rights reserved."}\n`;
  const [out, setOut] = useState(() => `${banner}\n`);
  const [cwd, setCwd] = useState(() => (win.arg && fs.isDir(win.arg) ? normalize(win.arg) : HOME));
  const [line, setLine] = useState("");
  const [caret, setCaret] = useState(0);
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const [color, setColor] = useState("07");
  const [echo, setEcho] = useState(true);
  // A question waiting for its answer ("Are you sure (Y/N)?"); the answer goes to `then`.
  const [ask, setAsk] = useState<{ q: string; then: (answer: string) => string } | null>(null);
  // Tab completion in progress: the line before the word, the candidates, and which one is shown.
  const [tab, setTab] = useState<{ head: string; list: string[]; i: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const screen = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focused) input.current?.focus({ preventScroll: true });
  }, [focused]);
  useEffect(() => {
    const el = screen.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [out, line]);

  const prompt = ask ? ask.q : echo ? `${cwd}>` : "";
  const write = (s: string) =>
    setOut((o) => {
      const all = (o + s).split("\n");
      return all.length > MAX_LINES ? all.slice(-MAX_LINES).join("\n") : o + s;
    });
  const num = (n: number) => n.toLocaleString(tr ? "tr-TR" : "en-US");
  const M = {
    path: tr ? "Sistem belirtilen yolu bulamıyor." : "The system cannot find the path specified.",
    file: tr ? "Sistem belirtilen dosyayı bulamıyor." : "The system cannot find the file specified.",
    syntax: tr ? "Komutun sözdizimi doğru değil." : "The syntax of the command is incorrect.",
    denied: tr ? "Erişim engellendi." : "Access is denied.",
    notReady: tr ? "Aygıt hazır değil." : "The device is not ready.",
    badDir: tr ? "Dizin adı geçersiz." : "The directory name is invalid.",
    badName: tr
      ? "Dosya adı, dizin adı veya birim etiketi sözdizimi yanlış."
      : "The filename, directory name, or volume label syntax is incorrect.",
    sure: tr ? "Emin misiniz (E/H)?" : "Are you sure (Y/N)?",
  };
  const yes = (a: string) => /^[ye]/i.test(a);
  /** Ask a question; the command finishes when it's answered. */
  const question = (q: string, then: (answer: string) => string) => {
    setAsk({ q, then });
    return null;
  };
  /** An empty DVD drive: anything on it is "not ready". */
  const notReady = (p: string) => {
    const d = fs.get(splitPath(p)[0] ?? "");
    return !!d && d.kind === "drive" && d.name.toUpperCase() !== "C:" && !d.children?.length;
  };
  const volume = (p: string) => {
    const drive = (splitPath(p)[0] ?? "C:")[0].toUpperCase();
    return tr
      ? ` ${drive} sürücüsündeki birimin etiketi yok.\n Birim Seri Numarası: ${SERIAL}\n`
      : ` Volume in drive ${drive} has no label.\n Volume Serial Number is ${SERIAL}\n`;
  };
  const procs = () => listProcs(wm.state.wins, metroApps(recent), view, (a) => t(appDef(a).title), tr);

  /** Start a program, document, folder or web address; false when there's nothing by that name. */
  const start = (prog: string, args: string, direct = false): boolean => {
    if (!direct && /^((https?|ftp):\/\/|www\.)/i.test(prog)) {
      open({ kind: "app", app: "ie", param: /^www\./i.test(prog) ? `http://${prog}` : prog });
      return true;
    }
    const p = resolve(cwd, prog);
    const n = fs.get(p);
    // Typed at the prompt, a folder name isn't a command; after "start" it opens in Explorer.
    if (n && !(direct && isDir(n))) return openPath(p);
    const a = appByExe(prog);
    if (!a || a.kind !== "desktop" || a.id === "run") return false;
    if (a.id === "cmd") wm.launch("cmd", { arg: cwd });
    else
      open({
        kind: "app",
        app: a.id,
        param: !args ? undefined : a.id === "ie" || a.id === "control" ? args : resolve(cwd, args),
      });
    return true;
  };

  /** dir: the volume header, a block per folder (several with /s), then the totals. */
  const dir = (arg: string | undefined, all: boolean, bare: boolean, sub: boolean) => {
    const p = resolve(cwd, arg ?? ".");
    if (notReady(p)) return `${M.notReady}\n`;
    const [base, pattern] = fs.isDir(p) ? [p, "*"] : [dirname(p), basename(p)];
    let s = bare ? "" : volume(p);
    if (!fs.isDir(base)) return bare ? `${M.file}\n` : `${s}\n${M.path}\n`;
    let files = 0;
    let bytes = 0;
    let dirs = 0;
    const block = (d: string) => {
      const kids = matching(d, pattern, all);
      const dots = pattern === "*" && splitPath(d).length > 1;
      if (kids.length || (!sub && !bare)) {
        if (!bare) s += `\n ${tr ? `${d} dizini` : `Directory of ${d}`}\n\n`;
        let f = 0;
        let b = 0;
        if (dots && !bare) {
          const m = fs.get(d)?.modified ?? 0;
          s += `${stamp(m, tr)}    <DIR>          .\n${stamp(m, tr)}    <DIR>          ..\n`;
        }
        for (const k of kids) {
          if (bare) {
            s += `${sub ? join(d, k.name) : k.name}\n`;
            continue;
          }
          const size = fs.size(k);
          s += `${stamp(k.modified, tr)}${isDir(k) ? "    <DIR>          " : `${num(size).padStart(18)} `}${k.name}\n`;
          if (!isDir(k)) {
            f++;
            b += size;
          }
        }
        if (!bare && (kids.length || dots))
          s += `${String(f).padStart(16)} ${tr ? "Dosya" : "File(s)"} ${num(b).padStart(14)} ${tr ? "bayt" : "bytes"}\n`;
        files += f;
        bytes += b;
        dirs += kids.length - f + (dots ? 2 : 0);
      }
      if (sub) for (const c of fs.list(d, all)) if (isDir(c)) block(join(d, c.name));
    };
    block(base);
    if (bare) return s;
    if (!files && !dirs) return `${s}${tr ? "Dosya Bulunamadı" : "File Not Found"}\n`;
    const free = `${String(dirs).padStart(16)} ${tr ? "Dizin" : "Dir(s)"} ${num(DISK - fs.size(fs.get("C:\\")!)).padStart(15)} ${tr ? "bayt boş" : "bytes free"}\n`;
    if (!sub) return s + free;
    return `${s}\n     ${tr ? "Listelenen Toplam Dosya:" : "Total Files Listed:"}\n${String(files).padStart(16)} ${tr ? "Dosya" : "File(s)"} ${num(bytes).padStart(14)} ${tr ? "bayt" : "bytes"}\n${free}`;
  };

  const tree = (arg: string | undefined, withFiles: boolean) => {
    const p = resolve(cwd, arg ?? ".");
    let s = `${tr ? "Klasör YOLU listesi" : "Folder PATH listing"}\n${tr ? "Birim seri numarası:" : "Volume serial number is"} ${SERIAL}\n`;
    if (!fs.isDir(p))
      return `${s}${tr ? "Geçersiz yol" : "Invalid path"} - ${arg}\n${tr ? "Alt klasör yok" : "No subfolders exist"}\n`;
    s += `${arg ? p.toUpperCase() : `${splitPath(p)[0].toUpperCase()}.`}\n`;
    let any = false;
    const walk = (d: string, pre: string) => {
      const kids = fs.list(d);
      const dirs = kids.filter(isDir);
      const files = withFiles ? kids.filter((k) => !isDir(k)) : [];
      for (const f of files) s += `${pre}${dirs.length ? "│   " : "    "}${f.name}\n`;
      if (files.length) s += `${pre}${dirs.length ? "│" : ""}\n`;
      dirs.forEach((c, i) => {
        any = true;
        const last = i === dirs.length - 1;
        s += `${pre}${last ? "└───" : "├───"}${c.name}\n`;
        walk(join(d, c.name), pre + (last ? "    " : "│   "));
      });
    };
    walk(p, "");
    return any ? s : `${s}${tr ? "Alt klasör yok" : "No subfolders exist"}\n`;
  };

  /** Delete the files in `d` matching `pattern` (del never touches folders, and skips the Recycle Bin). */
  const delIn = (d: string, pattern: string) => {
    const hits = matching(d, pattern).filter((n) => !isDir(n));
    if (!hits.length) return `${tr ? `${join(d, pattern)} bulunamadı` : `Could Not Find ${join(d, pattern)}`}\n`;
    for (const n of hits) fs.remove(join(d, n.name), true);
    return "";
  };

  /** Run one command; returns its output (lines end with \n), or null when it printed nothing to follow. */
  const run = (cmd: string): string | null => {
    // "cd..", "cd\" and "echo." work without a space, like the real thing.
    const m = /^(cd|chdir|echo|dir|md|mkdir|rd|rmdir)(?=[.\\/])|^\S+/i.exec(cmd);
    if (!m) return "";
    const word = m[0];
    const name = word.toLowerCase();
    const rest = cmd.slice(word.length).trim();
    const args = tokens(rest);
    const flags = args.filter((a) => a.startsWith("/")).map((a) => a.toLowerCase());
    const paths = args.filter((a) => !a.startsWith("/"));
    const valueOf = (flag: string) => args[args.findIndex((a) => a.toLowerCase() === flag) + 1];
    const help = (n: string) => {
      const h = HELP.find(([c]) => c === n.toUpperCase());
      if (h) return `${tr ? h[2] : h[1]}\n`;
      return tr
        ? `Bu komut yardım yardımcı programı tarafından desteklenmiyor. "${n} /?" komutunu deneyin.\n`
        : `This command is not supported by the help utility.  Try "${n} /?".\n`;
    };
    if (flags.includes("/?")) return help(name);

    // "D:" switches drives.
    if (/^[a-z]:$/i.test(cmd)) {
      const p = normalize(cmd);
      if (!fs.exists(p))
        return `${tr ? "Sistem belirtilen sürücüyü bulamıyor." : "The system cannot find the drive specified."}\n`;
      if (notReady(p)) return `${M.notReady}\n`;
      if (splitPath(cwd)[0].toUpperCase() !== p.slice(0, 2)) setCwd(p);
      return "";
    }

    switch (name) {
      case "help":
        if (paths[0]) return help(paths[0]);
        return `${tr ? "Belirli bir komut hakkında daha fazla bilgi için HELP komut-adı yazın" : "For more information on a specific command, type HELP command-name"}\n${HELP.map(([c, en, trText]) => `${c.padEnd(15)}${tr ? trText : en}`).join("\n")}\n`;
      case "cls":
        setOut("");
        return null;
      case "echo": {
        const text = cmd.slice(5);
        if (/^[.\\/]/.test(cmd.slice(4))) return `${text}\n`;
        if (!text.trim())
          return `${echo ? (tr ? "ECHO açık." : "ECHO is on.") : tr ? "ECHO kapalı." : "ECHO is off."}\n`;
        if (/^(on|off)$/i.test(text.trim())) {
          setEcho(text.trim().toLowerCase() === "on");
          return "";
        }
        return `${text}\n`;
      }
      case "cd":
      case "chdir": {
        const arg = rest
          .replace(/^\/d\s*/i, "")
          .replace(/"/g, "")
          .trim();
        if (!arg) return `${cwd}\n`;
        const p = resolve(cwd, arg);
        if (notReady(p)) return `${M.notReady}\n`;
        if (!fs.exists(p)) return `${M.path}\n`;
        if (!fs.isDir(p)) return `${M.badDir}\n`;
        setCwd(p);
        return "";
      }
      case "dir":
        return dir(
          paths[0],
          flags.some((f) => f.startsWith("/a")),
          flags.includes("/b"),
          flags.includes("/s"),
        );
      case "md":
      case "mkdir": {
        if (!paths.length) return `${M.syntax}\n`;
        let s = "";
        for (const a of paths) {
          const p = resolve(cwd, a);
          if (/[*?<>|:]/.test(splitPath(p).slice(1).join(""))) s += `${M.badName}\n`;
          else if (fs.exists(p))
            s += `${tr ? `${a} alt dizini veya dosyası zaten var.` : `A subdirectory or file ${a} already exists.`}\n`;
          else fs.mkdir(p);
        }
        return s;
      }
      case "rd":
      case "rmdir": {
        if (!paths.length) return `${M.syntax}\n`;
        const p = resolve(cwd, paths[0]);
        const n = fs.get(p);
        if (!n) return `${M.file}\n`;
        if (!isDir(n) || n.kind === "drive") return `${M.badDir}\n`;
        const c = cwd.toLowerCase();
        if (c === p.toLowerCase() || c.startsWith(`${p.toLowerCase()}\\`))
          return `${tr ? "Dosya başka bir işlem tarafından kullanıldığından bu işlem dosyaya erişemiyor." : "The process cannot access the file because it is being used by another process."}\n`;
        if (n.children?.length && !flags.includes("/s"))
          return `${tr ? "Dizin boş değil." : "The directory is not empty."}\n`;
        if (flags.includes("/s") && !flags.includes("/q"))
          return question(`${paths[0]}, ${M.sure} `, (a) => (yes(a) ? (fs.remove(p, true), "") : ""));
        fs.remove(p, true);
        return "";
      }
      case "del":
      case "erase": {
        if (!paths.length) return `${M.syntax}\n`;
        const quiet = flags.includes("/q");
        let s = "";
        for (const a of paths) {
          const p = resolve(cwd, a);
          const [d, pattern] = fs.isDir(p) ? [p, "*"] : [dirname(p), basename(p)];
          if (!isWild(p) && !fs.isDir(p) && !fs.exists(p)) {
            s += `${tr ? `${p} bulunamadı` : `Could Not Find ${p}`}\n`;
            continue;
          }
          // Deleting everything in a folder asks first, unless /Q.
          if (!quiet && (pattern === "*" || pattern === "*.*"))
            return question(`${join(d, pattern)}, ${M.sure} `, (ans) => (yes(ans) ? delIn(d, pattern) : ""));
          s += delIn(d, pattern);
        }
        return s;
      }
      case "type": {
        if (!paths.length) return `${M.syntax}\n`;
        return paths
          .map((a) => {
            const n = fs.get(resolve(cwd, a));
            if (!n) return `${M.file}\n`;
            if (isDir(n)) return `${M.denied}\n`;
            return (n.text ?? (n.data || n.art ? "‰PNG\n\u001a\n" : "")).replace(/\r\n/g, "\n");
          })
          .join("");
      }
      case "copy": {
        const [src, dst] = paths;
        if (!src) return `${M.syntax}\n`;
        const sp = resolve(cwd, src);
        const many = fs.isDir(sp) || isWild(sp);
        const from = fs.isDir(sp)
          ? fs
              .list(sp)
              .filter((n) => !isDir(n))
              .map((n) => join(sp, n.name))
          : isWild(sp)
            ? matching(dirname(sp), basename(sp))
                .filter((n) => !isDir(n))
                .map((n) => join(dirname(sp), n.name))
            : fs.exists(sp)
              ? [sp]
              : [];
        const copied = (n: number) => `${String(n).padStart(9)} ${tr ? "dosya kopyalandı." : "file(s) copied."}\n`;
        if (!from.length) return `${M.file}\n${copied(0)}`;
        const dp = resolve(cwd, dst ?? ".");
        let s = "";
        let n = 0;
        for (const f of from) {
          const to = fs.isDir(dp) ? join(dp, basename(f)) : dp;
          if (to.toLowerCase() === f.toLowerCase()) {
            s += `${tr ? "Dosya kendi üzerine kopyalanamaz." : "The file cannot be copied onto itself."}\n`;
            continue;
          }
          const node = fs.get(f)!;
          try {
            fs.write(to, { text: node.text, data: node.data, art: node.art, target: node.target, size: node.size });
            if (many) s += `${f}\n`;
            n++;
          } catch {
            s += `${M.path}\n`;
          }
        }
        return s + copied(n);
      }
      case "move": {
        const [src, dst] = paths;
        if (!src) return `${M.syntax}\n`;
        const sp = resolve(cwd, src);
        const n = fs.get(sp);
        if (!n) return `${M.file}\n`;
        const dp = resolve(cwd, dst ?? ".");
        try {
          // Into a folder, or to a new name (move into its folder, then rename). An existing file is replaced.
          const into = fs.isDir(dp);
          const target = into ? join(dp, n.name) : dp;
          if (!into && !fs.isDir(dirname(dp))) return `${M.path}\n`;
          if (target.toLowerCase() !== sp.toLowerCase() && fs.get(target) && !isDir(fs.get(target)!))
            fs.remove(target, true);
          const moved = fs.move(sp, into ? dp : dirname(dp));
          if (!into && basename(moved) !== basename(dp)) fs.rename(moved, basename(dp));
        } catch {
          return `${M.denied}\n`;
        }
        return `${String(1).padStart(9)} ${isDir(n) ? (tr ? "dizin taşındı." : "dir(s) moved.") : tr ? "dosya taşındı." : "file(s) moved."}\n`;
      }
      case "ren":
      case "rename": {
        if (paths.length < 2) return `${M.syntax}\n`;
        if (/[\\/]/.test(paths[1])) return `${M.syntax}\n`;
        try {
          fs.rename(resolve(cwd, paths[0]), paths[1]);
          return "";
        } catch {
          return `${tr ? "Yinelenen bir dosya adı var veya dosya bulunamıyor." : "A duplicate file name exists, or the file cannot be found."}\n`;
        }
      }
      case "tree":
        return tree(paths[0], flags.includes("/f"));
      case "ver":
        return `\n${banner.split("\n")[0]}\n`;
      case "vol":
        return volume(paths[0] ?? cwd);
      case "date":
        if (flags.includes("/t")) return `${today(tr)}\n`;
        write(`${tr ? "Geçerli tarih:" : "The current date is:"} ${today(tr)}\n`);
        return question(tr ? "Yeni tarihi girin: (gg-aa-yy) " : "Enter the new date: (mm-dd-yy) ", (a) =>
          a
            ? `${tr ? "İstemci gerekli ayrıcalığa sahip değil." : "A required privilege is not held by the client."}\n`
            : "",
        );
      case "time":
        if (flags.includes("/t")) return `${clock(false)}\n`;
        write(`${tr ? "Geçerli saat:" : "The current time is:"} ${clock(true)}\n`);
        return question(tr ? "Yeni saati girin: " : "Enter the new time: ", (a) =>
          a
            ? `${tr ? "İstemci gerekli ayrıcalığa sahip değil." : "A required privilege is not held by the client."}\n`
            : "",
        );
      case "title":
        setTitle(rest);
        return "";
      case "color": {
        const c = (paths[0] ?? "07").toLowerCase();
        if (!/^[0-9a-f]{1,2}$/.test(c)) return "";
        const next = c.length === 1 ? `0${c}` : c;
        if (next[0] !== next[1]) setColor(next);
        return "";
      }
      case "whoami":
        return `${HOST.toLowerCase()}\\${USER.toLowerCase()}\n`;
      case "hostname":
        return `${HOST}\n`;
      case "ipconfig": {
        const row = (en: string, trText: string, v: string) => `   ${(tr ? trText : en).padEnd(36, " .")}: ${v}\n`;
        return (
          `\n${tr ? "Windows IP Yapılandırması" : "Windows IP Configuration"}\n\n\n` +
          `${tr ? "Ethernet bağdaştırıcısı Ethernet:" : "Ethernet adapter Ethernet:"}\n\n` +
          row("Connection-specific DNS Suffix", "Bağlantıya özgü DNS Soneki", "") +
          row("Link-local IPv6 Address", "Bağlantı yerel IPv6 Adresi", IPV6) +
          row("IPv4 Address", "IPv4 Adresi", IPV4) +
          row("Subnet Mask", "Alt Ağ Maskesi", "255.255.255.0") +
          row("Default Gateway", "Varsayılan Ağ Geçidi", "192.168.1.1") +
          `\n${tr ? "Tünel bağdaştırıcısı isatap.{4F2C1E8A-6D3B-4B7A-9C51-2E8D7F0A3B64}:" : "Tunnel adapter isatap.{4F2C1E8A-6D3B-4B7A-9C51-2E8D7F0A3B64}:"}\n\n` +
          row("Media State", "Medya Durumu", tr ? "Medya bağlantısı kesildi" : "Media disconnected") +
          row("Connection-specific DNS Suffix", "Bağlantıya özgü DNS Soneki", "")
        );
      }
      case "systeminfo": {
        const mem = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) * 1024;
        const rows: [string, string, string][] = [
          ["Host Name:", "Ana Bilgisayar Adı:", HOST],
          ["OS Name:", "İşletim Sistemi Adı:", "Microsoft Windows 8.1 Pro"],
          ["OS Version:", "İşletim Sistemi Sürümü:", tr ? "6.3.9600 Yok Derleme 9600" : "6.3.9600 N/A Build 9600"],
          ["OS Manufacturer:", "İşletim Sistemi Üreticisi:", "Microsoft Corporation"],
          ["Registered Owner:", "Kayıtlı Sahibi:", USER],
          ["System Type:", "Sistem Türü:", tr ? "x64 tabanlı PC" : "x64-based PC"],
          [
            "Processor(s):",
            "İşlemciler:",
            `${tr ? "1 İşlemci Yüklü." : "1 Processor(s) Installed."}\n${" ".repeat(27)}[01]: Intel64 Family 6 Model 60 Stepping 3 GenuineIntel ~3401 Mhz`,
          ],
          ["Windows Directory:", "Windows Dizini:", "C:\\Windows"],
          ["System Directory:", "Sistem Dizini:", "C:\\Windows\\system32"],
          ["System Locale:", "Sistem Yerel Ayarı:", tr ? "tr;Türkçe" : "en-us;English (United States)"],
          ["Total Physical Memory:", "Toplam Fiziksel Bellek:", `${num(mem)} MB`],
          ["Logon Server:", "Oturum Açma Sunucusu:", `\\\\${HOST}`],
        ];
        return `\n${rows.map(([en, trText, v]) => `${(tr ? trText : en).padEnd(27)}${v}`).join("\n")}\n`;
      }
      case "tasklist": {
        const head = tr
          ? "Görüntü Adı                    PID Oturum Adı          Oturum#    Bellek Kull."
          : "Image Name                     PID Session Name        Session#    Mem Usage";
        const rows = procs()
          .sort((a, b) => a.pid - b.pid)
          .map((p) => {
            const con = p.user === USER;
            return `${p.exe.slice(0, 25).padEnd(25)} ${String(p.pid).padStart(8)} ${(con ? "Console" : "Services").padEnd(16)} ${String(con ? 1 : 0).padStart(11)} ${`${num(Math.max(4, Math.round(p.mem * 1024)))} K`.padStart(12)}`;
          });
        return `\n${head}\n========================= ======== ================ =========== ============\n${rows.join("\n")}\n`;
      }
      case "taskkill": {
        const im = valueOf("/im");
        const pid = valueOf("/pid");
        if (!im && !pid) return `${tr ? "HATA: Geçersiz sözdizimi." : "ERROR: Invalid syntax."}\n`;
        const force = flags.includes("/f");
        const exe = im && (/\.exe$/i.test(im) ? im : `${im}.exe`).toLowerCase();
        const hits = procs().filter((p) => (exe && p.exe.toLowerCase() === exe) || (pid && p.pid === Number(pid)));
        if (!hits.length)
          return `${tr ? `HATA: "${im ?? pid}" işlemi bulunamadı.` : `ERROR: The process "${im ?? pid}" not found.`}\n`;
        return hits
          .map((p) =>
            endProc(p, closeApp, force)
              ? tr
                ? `BAŞARILI: PID ${p.pid} olan "${p.exe}" işlemi${force ? " sonlandırıldı." : "ne sonlandırma sinyali gönderildi."}`
                : force
                  ? `SUCCESS: The process "${p.exe}" with PID ${p.pid} has been terminated.`
                  : `SUCCESS: Sent termination signal to the process "${p.exe}" with PID ${p.pid}.`
              : tr
                ? `HATA: PID ${p.pid} olan işlem sonlandırılamadı.\nNeden: Erişim engellendi.`
                : `ERROR: The process with PID ${p.pid} could not be terminated.\nReason: Access is denied.`,
          )
          .join("\n")
          .concat("\n");
      }
      case "start": {
        if (!paths.length) {
          wm.launch("cmd", { arg: cwd });
          return "";
        }
        if (!start(paths[0], paths.slice(1).join(" ")))
          void msgBox(id, {
            title: paths[0],
            text: tr
              ? `Windows '${paths[0]}' öğesini bulamıyor. Adı doğru yazdığınızdan emin olun ve yeniden deneyin.`
              : `Windows cannot find '${paths[0]}'. Make sure you typed the name correctly, and then try again.`,
            icon: "error",
            buttons: [tr ? "Tamam" : "OK"],
          });
        return "";
      }
      case "cmd":
        return banner;
      case "exit":
        close();
        return null;
    }
    // Not a built-in: a program on the PATH, or a document opened with its program.
    if (start(word.replace(/^"|"$/g, ""), rest, true)) return "";
    return `'${word}' ${tr ? "iç ya da dış komut, çalıştırılabilir\nprogram ya da toplu iş dosyası olarak tanınmıyor." : "is not recognized as an internal or external command,\noperable program or batch file."}\n`;
  };

  /** Run a line, sending its output to a file when it ends with > or >>. */
  const exec = (raw: string): string | null => {
    const [cmd, target, append] = splitRedirect(raw.trim().replace(/^@/, ""));
    const res = run(cmd);
    if (target === null || res === null) return res;
    if (target.toLowerCase() === "nul") return "";
    const p = resolve(cwd, target);
    try {
      fs.writeText(p, (append ? (fs.read(p) ?? "") : "") + res.replace(/\n/g, "\r\n"));
      return "";
    } catch {
      return `${fs.isDir(p) ? M.denied : M.path}\n`;
    }
  };

  const setInput = (s: string) => {
    setLine(s);
    setCaret(s.length);
  };

  const enter = () => {
    const text = line;
    setInput("");
    if (ask) {
      setAsk(null);
      write(`${ask.q}${text}\n${ask.then(text.trim())}\n`);
      return;
    }
    write(`${prompt}${text}\n`);
    if (!text.trim()) return;
    setHist((h) => (h[h.length - 1] === text ? h : [...h, text].slice(-50)));
    setHi(-1);
    const res = exec(text);
    if (res !== null) write(`${res}\n`);
  };

  const recall = (step: number) => {
    if (!hist.length) return;
    const i = hi < 0 ? (step < 0 ? hist.length - 1 : -1) : Math.min(hist.length - 1, Math.max(0, hi + step));
    if (i < 0) return;
    setHi(i);
    setInput(hist[i]);
  };

  const complete = (back: boolean) => {
    let st = tab;
    if (!st) {
      const quotes = (line.match(/"/g) ?? []).length;
      const at = quotes % 2 ? line.lastIndexOf('"') : line.lastIndexOf(" ") + 1;
      const part = line.slice(at).replace(/"/g, "");
      const cut = part.lastIndexOf("\\") + 1;
      const prefix = part.slice(cut).toLowerCase();
      const list = fs
        .list(resolve(cwd, part.slice(0, cut) || "."))
        .filter((n) => n.name.toLowerCase().startsWith(prefix))
        .map((n) => part.slice(0, cut) + n.name);
      if (!list.length) return;
      st = { head: line.slice(0, at), list, i: back ? 0 : -1 };
    }
    const i = (st.i + (back ? -1 : 1) + st.list.length) % st.list.length;
    const c = st.list[i];
    setTab({ ...st, i });
    setInput(st.head + (/\s/.test(c) ? `"${c}"` : c));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Tab" && e.key !== "Shift") setTab(null);
    if (e.key === "Enter") enter();
    else if (e.key === "Tab") complete(e.shiftKey);
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") recall(e.key === "ArrowUp" ? -1 : 1);
    else if (e.key === "Escape") setInput("");
    else if (e.ctrlKey && e.key.toLowerCase() === "c") {
      write(`${prompt}${line}^C\n`);
      setAsk(null);
      setInput("");
    } else return;
    e.preventDefault();
  };

  // Right-click: copy the marked text, or paste when nothing is marked (QuickEdit).
  const onContext = async (e: React.MouseEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    const text = sel?.toString() ?? "";
    try {
      if (text) {
        await navigator.clipboard.writeText(text);
        sel?.removeAllRanges();
      } else {
        const clip = (await navigator.clipboard.readText()).split(/\r?\n/)[0];
        if (clip) setInput(line + clip);
      }
    } catch {
      /* clipboard permission denied */
    }
    input.current?.focus({ preventScroll: true });
  };

  return (
    <div
      className="cmd"
      style={{ background: PALETTE[parseInt(color[0], 16)], color: PALETTE[parseInt(color[1], 16)] }}
    >
      <div
        ref={screen}
        className="cmd-screen"
        onMouseUp={() => !window.getSelection()?.toString() && input.current?.focus({ preventScroll: true })}
        onContextMenu={(e) => void onContext(e)}
      >
        <pre className="cmd-out">
          {out}
          {prompt}
          {line.slice(0, caret)}
          <span className={`cmd-cursor ${focused ? "on" : ""}`}>{line[caret] ?? " "}</span>
          {line.slice(caret + 1)}
        </pre>
      </div>
      <input
        ref={input}
        className="cmd-input"
        value={line}
        spellCheck={false}
        autoComplete="off"
        aria-label={t(appDef("cmd").title)}
        onChange={(e) => {
          setLine(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={onKey}
      />
    </div>
  );
}
