import { describe, expect, it } from "vitest";
import { EditorHistory, type EditorSnapshot } from "./editorHistory.ts";

function at(text: string, caret = text.length): EditorSnapshot {
  return { text, selection: [caret, caret] };
}

describe("EditorHistory", () => {
  it("undoes to the state before an edit and redoes back", () => {
    const history = new EditorHistory();
    history.record(at(""), null, 0);
    expect(history.undo(at("日本"))).toEqual(at(""));
    expect(history.undo(at(""))).toBeNull();
    expect(history.redo(at(""))).toEqual(at("日本"));
    expect(history.redo(at("日本"))).toBeNull();
  });

  it("merges a burst of typing into one step, but not edits of other kinds or after a pause", () => {
    const history = new EditorHistory();
    history.record(at(""), "insert", 0);
    history.record(at("日"), "insert", 300);
    history.record(at("日本"), "insert", 600);
    history.record(at("日本語"), null, 700);
    history.record(at("日本語\n"), "insert", 800);
    history.record(at("日本語\nあ"), "insert", 2500);
    expect(history.undo(at("日本語\nあい"))).toEqual(at("日本語\nあ"));
    expect(history.undo(at("日本語\nあ"))).toEqual(at("日本語\n"));
    expect(history.undo(at("日本語\n"))).toEqual(at("日本語"));
    expect(history.undo(at("日本語"))).toEqual(at(""));
    expect(history.undo(at(""))).toBeNull();
  });

  it("ignores edits that changed nothing, keeping the caret from just before the real change", () => {
    const history = new EditorHistory();
    history.record(at("日本", 2), null, 0);
    history.record(at("日本", 0), null, 5000);
    expect(history.undo(at("日本"))).toBeNull();
    history.record(at("日本", 1), null, 9000);
    expect(history.undo(at("日本語"))).toEqual(at("日本", 1));
  });

  it("drops the redo states once a new edit is made", () => {
    const history = new EditorHistory();
    history.record(at(""), null, 0);
    expect(history.undo(at("日本"))).toEqual(at(""));
    history.record(at(""), null, 5000);
    expect(history.redo(at("東京"))).toBeNull();
    expect(history.undo(at("東京"))).toEqual(at(""));
  });
});
