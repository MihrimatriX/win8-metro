"use client";
/** Right-click menus shared by the desktop and File Explorer. */
import { fs, join, basename, extname, KNOWN, RECYCLE, type FNode } from "@/lib/fs";
import { sound } from "@/lib/sound";
import type { Lang } from "@/lib/types";
import type { View } from "@/lib/os";
import { msgBox } from "./dialogs";
import { showProperties } from "./Properties";
import { shellClipboard } from "./shell";
import type { MenuItem } from "./ui";

type Ctx = {
  lang: Lang;
  owner: string | null;
  open: (v: View) => void;
  openPath: (p: string) => void;
  rename: (p: string) => void;
};

/** Ask, then move to the Recycle Bin (or delete for good from inside the bin). */
export async function confirmDelete(paths: string[], { lang, owner }: { lang: Lang; owner: string | null }) {
  const tr = lang === "tr";
  if (!paths.length) return;
  const inBin = paths[0].toLowerCase().startsWith(RECYCLE.toLowerCase());
  const n = fs.get(paths[0]);
  const name = n ? (n.orig ? basename(n.orig) : fs.label(n, lang)) : "";
  const text = inBin
    ? paths.length > 1
      ? tr
        ? `Bu ${paths.length} öğeyi kalıcı olarak silmek istediğinizden emin misiniz?`
        : `Are you sure you want to permanently delete these ${paths.length} items?`
      : tr
        ? `'${name}' kalıcı olarak silinsin mi?`
        : `Are you sure you want to permanently delete '${name}'?`
    : paths.length > 1
      ? tr
        ? `Bu ${paths.length} öğeyi Geri Dönüşüm Kutusu'na taşımak istediğinizden emin misiniz?`
        : `Are you sure you want to move these ${paths.length} items to the Recycle Bin?`
      : tr
        ? `'${name}' öğesini Geri Dönüşüm Kutusu'na taşımak istediğinizden emin misiniz?`
        : `Are you sure you want to move '${name}' to the Recycle Bin?`;
  const r = await msgBox(owner, {
    title: inBin ? (tr ? "Dosyayı Sil" : "Delete File") : tr ? "Öğeyi Sil" : "Delete Item",
    text,
    icon: "warning",
    buttons: [tr ? "Evet" : "Yes", tr ? "Hayır" : "No"],
  });
  if (r !== 0) return;
  for (const p of paths) {
    try {
      fs.remove(p);
    } catch {
      /* already gone */
    }
  }
  sound.recycle();
}

