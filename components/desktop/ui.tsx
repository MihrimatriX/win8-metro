"use client";
/**
 * Desktop UI kit in the Windows 8 style: menu bars, context menus, the ribbon, buttons and text boxes.
 * Every desktop program builds on these so they look and behave alike. Styles live in desktop.css (.w8-*).
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { wm, type Win } from "@/lib/wm";

// ---------- window context ----------

export type WinApi = {
  id: string;
  win: Win;
  focused: boolean;
  setTitle: (title: string) => void;
  close: () => void;
  minimize: () => void;
};
export const WinCtx = createContext<WinApi | null>(null);

/** The window an app component is rendered in. */
export function useWindow(): WinApi {
  const c = useContext(WinCtx);
  if (!c) throw new Error("useWindow outside a desktop window");
  return c;
}

/**
 * Ask before the window closes (X button, taskbar, Task Manager). Return true (or resolve true) to let it close.
 * The latest `fn` is always used, so it can read current state.
 */
export function useCloseGuard(fn: () => boolean | Promise<boolean>, enabled = true) {
  const { id } = useWindow();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    wm.guard(id, () => ref.current());
    return () => wm.guard(id, null);
  }, [id, enabled]);
}

/**
 * Keyboard shortcuts for the focused window only (Ctrl+S in Notepad shouldn't save Paint too).
 * `keys` maps "ctrl+s", "f5", "delete", "ctrl+shift+n"… to handlers; return false to let the event through.
 */
export function useWinKeys(keys: Record<string, (e: KeyboardEvent) => void | boolean>, enabled = true) {
  const { focused } = useWindow();
  const ref = useRef(keys);
  ref.current = keys;
  useEffect(() => {
    if (!focused || !enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const combo = [e.ctrlKey || e.metaKey ? "ctrl" : "", e.altKey ? "alt" : "", e.shiftKey ? "shift" : "", e.key.toLowerCase()].filter(Boolean).join("+");
      const fn = ref.current[combo];
      if (fn && fn(e) !== false) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [focused, enabled]);
}

// ---------- menus ----------

export type MenuItem =
  | { sep: true }
  | {
      label: string;
      onClick?: () => void;
      shortcut?: string;
      disabled?: boolean;
      checked?: boolean;
      /** Radio-style bullet instead of a check mark. */
      radio?: boolean;
      bold?: boolean;
      icon?: ReactNode;
      sub?: MenuItem[];
      sep?: false;
    };

/** A dropdown/context menu list. Hovering an item with `sub` opens its submenu to the side. */
export function MenuList({ items, onDone, className, style }: { items: MenuItem[]; onDone: () => void; className?: string; style?: React.CSSProperties }) {
  const [sub, setSub] = useState<number | null>(null);
  const timer = useRef(0);
  return (
    <div className={`w8-menu ${className ?? ""}`} style={style} onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()}>
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="w8-menu-sep" />
        ) : (
          <div
            key={i}
            className={`w8-menu-item ${it.disabled ? "disabled" : ""} ${sub === i ? "open" : ""} ${it.bold ? "bold" : ""}`}
            onPointerEnter={() => {
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => setSub(it.sub ? i : null), it.sub ? 120 : 200);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (it.disabled) return;
              if (it.sub) return setSub(i);
              onDone();
              it.onClick?.();
            }}
          >
            <span className="w8-menu-check">{it.checked ? (it.radio ? "●" : "✓") : it.icon ?? null}</span>
            <span className="w8-menu-label">{it.label}</span>
            <span className="w8-menu-key">{it.shortcut ?? (it.sub ? "›" : "")}</span>
            {it.sub && sub === i && <MenuList items={it.sub} onDone={onDone} className="w8-submenu" />}
          </div>
        ),
      )}
    </div>
  );
}

/** A context menu at a screen position, kept on screen, closed by clicking elsewhere or Esc. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(0, Math.min(x, window.innerWidth - r.width - 2)), y: Math.max(0, y + r.height > window.innerHeight ? y - r.height : y) });
  }, [x, y]);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      onClose();
    };
    const t = window.setTimeout(() => {
      window.addEventListener("pointerdown", close);
      window.addEventListener("keydown", close);
      window.addEventListener("blur", close);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="w8-ctx-layer" style={{ left: pos.x, top: pos.y }}>
      <MenuList items={items} onDone={onClose} />
    </div>,
    document.body,
  );
}

/** Classic menu bar (Notepad, Calculator, Minesweeper). Click a title to open; hover moves between open menus. */
export function MenuBar({ menus }: { menus: { label: string; items: MenuItem[] }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const close = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="w8-menubar" ref={bar}>
      {menus.map((m, i) => (
        <div key={m.label} className={`w8-menubar-item ${open === i ? "open" : ""}`}>
          <button onPointerDown={(e) => (e.stopPropagation(), setOpen(open === i ? null : i))} onPointerEnter={() => open !== null && setOpen(i)}>
            {m.label}
          </button>
          {open === i && <MenuList items={m.items} onDone={() => setOpen(null)} className="w8-dropdown" />}
        </div>
      ))}
    </div>
  );
}

