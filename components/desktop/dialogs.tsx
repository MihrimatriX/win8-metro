"use client";
/**
 * Owned dialog windows: message boxes and the common Open / Save As dialog.
 * A dialog is a real window (app "dialog") owned by its parent, so the parent can't be used until it closes.
 */
import { useMemo, useState, type ReactNode } from "react";
import { wm } from "@/lib/wm";
import {
  fs,
  join,
  normalize,
  splitPath,
  useFS,
  extname,
  KNOWN,
  HOME,
  typeLabel,
  formatStamp,
  type FNode,
} from "@/lib/fs";
import { sound } from "@/lib/sound";
import { useOS } from "@/lib/os";
import type { ShellIconName } from "@/lib/model";
import { ShellIcon } from "../icons/ShellIcons";
import { Btn, TextBox, useWindow } from "./ui";
import { nodeIcon } from "./shell";

type Spec = { title: string; render: (close: () => void) => ReactNode };
const specs = new Map<string, Spec>();
let n = 0;

/** Open a dialog window owned by `owner` (a window id, or null for a free-standing one). */
export function openDialog(owner: string | null, spec: Spec & { w: number; h: number }): string {
  const token = `dlg${++n}`;
  specs.set(token, spec);
  return wm.launch("dialog", {
    arg: token,
    owner: owner ?? undefined,
    w: spec.w,
    h: spec.h,
    fixed: true,
    title: spec.title,
  });
}

/** The "dialog" app: renders the spec registered for this window. */
export function DialogHost() {
  const { win, close } = useWindow();
  const spec = specs.get(win.arg ?? "");
  if (!spec) return null;
  return (
    <>
      {spec.render(() => {
        specs.delete(win.arg ?? "");
        close();
      })}
    </>
  );
}

export type MsgIcon = "info" | "warning" | "error" | "question";

/** A Windows message box. Resolves with the index of the clicked button (-1 when closed with X). */
export function msgBox(
  owner: string | null,
  opts: { title: string; text: string; icon?: MsgIcon; buttons?: string[] },
): Promise<number> {
  const buttons = opts.buttons ?? ["Tamam"];
  if (opts.icon === "error") sound.critical();
  else sound.ding();
  return new Promise((resolve) => {
    let done = false;
    const lines = opts.text.split("\n").length;
    const id = openDialog(owner, {
      title: opts.title,
      w: Math.min(520, Math.max(340, opts.text.length * 4.2 + 120)),
      h: 150 + Math.max(0, lines - 2) * 18,
      render: (close) => (
        <div className="w8-msgbox">
          <div className="w8-msgbox-body">
            {opts.icon && <ShellIcon name={`msg-${opts.icon}` as ShellIconName} size={32} />}
            <p>{opts.text}</p>
          </div>
          <div className="w8-msgbox-btns">
            {buttons.map((b, i) => (
              <Btn
                key={b}
                primary={i === 0}
                autoFocus={i === 0}
                onClick={() => {
                  done = true;
                  resolve(i);
                  close();
                }}
              >
                {b}
              </Btn>
            ))}
          </div>
        </div>
      ),
    });
    // Closing with the X resolves -1.
    const unsub = wm.subscribe(() => {
      if (!wm.get(id)) {
        unsub();
        if (!done) resolve(-1);
      }
    });
  });
}

export type FileFilter = { label: string; exts: string[] };

/** Open / Save As. Resolves with the chosen path, or null when cancelled. */
export function fileDialog(
  owner: string | null,
  opts: {
    mode: "open" | "save";
    title?: string;
    filters?: FileFilter[];
    name?: string;
    dir?: string;
    lang: "tr" | "en";
  },
): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const tr = opts.lang === "tr";
    const id = openDialog(owner, {
      title: opts.title ?? (opts.mode === "open" ? (tr ? "Aç" : "Open") : tr ? "Farklı Kaydet" : "Save As"),
      w: 640,
      h: 430,
      render: (close) => (
        <FilePicker
          {...opts}
          onDone={(p) => {
            done = true;
            resolve(p);
            close();
          }}
        />
      ),
    });
    const unsub = wm.subscribe(() => {
      if (!wm.get(id)) {
        unsub();
        if (!done) resolve(null);
      }
    });
  });
}

