"use client";
/** The file / folder Properties sheet (General tab). */
import { fs, dirname, formatSize, formatStamp, typeLabel, useFS } from "@/lib/fs";
import type { Lang } from "@/lib/types";
import { ShellIcon } from "../icons/ShellIcons";
import { openDialog } from "./dialogs";
import { nodeIcon } from "./shell";
import { Btn } from "./ui";

function Sheet({ path, lang, close }: { path: string; lang: Lang; close: () => void }) {
  useFS();
  const n = fs.get(path);
  const tr = lang === "tr";
  if (!n) return null;
  const isDir = n.kind === "dir" || n.kind === "drive";
  const count = (x: typeof n): [number, number] => (x.children ?? []).reduce<[number, number]>((acc, c) => {
    if (c.children) {
      const [f, d] = count(c);
      return [acc[0] + f, acc[1] + d + 1];
    }
    return [acc[0] + 1, acc[1]];
  }, [0, 0]);
  const [files, dirs] = isDir ? count(n) : [0, 0];
  const bytes = fs.size(n);
  const rows: [string, string][] = [
    [tr ? "Dosya türü:" : "Type of file:", typeLabel(n, lang)],
    [tr ? "Konum:" : "Location:", dirname(path)],
    [tr ? "Boyut:" : "Size:", `${formatSize(bytes, lang)} (${bytes.toLocaleString(tr ? "tr-TR" : "en-US")} ${tr ? "bayt" : "bytes"})`],
    ...(isDir ? ([[tr ? "İçerik:" : "Contains:", tr ? `${files} Dosya, ${dirs} Klasör` : `${files} Files, ${dirs} Folders`]] as [string, string][]) : []),
    [tr ? "Oluşturulma:" : "Created:", formatStamp(n.created, lang)],
    [tr ? "Değiştirilme:" : "Modified:", formatStamp(n.modified, lang)],
  ];
  return (
    <div className="w8-props">
      <div className="w8-props-tabs">
        <span className="on">{tr ? "Genel" : "General"}</span>
        <span>{tr ? "Güvenlik" : "Security"}</span>
        <span>{tr ? "Ayrıntılar" : "Details"}</span>
        <span>{tr ? "Önceki Sürümler" : "Previous Versions"}</span>
      </div>
      <div className="w8-props-body">
        <div className="w8-props-name">
          <ShellIcon name={nodeIcon(n, path)} size={32} />
          <input className="w8-input" readOnly value={fs.label(n, lang)} />
        </div>
        <hr />
        {rows.map(([k, v]) => (
          <div key={k} className="w8-props-row">
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
        <hr />
        <div className="w8-props-row">
          <span>{tr ? "Öznitelikler:" : "Attributes:"}</span>
          <span>
            <label>
              <input type="checkbox" readOnly checked={!!n.system} /> {tr ? "Salt okunur" : "Read-only"}
            </label>{" "}
            <label>
              <input type="checkbox" readOnly checked={!!n.hidden} /> {tr ? "Gizli" : "Hidden"}
            </label>
          </span>
        </div>
      </div>
      <div className="w8-props-btns">
        <Btn primary onClick={close}>
          {tr ? "Tamam" : "OK"}
        </Btn>
        <Btn onClick={close}>{tr ? "İptal" : "Cancel"}</Btn>
        <Btn disabled>{tr ? "Uygula" : "Apply"}</Btn>
      </div>
    </div>
  );
}

export function showProperties(owner: string | null, path: string, lang: Lang) {
  const n = fs.get(path);
  if (!n) return;
  openDialog(owner, {
    title: `${fs.label(n, lang)} ${lang === "tr" ? "Özellikleri" : "Properties"}`,
    w: 380,
    h: 470,
    render: (close) => <Sheet path={path} lang={lang} close={close} />,
  });
}
