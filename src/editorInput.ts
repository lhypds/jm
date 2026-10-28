import { adjacentStops, caretOffset, caretPosition } from "./editorCaret.ts";
import { editorText } from "./editorText.ts";

/** Remove imported formatting and links while retaining their editable text. */
export function removeEditorLinks(editor: HTMLElement) {
  editor.querySelectorAll("[style], [color], [face], [size]").forEach((element) => {
    for (const attribute of ["style", "color", "face", "size"]) element.removeAttribute(attribute);
  });
  editor.querySelectorAll("a, font").forEach((element) => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const focus = selection?.focusNode;
    const anchorOffset = selection?.anchorOffset ?? 0;
    const focusOffset = selection?.focusOffset ?? 0;
    const parent = element.parentNode;
    if (!parent) return;
    const index = Array.prototype.indexOf.call(parent.childNodes, element);
    const children = Array.from(element.childNodes);
    children.forEach((child) => parent.insertBefore(child, element));
    element.remove();
    // Moving nodes can reset the browser selection. Restore it without focusing
    // the editor when a background annotation or auto-link operation occurs.
    if (
      anchor &&
      focus &&
      (anchor === element ||
        children.some((child) => child === anchor || child.contains(anchor)) ||
        focus === element ||
        children.some((child) => child === focus || child.contains(focus)))
    ) {
      selection?.setBaseAndExtent(
        anchor === element ? parent : anchor,
        anchor === element ? index + anchorOffset : anchorOffset,
        focus === element ? parent : focus,
        focus === element ? index + focusOffset : focusOffset,
      );
    }
  });
}

/** Insert plain text without inheriting clipboard HTML or its font styles. */
export function insertEditorText(editor: HTMLElement, text: string): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return false;

  range.deleteContents();
  const inserted = document.createTextNode(text.replace(/\r\n?/g, "\n"));
  range.insertNode(inserted);

  // The final empty line must exist even before the annotation request completes.
  editor.querySelectorAll("[data-editor-tail]").forEach((tail) => tail.remove());
  if (editorText(editor).endsWith("\n")) {
    const tail = document.createElement("br");
    tail.setAttribute("data-editor-tail", "");
    editor.append(tail);
  }

  range.setStartAfter(inserted);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/** Insert exactly one hard break, keeping the caret on the new editable line. */
export function insertEditorLineBreak(editor: HTMLElement): boolean {
  return insertEditorText(editor, "\n");
}

/**
 * Delete an empty last line in one step. Browsers keep it visible with a final
 * <br> after the hard break, and would otherwise delete only that placeholder.
 */
export function deleteEditorEmptyLastLine(editor: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;

  // The caret may sit on either side of the placeholder, with nothing else after it.
  const placeholder = editor.lastChild;
  const { next } = adjacentStops(editor, range);
  if (!(placeholder instanceof HTMLBRElement) || (next && next.node !== placeholder)) return false;
  const lineBreak = placeholder.previousSibling;
  if (!(lineBreak instanceof Text) || !lineBreak.data.endsWith("\n")) return false;

  placeholder.remove();
  lineBreak.deleteData(lineBreak.length - 1, 1);
  // An earlier hard break now ends the text, so its empty line still needs the placeholder.
  if (editorText(editor).endsWith("\n")) {
    placeholder.setAttribute("data-editor-tail", "");
    editor.append(placeholder);
  }
  range.setStart(lineBreak, lineBreak.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/**
 * Delete one base character next to the caret when it belongs to a ruby. Browsers
 * would otherwise remove the non-editable reading first. The ruby becomes plain
 * text so its stale reading disappears until the next annotation.
 */
export function deleteEditorRubyCharacter(editor: HTMLElement, direction: "backward" | "forward"): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;

  const { previous, next } = adjacentStops(editor, range);
  const stop = direction === "backward" ? previous : next;
  if (!stop || !("index" in stop)) return false;
  const ruby = stop.node.parentElement?.closest("ruby");
  if (!ruby || !editor.contains(ruby) || !ruby.parentNode) return false;

  // Remove a whole surrogate pair rather than half of an astral character.
  const { data } = stop.node;
  let start = stop.index;
  let end = stop.index + 1;
  if (/[\uDC00-\uDFFF]/.test(data[start] ?? "") && /[\uD800-\uDBFF]/.test(data[start - 1] ?? "")) start--;
  else if (/[\uD800-\uDBFF]/.test(data[start] ?? "") && /[\uDC00-\uDFFF]/.test(data[end] ?? "")) end++;

  // Offset of the deleted character within the ruby's base text.
  const before = document.createRange();
  before.selectNodeContents(ruby);
  before.setEnd(stop.node, start);
  const offset = editorText(before.cloneContents()).length;
  const base = editorText(ruby);
  const remaining = base.slice(0, offset) + base.slice(offset + end - start);

  const parent = ruby.parentNode;
  const index = Array.prototype.indexOf.call(parent.childNodes, ruby);
  if (remaining) {
    const plain = document.createTextNode(remaining);
    ruby.replaceWith(plain);
    range.setStart(plain, offset);
  } else {
    ruby.remove();
    range.setStart(parent, index);
    if (!editor.hasChildNodes()) { editor.append(document.createElement("br")); range.setStart(editor, 0); } // EXP
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/**
 * Turn rubies whose base text no longer matches its annotation into plain text.
 * Some keyboards, like those on iOS, delete without a cancelable beforeinput, so the
 * browser removes the base text but keeps the non-editable reading above nothing.
 */
export function removeStaleReadings(editor: HTMLElement): boolean {
  const stale = Array.from(editor.querySelectorAll<HTMLElement>("ruby")).filter((ruby) => {
    const base = editorText(ruby);
    return !base || (ruby.dataset.base !== undefined && base !== ruby.dataset.base);
  });
  if (!stale.length) return false;

  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  const focus = selection?.focusNode;
  const saved =
    selection && anchor && focus && editor.contains(anchor) && editor.contains(focus)
      ? [caretOffset(editor, anchor, selection.anchorOffset), caretOffset(editor, focus, selection.focusOffset)]
      : null;

  for (const ruby of stale) {
    const base = editorText(ruby);
    if (base) ruby.replaceWith(document.createTextNode(base));
    else ruby.remove();
  }
  editor.normalize();

  if (saved) {
    const [anchorNode, anchorOffset] = caretPosition(editor, saved[0]);
    const [focusNode, focusOffset] = caretPosition(editor, saved[1]);
    selection?.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
  }
  return true;
}
