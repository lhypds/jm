// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { adjacentStops } from "./editorCaret.ts";
import {
  deleteEditorEmptyLastLine,
  deleteEditorRubyCharacter,
  insertEditorLineBreak,
  insertEditorText,
  removeEditorLinks,
} from "./editorInput.ts";
import { editorText } from "./editorText.ts";

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

function editorWithCaret(text: string) {
  const editor = document.createElement("main");
  editor.contentEditable = "true";
  editor.textContent = text;
  document.body.append(editor);
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  window.getSelection()?.addRange(range);
  return editor;
}

describe("insertEditorLineBreak", () => {
  it.each(["", "日本語", "日本語\n"])("supports repeated breaks after %j", (text) => {
    const editor = editorWithCaret(text);
    for (let count = 1; count <= 5; count++) {
      expect(insertEditorLineBreak(editor)).toBe(true);
      expect(editorText(editor)).toBe(text + "\n".repeat(count));
      expect(editor.querySelectorAll("[data-editor-tail]")).toHaveLength(1);
      expect(editor.contains(window.getSelection()!.anchorNode)).toBe(true);
    }
  });

  it("replaces selected text with exactly one break", () => {
    const editor = editorWithCaret("日本語東京");
    const range = document.createRange();
    range.setStart(editor.firstChild!, 3);
    range.setEnd(editor.firstChild!, 5);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    insertEditorLineBreak(editor);
    expect(editorText(editor)).toBe("日本語\n");
  });
});

describe("insertEditorText", () => {
  it("preserves pasted blank lines and normalizes clipboard line endings", () => {
    const editor = editorWithCaret("日本語");
    expect(insertEditorText(editor, "\r\n\r\n東京\r\n")).toBe(true);
    expect(editorText(editor)).toBe("日本語\n\n東京\n");
    expect(editor.querySelectorAll("[data-editor-tail]")).toHaveLength(1);
  });

  it("inserts markup literally, without creating styled elements", () => {
    const editor = editorWithCaret("");
    insertEditorText(editor, '<span style="font-size: 96px">日本語</span>');
    expect(editor.querySelector("span")).toBeNull();
    expect(editorText(editor)).toBe('<span style="font-size: 96px">日本語</span>');
  });

  it("replaces selected text and leaves the caret after the pasted content", () => {
    const editor = editorWithCaret("東京");
    const range = document.createRange();
    range.selectNodeContents(editor);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    insertEditorText(editor, "日本語");
    expect(editorText(editor)).toBe("日本語");
    const selection = window.getSelection()!;
    expect(selection.isCollapsed).toBe(true);
    const before = document.createRange();
    before.selectNodeContents(editor);
    before.setEnd(selection.anchorNode!, selection.anchorOffset);
    expect(editorText(before.cloneContents())).toBe("日本語");
  });
});

describe("removeEditorLinks", () => {
  it("removes hyperlinks and imported colors without losing their text or blank lines", () => {
    const editor = editorWithCaret("");
    editor.innerHTML =
      '<a href="https://example.com" style="color:blue"><span style="font-size:96px">日本語</span></a>\n\nhttps://example.com';
    removeEditorLinks(editor);
    expect(editor.querySelector("a, [href], [style]")).toBeNull();
    expect(editorText(editor)).toBe("日本語\n\nhttps://example.com");
  });

  it("keeps focus and caret inside a link text node when removing the wrapper", () => {
    const editor = editorWithCaret("");
    editor.innerHTML = '<a href="https://example.com">日本語</a>';
    editor.focus();
    const text = editor.querySelector("a")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 2, text, 2);
    removeEditorLinks(editor);
    expect(editor.querySelector("a")).toBeNull();
    expect(window.getSelection()!.anchorNode).toBe(text);
    expect(window.getSelection()!.anchorOffset).toBe(2);
  });

  it("retains existing ruby readings and safely handles repeat cleanup", () => {
    const editor = editorWithCaret("");
    editor.innerHTML = '<a href="https://example.com"><ruby>日本語<rt contenteditable="false">にほんご</rt></ruby></a>';
    removeEditorLinks(editor);
    removeEditorLinks(editor);
    expect(editor.querySelector("rt")!.textContent).toBe("にほんご");
    expect(editorText(editor)).toBe("日本語");
  });
});

