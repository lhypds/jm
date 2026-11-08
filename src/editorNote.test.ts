// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { caretOffset, caretPosition, caretStops } from "./editorCaret.ts";
import { insertEditorLineBreak, refreshEditorTail } from "./editorInput.ts";
import {
  deleteEditorBreakAroundNote,
  editorNoteAtCaret,
  editorNoteOffset,
  insertEditorBreakBelowNote,
  placeEditorNote,
  startLineBelowNote,
} from "./editorNote.ts";
import { editorText } from "./editorText.ts";

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

function note() {
  const element = document.createElement("div");
  element.setAttribute("data-editor-note", "");
  element.contentEditable = "false";
  element.textContent = "The translation";
  return element;
}

/** An editor from a template where [note] marks the note and | the caret. */
function editor(template: string) {
  const element = document.createElement("main");
  element.contentEditable = "true";
  document.body.append(element);
  let caret: [Node, number] | null = null;
  for (const part of template.split(/(\[note\])/)) {
    if (part === "[note]") {
      element.append(note());
      continue;
    }
    const caretAt = part.indexOf("|");
    const text = document.createTextNode(part.replace("|", ""));
    if (text.length) element.append(text);
    if (caretAt !== -1) caret = text.length ? [text, caretAt] : [element, element.childNodes.length];
  }
  if (editorText(element).endsWith("\n")) {
    const tail = document.createElement("br");
    tail.setAttribute("data-editor-tail", "");
    element.append(tail);
  }
  if (caret) {
    const range = document.createRange();
    range.setStart(...caret);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }
  return element;
}

/** The editor's DOM as a template, with [note] for the note, [tail] for the placeholder and | at the caret. */
function layout(element: HTMLElement) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  let text = "";
  element.childNodes.forEach((child, index) => {
    if (range?.startContainer === element && range.startOffset === index) text += "|";
    if (child instanceof Text) {
      const data = child.data;
      text += range?.startContainer === child ? data.slice(0, range.startOffset) + "|" + data.slice(range.startOffset) : data;
    } else if (child instanceof HTMLElement && child.hasAttribute("data-editor-note")) text += "[note]";
    else if (child instanceof HTMLElement && child.hasAttribute("data-editor-tail")) text += "[tail]";
    else text += `<${child.nodeName.toLowerCase()}>`;
  });
  if (range?.startContainer === element && range.startOffset === element.childNodes.length) text += "|";
  return text;
}

describe("a note in the text", () => {
  it("adds nothing to the source text, its stops or its offsets", () => {
    const element = editor("日本語\n[note]東京");
    expect(editorText(element)).toBe("日本語\n東京");
    expect(caretStops(element)).toHaveLength(6);
    expect(editorNoteOffset(element, element.querySelector("[data-editor-note]")!)).toBe(4);
    expect(caretOffset(element, element.lastChild!, 2)).toBe(6);
  });

  it("maps the offset at a line's start to the point below the note, but not before a break", () => {
    const below = editor("日本語\n[note]東京");
    expect(caretPosition(below, 4)).toEqual([below, 2]);
    expect(caretPosition(below, 3)).toEqual([below.firstChild, 3]);
    const unbroken = editor("日本語[note]");
    expect(caretPosition(unbroken, 3)).toEqual([unbroken.firstChild, 3]);
  });
});

describe("placeEditorNote", () => {
  it("places the note after the break of the line holding the offset", () => {
    const element = editor("日本語\n東京\n大阪");
    const fresh = note();
    placeEditorNote(element, fresh, 1);
    expect(layout(element)).toBe("日本語\n[note]東京\n大阪");
    placeEditorNote(element, fresh, 6);
    expect(layout(element)).toBe("日本語\n東京\n[note]大阪");
    // An offset at a line's start keeps the note above that line.
    placeEditorNote(element, fresh, 4);
    expect(layout(element)).toBe("日本語\n[note]東京\n大阪");
    expect(editorText(element)).toBe("日本語\n東京\n大阪");
  });

  it("places the note at the end of unbroken text, before the tail of broken text, and outside ruby", () => {
    const plain = editor("日本語");
    placeEditorNote(plain, note(), 1);
    expect(layout(plain)).toBe("日本語[note]");
    const broken = editor("日本語\n");
    placeEditorNote(broken, note(), 1);
    expect(layout(broken)).toBe("日本語\n[note][tail]");
    const annotated = editor("");
    annotated.innerHTML = "<ruby>日本<rt>にほん</rt></ruby>\n<ruby>東京<rt>とうきょう</rt></ruby>";
    placeEditorNote(annotated, note(), 0);
    expect(annotated.childNodes[1].textContent).toBe("\n");
    expect(annotated.childNodes[2]).toHaveProperty("tagName", "DIV");
    expect(editorText(annotated)).toBe("日本\n東京");
  });
});

