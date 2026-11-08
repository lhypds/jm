// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { caretOffset, caretPoint, moveCaretToLineEdge } from "./editorCaret.ts";

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

function editor(html: string) {
  const element = document.createElement("main");
  element.contentEditable = "true";
  element.innerHTML = html;
  document.body.append(element);
  return element;
}

function caret(node: Node, offset: number) {
  window.getSelection()!.setBaseAndExtent(node, offset, node, offset);
}

function focusOffset(element: HTMLElement) {
  const selection = window.getSelection()!;
  return caretOffset(element, selection.focusNode!, selection.focusOffset);
}

describe("moveCaretToLineEdge", () => {
  it("moves to the start and end of the line around the caret", () => {
    const element = editor('私は\n<ruby class="word">日本語<rt contenteditable="false">にほんご</rt></ruby>を話す\n東京');
    const middle = element.childNodes[2]; // "を話す\n"
    caret(middle, 1);

    expect(moveCaretToLineEdge(element, "start", false)).toBe(true);
    expect(focusOffset(element)).toBe(3);
    expect(window.getSelection()!.isCollapsed).toBe(true);

    expect(moveCaretToLineEdge(element, "end", false)).toBe(true);
    expect(focusOffset(element)).toBe(9);
    expect(window.getSelection()!.isCollapsed).toBe(true);
  });

  it("stays outside a ruby at the line's edges", () => {
    const element = editor('<ruby class="word">日本語<rt contenteditable="false">にほんご</rt></ruby>\n東京');
    const base = element.querySelector("ruby")!.firstChild!;
    caret(base, 1);

    moveCaretToLineEdge(element, "end", false);
    expect(focusOffset(element)).toBe(3);
    expect(window.getSelection()!.focusNode).toBe(element);
    expect(window.getSelection()!.focusOffset).toBe(1);

    moveCaretToLineEdge(element, "start", false);
    expect(focusOffset(element)).toBe(0);
    expect(window.getSelection()!.focusNode!.parentElement?.closest("ruby")).toBeNull();
  });

  it("extends the selection to the line's edge with Shift", () => {
    const element = editor("私は日本語を話す");
    const text = element.firstChild!;
    caret(text, 2);

    moveCaretToLineEdge(element, "end", true);
    const selection = window.getSelection()!;
    expect(selection.anchorNode).toBe(text);
    expect(selection.anchorOffset).toBe(2);
    expect(focusOffset(element)).toBe(8);
  });

  it("places the caret after the break at a line's start, where it is drawn on that line", () => {
    const element = editor('私は\n<ruby class="word">日本語<rt contenteditable="false">にほんご</rt></ruby>を話す');
    const base = element.querySelector("ruby")!.firstChild!;
    caret(base, 2);

    moveCaretToLineEdge(element, "start", false);
    expect(focusOffset(element)).toBe(3);
    const selection = window.getSelection()!;
    expect(selection.focusNode).toBe(element.firstChild);
    expect(selection.focusOffset).toBe(3);
  });

  it("stays put on an empty line", () => {
    const element = editor("私は\n\n東京");
    const text = element.firstChild!;
    caret(text, 3);
    moveCaretToLineEdge(element, "start", false);
    expect(focusOffset(element)).toBe(3);
    moveCaretToLineEdge(element, "end", false);
    expect(focusOffset(element)).toBe(3);
  });

  describe("in a paragraph that wraps on screen", () => {
    // Lay the text out five characters to a screen line, which happy-dom cannot do itself.
    const perLine = 5;
    const advance = 28;
    const lineHeight = 63;
    const original = Range.prototype.getClientRects;
    const rectAt = (index: number) => {
      const left = (index % perLine) * advance;
      const top = Math.floor(index / perLine) * lineHeight;
      return { left, right: left + advance, width: advance, top, bottom: top + advance, height: advance };
    };
    const laidOut = (element: HTMLElement) => {
      Range.prototype.getClientRects = function (this: Range) {
        const rects = this.startContainer === element.firstChild ? [rectAt(this.startOffset)] : [];
        return rects as unknown as DOMRectList;
      };
      return () => void (Range.prototype.getClientRects = original);
    };
    const drawn = (element: HTMLElement) => {
      const point = caretPoint(element, window.getSelection()!.getRangeAt(0));
      return { x: point.x, line: Math.floor(point.y / lineHeight) };
    };

    it("moves to the ends of the screen line, drawing the caret on that line at both", () => {
      const element = editor("あいうえおかきくけこさしすせそ");
      const restore = laidOut(element);
      try {
        caret(element.firstChild!, 7);
        moveCaretToLineEdge(element, "start", false);
        expect(focusOffset(element)).toBe(5);
        expect(drawn(element)).toEqual({ x: 0, line: 1 });

        moveCaretToLineEdge(element, "end", false);
        expect(focusOffset(element)).toBe(10);
        expect(drawn(element)).toEqual({ x: perLine * advance, line: 1 });

        moveCaretToLineEdge(element, "start", false);
        expect(focusOffset(element)).toBe(5);
        expect(drawn(element)).toEqual({ x: 0, line: 1 });
      } finally {
        restore();
      }
    });

    it("draws the same point at the end of the line above once the caret has been elsewhere", () => {
      const element = editor("あいうえおかきくけこさしすせそ");
      const restore = laidOut(element);
      try {
        caret(element.firstChild!, 7);
        moveCaretToLineEdge(element, "start", false);
        caret(element.firstChild!, 12);
        document.dispatchEvent(new Event("selectionchange"));
        caret(element.firstChild!, 5);
        document.dispatchEvent(new Event("selectionchange"));
        expect(drawn(element)).toEqual({ x: perLine * advance, line: 0 });
      } finally {
        restore();
      }
    });
  });

  it("ignores a caret outside the editor", () => {
    const element = editor("日本語");
    const other = document.createElement("p");
    other.textContent = "外";
    document.body.append(other);
    caret(other.firstChild!, 0);
    expect(moveCaretToLineEdge(element, "end", false)).toBe(false);
  });
});
