// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { editorText } from "./editorText.ts";

describe("editorText", () => {
  it.each([
    ["日本語<div>東京</div>", "日本語\n東京"],
    ["日本語<div><br></div><div>東京</div>", "日本語\n\n東京"],
    ["<div>日本語</div><div><br></div><div>東京</div>", "日本語\n\n東京"],
    ["日本語<br><br>東京", "日本語\n\n東京"],
    ["<p>日本語</p><p>東京</p>", "日本語\n東京"],
    ["日本語<div><br></div>", "日本語\n"],
    ["日本語\n<br data-editor-tail>", "日本語\n"],
    ["日本語\n<br>", "日本語\n"],
    ["<ruby>日本語<rt>にほんご</rt></ruby>\n\n東京", "日本語\n\n東京"],
    ["<br>", ""],
  ])("preserves source text for %s", (html, expected) => {
    const editor = document.createElement("main");
    editor.innerHTML = html;
    expect(editorText(editor)).toBe(expected);
  });

  it("counts paragraph breaks when saving a caret offset", () => {
    const editor = document.createElement("main");
    editor.innerHTML = "日本語<div><br></div><div>東京</div>";
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.setEnd(editor.lastChild!.firstChild!, 1);
    expect(editorText(range.cloneContents())).toBe("日本語\n\n東");
  });

  it("keeps a final <br> in a copied range before later text", () => {
    const editor = document.createElement("main");
    editor.innerHTML = "日本語\n<br>東京";
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.setEndBefore(editor.lastChild!);
    expect(editorText(range.cloneContents())).toBe("日本語\n\n");
  });
});