// ---------- ribbon ----------

export type RibbonItem = {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  big?: boolean;
  /** Dropdown under the button. */
  menu?: MenuItem[];
  title?: string;
};
export type RibbonGroup = { label: string; items: (RibbonItem | ReactNode)[] };
export type RibbonTab = { id: string; label: string; groups: RibbonGroup[] };

function isItem(x: RibbonItem | ReactNode): x is RibbonItem {
  return !!x && typeof x === "object" && "label" in (x as object) && "icon" in (x as object);
}

function RibbonButton({ it }: { it: RibbonItem }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        className={`w8-rb ${it.big ? "big" : "small"} ${it.active ? "active" : ""}`}
        disabled={it.disabled}
        title={it.title ?? it.label}
        onClick={(e) => {
          if (it.menu) {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom });
          } else it.onClick?.();
        }}
      >
        <span className="w8-rb-icon">{it.icon}</span>
        <span className="w8-rb-label">
          {it.label}
          {it.menu ? " ▾" : ""}
        </span>
      </button>
      {menu && it.menu && <ContextMenu x={menu.x} y={menu.y} items={it.menu} onClose={() => setMenu(null)} />}
    </>
  );
}

/**
 * The Windows 8 ribbon: a blue File tab, tabs, and groups of big and small buttons.
 * `fileMenu` opens the backstage-style dropdown; `collapsed` hides the groups until a tab is clicked.
 */
export function Ribbon({ tabs, fileLabel, fileMenu, fileColor = "#1979ca", initial, right }: { tabs: RibbonTab[]; fileLabel: string; fileMenu?: MenuItem[]; fileColor?: string; initial?: string; right?: ReactNode }) {
  const [tab, setTab] = useState(initial ?? tabs[0]?.id);
  const [collapsed, setCollapsed] = useState(false);
  const [file, setFile] = useState<{ x: number; y: number } | null>(null);
  const cur = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <div className={`w8-ribbon ${collapsed ? "collapsed" : ""}`}>
      <div className="w8-ribbon-tabs">
        <button
          className="w8-ribbon-file"
          style={{ background: fileColor }}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setFile({ x: r.left, y: r.bottom });
          }}
        >
          {fileLabel}
        </button>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`w8-ribbon-tab ${t.id === cur?.id && !collapsed ? "on" : ""}`}
            onClick={() => {
              setTab(t.id);
              if (collapsed) setCollapsed(false);
            }}
            onDoubleClick={() => setCollapsed((c) => !c)}
          >
            {t.label}
          </button>
        ))}
        <span className="w8-ribbon-spacer" />
        {right}
        <button className="w8-ribbon-toggle" onClick={() => setCollapsed((c) => !c)} title={collapsed ? "▾" : "▴"}>
          {collapsed ? "⌄" : "⌃"}
        </button>
      </div>
      {!collapsed && cur && (
        <div className="w8-ribbon-body">
          {cur.groups.map((g) => (
            <div key={g.label} className="w8-ribbon-group">
              <div className="w8-ribbon-items">{g.items.map((it, i) => (isItem(it) ? <RibbonButton key={it.label} it={it} /> : <div key={i}>{it}</div>))}</div>
              <div className="w8-ribbon-glabel">{g.label}</div>
            </div>
          ))}
        </div>
      )}
      {file && fileMenu && <ContextMenu x={file.x} y={file.y} items={fileMenu} onClose={() => setFile(null)} />}
    </div>
  );
}

// ---------- controls ----------

export function Btn({ children, primary, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button className={`w8-btn ${primary ? "primary" : ""} ${className ?? ""}`} {...rest}>
      {children}
    </button>
  );
}

export function TextBox(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w8-input ${props.className ?? ""}`} spellCheck={false} />;
}

/** A status bar strip at the bottom of a window. */
export function StatusBar({ children }: { children: ReactNode }) {
  return <div className="w8-status">{children}</div>;
}
