"use client";
/**
 * About Windows (winver.exe) — the Windows 8.1 "ShellAbout" box: the blue logo banner, version and copyright,
 * who the copy is licensed to, and an OK button. Programs open it with their own title ("Not Defteri Hakkında")
 * by passing their app id as the window argument.
 */
import { useEffect } from "react";
import { useOS } from "@/lib/os";
import { profile } from "@/content/portfolio";
import { WinLogo } from "../../Icons";
import { Btn, useWindow, useWinKeys } from "../ui";
import "./winver.css";

/** Window titles when another program shows this box (Help → About). */
const ABOUT_TITLES: Record<string, { tr: string; en: string }> = {
  notepad: { tr: "Not Defteri Hakkında", en: "About Notepad" },
  wordpad: { tr: "WordPad Hakkında", en: "About WordPad" },
  paint: { tr: "Paint Hakkında", en: "About Paint" },
  calc: { tr: "Hesap Makinesi Hakkında", en: "About Calculator" },
};

const LICENSE_URL = "https://www.microsoft.com/useterms";

export default function WinverApp() {
  const { win, setTitle, close } = useWindow();
  const { lang, openApp } = useOS();
  const tr = lang === "tr";

  useEffect(() => {
    const t = ABOUT_TITLES[win.arg ?? ""];
    setTitle(t ? t[lang] : tr ? "Windows Hakkında" : "About Windows");
  }, [win.arg, lang, tr, setTitle]);

  useWinKeys({ enter: () => close(), escape: () => close() });

  return (
    <div className="wv">
      <div className="wv-banner" aria-label="Windows 8.1">
        <WinLogo size={50} color="#00adef" className="wv-logo" />
        <span className="wv-word">Windows</span>
        <span className="wv-ver">8.1</span>
      </div>
      <div className="wv-rule" />
      <div className="wv-text">
        <p>
          Microsoft Windows
          <br />
          {tr ? "Sürüm 6.3 (Derleme 9600)" : "Version 6.3 (Build 9600)"}
          <br />
          {tr ? "© 2013 Microsoft Corporation. Tüm hakları saklıdır." : "© 2013 Microsoft Corporation. All rights reserved."}
        </p>
        <p>
          {tr
            ? "Windows 8.1 Pro işletim sistemi ve kullanıcı arabirimi, Amerika Birleşik Devletleri'nde ve diğer ülkelerde/bölgelerde ticari marka ve yasalarca korunan diğer fikri mülkiyet hakları ile korunmaktadır."
            : "The Windows 8.1 Pro operating system and its user interface are protected by trademark and other pending or existing intellectual property rights in the United States and other countries/regions."}
        </p>
        <p className="wv-license">
          {tr ? "Bu ürün " : "This product is licensed under the "}
          <button className="wv-link" onClick={() => openApp("ie", LICENSE_URL)}>
            {tr ? "Microsoft Yazılım Lisans Koşulları" : "Microsoft Software License Terms"}
          </button>
          {tr ? " çerçevesinde şu kişiye lisanslanmıştır:" : " to:"}
        </p>
        <p className="wv-owner">{profile.name}</p>
      </div>
      <div className="wv-btns">
        <Btn primary autoFocus onClick={() => close()}>
          {tr ? "Tamam" : "OK"}
        </Btn>
      </div>
    </div>
  );
}