describe("deleteEditorRubyCharacter", () => {
  function rubyEditor(caret: (editor: HTMLElement) => [Node, number]) {
    const editor = document.createElement("main");
    editor.contentEditable = "true";
    editor.innerHTML =
      '<span class="word">を</span><ruby class="word">勉強<rt contenteditable="false">べんきょう</rt></ruby>する';
    document.body.append(editor);
    const [node, offset] = caret(editor);
    const range = document.createRange();
    range.setStart(node, offset);
    window.getSelection()?.addRange(range);
    return editor;
  }

  it("deletes the base character before the caret instead of the reading", () => {
    const editor = rubyEditor((editor) => [editor, 2]);
    expect(deleteEditorRubyCharacter(editor, "backward")).toBe(true);
    expect(editorText(editor)).toBe("を勉する");
    expect(editor.querySelector("rt")).toBeNull();
    const selection = window.getSelection()!;
    expect(selection.anchorNode?.textContent).toBe("勉");
    expect(selection.anchorOffset).toBe(1);
  });

  it("leaves a placeholder line when deleting the last character empties the editor", () => {
    const editor = document.createElement("main");
    editor.contentEditable = "true";
    editor.innerHTML = '<ruby class="word">情<rt contenteditable="false">じょう</rt></ruby>';
    document.body.append(editor);
    const range = document.createRange();
    range.setStart(editor, 1);
    window.getSelection()?.addRange(range);

    expect(deleteEditorRubyCharacter(editor, "backward")).toBe(true);
    expect(editor.innerHTML).toBe('<br data-editor-tail="">');
    expect(editorText(editor)).toBe("");
    const selection = window.getSelection()!;
    expect(selection.anchorNode).toBe(editor);
    expect(selection.anchorOffset).toBe(0);
  });

  it("keeps an emptied last line in place after deleting its only word", () => {
    const editor = document.createElement("main");
    editor.contentEditable = "true";
    editor.innerHTML = '私は\n<ruby class="word">情<rt contenteditable="false">じょう</rt></ruby>';
    document.body.append(editor);
    const range = document.createRange();
    range.setStart(editor, 2);
    window.getSelection()?.addRange(range);

    expect(deleteEditorRubyCharacter(editor, "backward")).toBe(true);
    expect(editorText(editor)).toBe("私は\n");
    expect(editor.lastChild).toBeInstanceOf(HTMLBRElement);
    expect(editor.querySelectorAll("[data-editor-tail]")).toHaveLength(1);
    expect(adjacentStops(editor, window.getSelection()!.getRangeAt(0)).next?.node).toBe(editor.lastChild);
  });

  it("deletes forward from inside a ruby", () => {
    const editor = rubyEditor((editor) => [editor.querySelector("ruby")!.firstChild!, 1]);
    expect(deleteEditorRubyCharacter(editor, "forward")).toBe(true);
    expect(editorText(editor)).toBe("を勉する");
  });

  it("removes a single-character ruby and leaves later deletions to the browser", () => {
    const editor = rubyEditor((editor) => [editor, 2]);
    editor.querySelector("ruby")!.firstChild!.textContent = "嘘";
    expect(deleteEditorRubyCharacter(editor, "backward")).toBe(true);
    expect(editorText(editor)).toBe("をする");
    expect(editor.querySelector("ruby")).toBeNull();
    expect(deleteEditorRubyCharacter(editor, "backward")).toBe(false);
  });

  it("leaves characters outside rubies to the browser", () => {
    const editor = rubyEditor((editor) => [editor, 3]);
    expect(deleteEditorRubyCharacter(editor, "forward")).toBe(false);
    expect(editorText(editor)).toBe("を勉強する");
  });
});

describe("deleteEditorEmptyLastLine", () => {
  it.each([
    ["<br>", 0],
    ["<br>", 1],
    ["<br data-editor-tail>", 1],
  ])("removes the hard break and its %s placeholder together from either side", (placeholder, after) => {
    const editor = document.createElement("main");
    editor.contentEditable = "true";
    editor.innerHTML = `<ruby>日本語<rt contenteditable="false">にほんご</rt></ruby>\n${placeholder}`;
    document.body.append(editor);
    const range = document.createRange();
    range.setStart(editor, editor.childNodes.length - 1 + after);
    window.getSelection()?.addRange(range);

    expect(deleteEditorEmptyLastLine(editor)).toBe(true);
    expect(editorText(editor)).toBe("日本語");
    expect(editor.querySelector("br")).toBeNull();
    expect(deleteEditorEmptyLastLine(editor)).toBe(false);
  });

  it("keeps the placeholder when an earlier break leaves another empty last line", () => {
    const editor = editorWithCaret("日本語");
    insertEditorLineBreak(editor);
    insertEditorLineBreak(editor);

    expect(deleteEditorEmptyLastLine(editor)).toBe(true);
    expect(editorText(editor)).toBe("日本語\n");
    expect(editor.lastChild).toBeInstanceOf(HTMLBRElement);
    expect(editor.querySelectorAll("[data-editor-tail]")).toHaveLength(1);
    expect(adjacentStops(editor, window.getSelection()!.getRangeAt(0)).next?.node).toBe(editor.lastChild);
  });

  it("leaves a break before later text to the browser", () => {
    const editor = editorWithCaret("日本語\n東京");
    expect(deleteEditorEmptyLastLine(editor)).toBe(false);
  });
});