export function itemMenu(paths: string[], c: Ctx): MenuItem[] {
  const tr = c.lang === "tr";
  const first = paths[0];
  const n: FNode | null = fs.get(first);
  if (!n) return [];
  const inBin = first.toLowerCase().startsWith(RECYCLE.toLowerCase());
  if (inBin) {
    return [
      {
        label: tr ? "Geri yükle" : "Restore",
        bold: true,
        onClick: () => paths.forEach((p) => fs.restore(basename(p))),
      },
      { sep: true },
      { label: tr ? "Kes" : "Cut", disabled: true },
      { sep: true },
      { label: tr ? "Sil" : "Delete", onClick: () => void confirmDelete(paths, c) },
      { sep: true },
      { label: tr ? "Özellikler" : "Properties", onClick: () => showProperties(c.owner, first, c.lang) },
    ];
  }
  const isDir = n.kind === "dir" || n.kind === "drive";
  const openWith = (id: "notepad" | "paint" | "wordpad" | "ie") => () => c.open({ kind: "app", app: id, param: first });
  const ext = extname(n.name);
  return [
    { label: tr ? "Aç" : "Open", bold: true, onClick: () => c.openPath(first) },
    ...(isDir
      ? [
          {
            label: tr ? "Yeni pencerede aç" : "Open in new window",
            onClick: () => c.open({ kind: "app", app: "explorer", param: first }),
          },
        ]
      : []),
    ...(n.kind === "txt" || n.kind === "img"
      ? [{ label: tr ? "Düzenle" : "Edit", onClick: n.kind === "img" ? openWith("paint") : openWith("notepad") }]
      : []),
    ...(!isDir && n.kind !== "exe" && n.kind !== "lnk"
      ? [
          {
            label: tr ? "Birlikte aç" : "Open with",
            sub: [
              { label: tr ? "Not Defteri" : "Notepad", onClick: openWith("notepad") },
              { label: "WordPad", onClick: openWith("wordpad") },
              { label: "Paint", onClick: openWith("paint"), disabled: n.kind !== "img" },
              {
                label: "Internet Explorer",
                onClick: openWith("ie"),
                disabled: !["html", "htm", "txt", "url"].includes(ext) && n.kind !== "url",
              },
            ] as MenuItem[],
          },
        ]
      : []),
    ...(n.kind === "img"
      ? [
          {
            label: tr ? "Masaüstü arka planı olarak ayarla" : "Set as desktop background",
            onClick: () => window.dispatchEvent(new CustomEvent("w8:wallpaper", { detail: first })),
          },
        ]
      : []),
    { sep: true },
    {
      label: tr ? "Gönder" : "Send to",
      sub: [
        {
          label: tr ? "Masaüstü (kısayol oluştur)" : "Desktop (create shortcut)",
          onClick: () => makeShortcut(first, KNOWN.desktop, c.lang),
        },
        { label: tr ? "Belgeler" : "Documents", onClick: () => fs.copy(first, KNOWN.documents) },
      ],
    },
    { sep: true },
    { label: tr ? "Kes" : "Cut", onClick: () => shellClipboard.set(paths, true) },
    { label: tr ? "Kopyala" : "Copy", onClick: () => shellClipboard.set(paths, false) },
    { sep: true },
    {
      label: tr ? "Kısayol oluştur" : "Create shortcut",
      onClick: () => makeShortcut(first, join(first, ".."), c.lang),
    },
    { label: tr ? "Sil" : "Delete", onClick: () => void confirmDelete(paths, c) },
    { label: tr ? "Yeniden adlandır" : "Rename", onClick: () => c.rename(first), disabled: paths.length > 1 },
    { sep: true },
    { label: tr ? "Özellikler" : "Properties", onClick: () => showProperties(c.owner, first, c.lang) },
  ];
}

export function makeShortcut(target: string, dir: string, lang: Lang) {
  const n = fs.get(target);
  if (!n) return;
  const name = fs.uniqueName(dir, `${fs.label(n, lang)}${lang === "tr" ? " - Kısayol" : " - Shortcut"}.lnk`);
  fs.write(join(dir, name), { target, kind: "lnk", size: 1_024 });
}

/** "New ▸" submenu for a folder background. Calls `created` with the new path so the caller can start renaming. */
export function newMenu(dir: string, lang: Lang, created: (p: string) => void): MenuItem {
  const tr = lang === "tr";
  const make = (base: string, patch: Partial<FNode> | "dir") => () => {
    const name = fs.uniqueName(dir, base);
    const p = join(dir, name);
    if (patch === "dir") fs.mkdir(p);
    else fs.write(p, patch);
    created(p);
  };
  return {
    label: tr ? "Yeni" : "New",
    sub: [
      { label: tr ? "Klasör" : "Folder", onClick: make(tr ? "Yeni klasör" : "New folder", "dir") },
      {
        label: tr ? "Kısayol" : "Shortcut",
        onClick: make(tr ? "Yeni kısayol.lnk" : "New shortcut.lnk", { kind: "lnk", target: "app:ie", size: 1024 }),
      },
      { sep: true },
      {
        label: tr ? "Bit Eşlem Resmi" : "Bitmap image",
        onClick: make(tr ? "Yeni Bit Eşlem Resmi.bmp" : "New Bitmap Image.bmp", { kind: "img" }),
      },
      {
        label: tr ? "Zengin Metin Belgesi" : "Rich Text Document",
        onClick: make(tr ? "Yeni Zengin Metin Belgesi.rtf" : "New Rich Text Document.rtf", { kind: "rtf", text: "" }),
      },
      {
        label: tr ? "Metin Belgesi" : "Text Document",
        onClick: make(tr ? "Yeni Metin Belgesi.txt" : "New Text Document.txt", { kind: "txt", text: "" }),
      },
    ],
  };
}