describe("several notes below one line", () => {
  it("joins a new note after the existing ones, and keeps their order when placed again", () => {
    const element = editor("日本語\n[note]東京");
    const first = element.querySelector<HTMLElement>("[data-editor-note]")!;
    first.id = "first";
    const second = note();
    second.id = "second";
    placeEditorNote(element, second, 1);
    expect(layout(element)).toBe("日本語\n[note][note]東京");
    expect(element.childNodes[1]).toBe(first);
    expect(element.childNodes[2]).toBe(second);
    placeEditorNote(element, first, 4);
    placeEditorNote(element, second, 4);
    expect(element.childNodes[1]).toBe(first);
    expect(element.childNodes[2]).toBe(second);
  });

  it("counts only the text when placing a note past another, never the words inside it", () => {
    const element = editor("日本語\n[note]東京");
    placeEditorNote(element, note(), 6);
    expect(layout(element)).toBe("日本語\n[note]東京[note]");
    expect(element.querySelector("[data-editor-note] [data-editor-note]")).toBeNull();
    expect(editorNoteOffset(element, element.querySelectorAll<HTMLElement>("[data-editor-note]")[1])).toBe(6);
  });

  it("puts the caret, Enter and Backspace below the whole run", () => {
    const element = editor("日本語|\n[note][note]東京");
    expect(caretPosition(element, 4)).toEqual([element, 3]);
    expect(insertEditorLineBreak(element)).toBe(true);
    expect(layout(element)).toBe("日本語\n[note][note]|\n東京");
    const [first, second] = element.querySelectorAll<HTMLElement>("[data-editor-note]");
    expect(deleteEditorBreakAroundNote(first)).toBe(true);
    expect(layout(element)).toBe("日本語\n[note][note]|東京");
    const ending = editor("日本語[note][note]");
    expect(startLineBelowNote(ending.querySelector("[data-editor-note]")!)).toBe(true);
    expect(layout(ending)).toBe("日本語\n[note][note]|");
    expect(second).toBeDefined();
  });
});

describe("Enter above a note", () => {
  it("starts the next line below the note when the line already breaks", () => {
    const element = editor("日本語|\n[note]東京");
    expect(insertEditorLineBreak(element)).toBe(true);
    expect(layout(element)).toBe("日本語\n[note]|\n東京");
    expect(editorText(element)).toBe("日本語\n\n東京");
  });

  it("breaks the line before the note when the note ends the text, keeping the tail last", () => {
    const element = editor("日本語|[note]");
    expect(insertEditorLineBreak(element)).toBe(true);
    expect(layout(element)).toBe("日本語\n[note]|[tail]");
    expect(editorText(element)).toBe("日本語\n");
  });

  it("breaks normally elsewhere", () => {
    const element = editor("日本語\n[note]東|京");
    expect(insertEditorBreakBelowNote(element, element.querySelector("[data-editor-note]")!)).toBe(false);
    expect(insertEditorLineBreak(element)).toBe(true);
    expect(editorText(element)).toBe("日本語\n東\n京");
    const above = editor("日本|語\n[note]");
    expect(insertEditorBreakBelowNote(above, above.querySelector("[data-editor-note]")!)).toBe(false);
  });
});

describe("a click below a note", () => {
  it("breaks the line above a note that ends the text, and uses an empty line already there", () => {
    const unbroken = editor("日本語[note]");
    expect(startLineBelowNote(unbroken.querySelector("[data-editor-note]")!)).toBe(true);
    refreshEditorTail(unbroken);
    expect(layout(unbroken)).toBe("日本語\n[note]|[tail]");
    const broken = editor("日本語\n[note]");
    expect(startLineBelowNote(broken.querySelector("[data-editor-note]")!)).toBe(true);
    refreshEditorTail(broken);
    expect(layout(broken)).toBe("日本語\n[note]|[tail]");
  });

  it("leaves text that follows the note to the browser", () => {
    const element = editor("日本語\n[note]東京");
    expect(startLineBelowNote(element.querySelector("[data-editor-note]")!)).toBe(false);
    expect(editorText(element)).toBe("日本語\n東京");
  });
});

describe("deleting at a note", () => {
  it("finds the note only when the caret touches it on the given side", () => {
    const after = editor("日本語\n[note]|東京");
    expect(editorNoteAtCaret(after, "backward")).not.toBeNull();
    expect(editorNoteAtCaret(after, "forward")).toBeNull();
    const before = editor("日本語\n|[note]東京");
    expect(editorNoteAtCaret(before, "forward")).not.toBeNull();
    expect(editorNoteAtCaret(before, "backward")).toBeNull();
    const away = editor("日本語|\n[note]東京");
    expect(editorNoteAtCaret(away, "forward")).toBeNull();
  });

  it("removes the empty line below the note, undoing Enter", () => {
    const below = editor("日本語\n[note]|\n東京");
    expect(deleteEditorBreakAroundNote(below.querySelector("[data-editor-note]")!)).toBe(true);
    expect(layout(below)).toBe("日本語\n[note]|東京");
    const last = editor("日本語\n[note]|");
    expect(deleteEditorBreakAroundNote(last.querySelector("[data-editor-note]")!)).toBe(true);
    refreshEditorTail(last);
    expect(layout(last)).toBe("日本語|[note]");
  });

  it("leaves a line that follows the note directly, so the note itself goes", () => {
    const element = editor("日本語\n[note]|東京");
    expect(deleteEditorBreakAroundNote(element.querySelector("[data-editor-note]")!)).toBe(false);
    expect(editorText(element)).toBe("日本語\n東京");
  });
});
