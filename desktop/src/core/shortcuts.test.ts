import { it, expect } from "vitest";
import { parseAccelerator, defaultBindings, validateBindings, ShortcutInterpreter, shortcutActions } from "./shortcuts";
it("normalizes modifier aliases and display", () => {
  expect(parseAccelerator("shift+control+alt+v")).toEqual({accelerator:"Ctrl+Alt+Shift+V",display:"Ctrl Alt Shift V"});
  expect(parseAccelerator("CmdOrCtrl+Space").accelerator).toBe("Ctrl+Space");
  expect(parseAccelerator("Alt+F12").accelerator).toBe("Alt+F12");
});
it("rejects invalid keys, conflicts and Windows reserved combinations", () => {
  for (const key of ["Alt+Space","Win+M","Ctrl++A","Ctrl+Ctrl+A","Ctrl+A+B","A","Ctrl","Ctrl+Potato","Alt+F4","Alt+Tab","Ctrl+Alt+Delete"]) expect(() => parseAccelerator(key),key).toThrow();
  expect(() => validateBindings({dictate:parseAccelerator("Ctrl+Alt+M"),meeting:{accelerator:"Alt+Control+M",display:""}})).toThrow(/same shortcut/);
  expect(() => validateBindings(defaultBindings)).not.toThrow(); expect(Object.keys(defaultBindings).sort()).toEqual([...shortcutActions].sort());
});
it("tap toggles recording; hold releases after exactly 350ms", () => {
  const keys = new ShortcutInterpreter();
  expect(keys.handle("dictate","pressed",0,false)).toEqual(["startDictation"]);
  expect(keys.handle("dictate","pressed",10,true)).toEqual([]);
  expect(keys.handle("dictate","released",349,true)).toEqual([]);
  expect(keys.handle("dictate","pressed",500,true)).toEqual(["finishDictation"]);
  expect(keys.handle("dictate","released",1000,false)).toEqual([]);
  expect(keys.handle("dictate","pressed",2000,false)).toEqual(["startDictation"]);
  expect(keys.handle("dictate","released",2350,true)).toEqual(["finishDictation"]);
});
it("push to talk handles release during startup and ignores unrelated releases", () => {
  const keys = new ShortcutInterpreter();
  expect(keys.handle("holdToTalk","released",0,false)).toEqual([]);
  expect(keys.handle("holdToTalk","pressed",0,false)).toEqual(["startDictation"]);
  expect(keys.handle("holdToTalk","released",10,false)).toEqual(["finishDictation"]);
  expect(keys.handle("dictate","pressed",0,false,true)).toEqual([]);
  keys.reset(); expect(keys.handle("dictate","released",1000,false)).toEqual([]);
  for (const action of shortcutActions.slice(2)) {
    expect(keys.handle(action,"pressed",0,false)).toEqual([action]); expect(keys.handle(action,"released",1,false)).toEqual([]);
  }
});
