"use client";
/** Desktop program components by app id. Each one renders inside a Window and reads it with useWindow(). */
import type { ComponentType } from "react";
import type { WinApp } from "@/lib/wm";
import { DialogHost } from "./dialogs";
import ExplorerApp from "./apps/Explorer";
import IEApp from "./apps/IE";
import NotepadApp from "./apps/Notepad";
import WordPadApp from "./apps/WordPad";
import PaintApp from "./apps/Paint";
import CalcApp from "./apps/Calc";
import CmdApp from "./apps/Cmd";
import TaskMgrApp from "./apps/TaskMgr";
import ControlApp from "./apps/Control";
import MinesweeperApp from "./apps/Minesweeper";
import RunApp from "./apps/Run";
import WinverApp from "./apps/Winver";

export const PROGRAMS: Record<WinApp, ComponentType> = {
  explorer: ExplorerApp,
  ie: IEApp,
  notepad: NotepadApp,
  wordpad: WordPadApp,
  paint: PaintApp,
  calc: CalcApp,
  cmd: CmdApp,
  taskmgr: TaskMgrApp,
  control: ControlApp,
  minesweeper: MinesweeperApp,
  run: RunApp,
  winver: WinverApp,
  dialog: DialogHost,
};