function FilePicker({
  mode,
  filters,
  name,
  dir,
  onDone,
}: {
  mode: "open" | "save";
  filters?: FileFilter[];
  name?: string;
  dir?: string;
  onDone: (p: string | null) => void;
}) {
  useFS();
  const { lang } = useOS();
  const { id } = useWindow();
  const tr = lang === "tr";
  const [cwd, setCwd] = useState(normalize(dir && fs.isDir(dir) ? dir : KNOWN.documents));
  const [file, setFile] = useState(name ?? "");
  const [filter, setFilter] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const f = filters?.[filter];
  const items = fs
    .list(cwd)
    .filter(
      (x) => x.kind === "dir" || x.kind === "drive" || !f || f.exts.includes("*") || f.exts.includes(extname(x.name)),
    );
  const crumbs = splitPath(cwd);

  const places: { label: string; path: string; icon: ShellIconName }[] = useMemo(
    () => [
      { label: tr ? "Masaüstü" : "Desktop", path: KNOWN.desktop, icon: "folder-desktop" },
      { label: tr ? "İndirilenler" : "Downloads", path: KNOWN.downloads, icon: "folder-downloads" },
      { label: tr ? "Belgeler" : "Documents", path: KNOWN.documents, icon: "folder-documents" },
      { label: tr ? "Müzik" : "Music", path: KNOWN.music, icon: "folder-music" },
      { label: tr ? "Resimler" : "Pictures", path: KNOWN.pictures, icon: "folder-pictures" },
      { label: tr ? "Videolar" : "Videos", path: KNOWN.videos, icon: "folder-videos" },
      { label: tr ? "Yerel Disk (C:)" : "Local Disk (C:)", path: "C:\\", icon: "drive-system" },
    ],
    [tr],
  );

  const accept = async (picked?: string) => {
    let nameIn = (picked ?? file).trim();
    if (!nameIn) return;
    const target = /^[a-z]:/i.test(nameIn) ? normalize(nameIn) : join(cwd, nameIn);
    if (fs.isDir(target)) {
      setCwd(target);
      setFile("");
      return;
    }
    if (mode === "open") {
      if (!fs.exists(target)) {
        await msgBox(id, {
          title: tr ? "Aç" : "Open",
          text: `${nameIn}\n${tr ? "Dosya bulunamadı. Dosya adını denetleyip yeniden deneyin." : "File not found. Check the file name and try again."}`,
          icon: "warning",
          buttons: [tr ? "Tamam" : "OK"],
        });
        return;
      }
      onDone(target);
      return;
    }
    // Save: add the filter's extension when the name has none.
    if (!extname(nameIn) && f && f.exts[0] && f.exts[0] !== "*") {
      nameIn = `${nameIn}.${f.exts[0]}`;
    }
    const finalPath = /^[a-z]:/i.test(nameIn) ? normalize(nameIn) : join(cwd, nameIn);
    if (fs.exists(finalPath)) {
      const r = await msgBox(id, {
        title: tr ? "Farklı Kaydetmeyi Onayla" : "Confirm Save As",
        text: tr
          ? `${nameIn} zaten var.\nDeğiştirmek istiyor musunuz?`
          : `${nameIn} already exists.\nDo you want to replace it?`,
        icon: "warning",
        buttons: [tr ? "Evet" : "Yes", tr ? "Hayır" : "No"],
      });
      if (r !== 0) return;
    }
    onDone(finalPath);
  };

  return (
    <div className="w8-filedlg">
      <div className="w8-filedlg-addr">
        <button
          className="w8-navbtn"
          disabled={crumbs.length < 2}
          onClick={() => setCwd(normalize(crumbs.slice(0, -1).join("\\")))}
          aria-label="up"
        >
          ↑
        </button>
        <div className="w8-filedlg-crumbs">
          <ShellIcon name="thispc" size={16} />
          {crumbs.map((c, i) => (
            <button key={i} onClick={() => setCwd(normalize(crumbs.slice(0, i + 1).join("\\")))}>
              {i === 0
                ? fs.label(fs.get(c) ?? { name: c, kind: "drive", created: 0, modified: 0 }, lang)
                : fs.label(
                    fs.get(crumbs.slice(0, i + 1).join("\\")) ?? { name: c, kind: "dir", created: 0, modified: 0 },
                    lang,
                  )}{" "}
              ›
            </button>
          ))}
        </div>
      </div>
      <div className="w8-filedlg-toolbar">
        <button
          onClick={() => {
            const nm = fs.uniqueName(cwd, tr ? "Yeni klasör" : "New folder");
            fs.mkdir(join(cwd, nm));
          }}
        >
          {tr ? "Yeni klasör" : "New folder"}
        </button>
      </div>
      <div className="w8-filedlg-main">
        <nav className="w8-filedlg-nav">
          <div className="w8-filedlg-navh">★ {tr ? "Sık Kullanılanlar" : "Favorites"}</div>
          {places.map((p) => (
            <button
              key={p.path}
              className={normalize(p.path).toLowerCase() === cwd.toLowerCase() ? "on" : ""}
              onClick={() => setCwd(normalize(p.path))}
            >
              <ShellIcon name={p.icon} size={16} /> {p.label}
            </button>
          ))}
          <button onClick={() => setCwd(normalize(HOME))}>
            <ShellIcon name="folder-user" size={16} /> {HOME.split("\\").pop()}
          </button>
        </nav>
        <div className="w8-filedlg-list">
          <div className="w8-filedlg-cols">
            <span>{tr ? "Ad" : "Name"}</span>
            <span>{tr ? "Değiştirme tarihi" : "Date modified"}</span>
            <span>{tr ? "Tür" : "Type"}</span>
          </div>
          {!items.length && (
            <p className="w8-empty">{tr ? "Arama ölçütlerinizle eşleşen öğe yok." : "No items match your search."}</p>
          )}
          {items.map((x: FNode) => {
            const p = join(cwd, x.name);
            const isDir = x.kind === "dir" || x.kind === "drive";
            return (
              <button
                key={x.name}
                className={`w8-filedlg-row ${sel === p ? "on" : ""}`}
                onClick={() => {
                  setSel(p);
                  if (!isDir) setFile(x.name);
                }}
                onDoubleClick={() => {
                  if (isDir) {
                    setCwd(p);
                    setSel(null);
                  } else if (mode === "open") onDone(p);
                  else {
                    setFile(x.name);
                    void accept(x.name);
                  }
                }}
              >
                <span>
                  <ShellIcon name={nodeIcon(x)} size={16} /> {fs.label(x, lang)}
                </span>
                <span>{formatStamp(x.modified, lang)}</span>
                <span>{typeLabel(x, lang)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="w8-filedlg-foot">
        <label>
          {tr ? "Dosya adı:" : "File name:"}
          <TextBox
            value={file}
            onChange={(e) => setFile(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void accept()}
            autoFocus
          />
        </label>
        {filters && (
          <label>
            {mode === "save" ? (tr ? "Kayıt türü:" : "Save as type:") : ""}
            <select className="w8-select" value={filter} onChange={(e) => setFilter(Number(e.target.value))}>
              {filters.map((x, i) => (
                <option key={x.label} value={i}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="w8-filedlg-btns">
          <Btn primary onClick={() => void accept()}>
            {mode === "open" ? (tr ? "Aç" : "Open") : tr ? "Kaydet" : "Save"}
          </Btn>
          <Btn onClick={() => onDone(null)}>{tr ? "İptal" : "Cancel"}</Btn>
        </div>
      </div>
    </div>
  );
}
