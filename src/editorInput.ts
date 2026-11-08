import { adjacentStops } from "./editorCaret.ts";
import { editorNotes, insertEditorBreakBelowNote } from "./editorNote.ts";
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

/**
 * Keep inserted text out of a ruby's base. A break there does not wrap the line,
 * so the text only moves down once the next annotation renders it. At either edge
 * the caret steps outside the ruby; within it the ruby becomes plain text, since
 * its reading no longer fits.
 */
function moveOutOfRuby(editor: HTMLElement, range: Range) {
  const ruby = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)
    ?.closest("ruby");
  if (!ruby || !editor.contains(ruby)) return;

  const before = document.createRange();
  before.selectNodeContents(ruby);
  before.setEnd(range.startContainer, range.startOffset);
  const offset = editorText(before.cloneContents()).length;
  const base = editorText(ruby);
  if (offset === 0) range.setStartBefore(ruby);
  else if (offset >= base.length) range.setStartAfter(ruby);
  else {
    const plain = document.createTextNode(base);
    ruby.replaceWith(plain);
    range.setStart(plain, offset);
  }
  range.collapse(true);
}

/** Insert plain text without inheriting clipboard HTML or its font styles. */
export function insertEditorText(editor: HTMLElement, text: string): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return false;

  range.deleteContents();
  moveOutOfRuby(editor, range);
  const inserted = document.createTextNode(text.replace(/\r\n?/g, "\n"));
  range.insertNode(inserted);
  refreshEditorTail(editor);

  range.setStartAfter(inserted);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/** The final empty line must exist even before the annotation request completes. */
export function refreshEditorTail(editor: HTMLElement) {
  editor.querySelectorAll("[data-editor-tail]").forEach((tail) => tail.remove());
  if (editorText(editor).endsWith("\n")) {
    const tail = document.createElement("br");
    tail.setAttribute("data-editor-tail", "");
    editor.append(tail);
  }
}

/** Insert exactly one hard break, keeping the caret on the new editable line. */
export function insertEditorLineBreak(editor: HTMLElement): boolean {
  if (editorNotes(editor).some((note) => insertEditorBreakBelowNote(editor, note))) {
    refreshEditorTail(editor);
    return true;
  }
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

/** The span of the character at an index: a whole surrogate pair rather than half of an astral character. */
function characterSpan(data: string, index: number): [number, number] {
  let start = index;
  let end = index + 1;
  if (/[\uDC00-\uDFFF]/.test(data[start] ?? "") && /[\uD800-\uDBFF]/.test(data[start - 1] ?? "")) start--;
  else if (/[\uD800-\uDBFF]/.test(data[start] ?? "") && /[\uDC00-\uDFFF]/.test(data[end] ?? "")) end++;
  return [start, end];
}

/**
 * Delete one character next to the caret when it or the caret belongs to a ruby, or when the
 * caret follows a hard break and deletes forward. Browsers would otherwise remove the
 * non-editable reading first, or nothing at all. A ruby losing a base character becomes plain
 * text so its stale reading disappears until the next annotation.
 */
export function deleteEditorRubyCharacter(editor: HTMLElement, direction: "backward" | "forward"): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;

  const { previous, next } = adjacentStops(editor, range);
  const stop = direction === "backward" ? previous : next;
  const stopRuby = stop && "index" in stop ? stop.node.parentElement?.closest("ruby") : null;

  // A click or arrow key can leave the caret inside a ruby's base, at its edge. From there a
  // deletion that leaves the ruby meets its non-editable reading before anything else, so the
  // browser removes the reading, or nothing at all. Delete the outside character here instead.
  const caretRuby = (
    range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
  )?.closest("ruby");
  // A click followed by i, or Home, puts the caret at the end of the text above a line, right
  // after its hard break. Firefox ignores a forward deletion from there when the next character
  // starts another node, so the word opening the line below could not be deleted from its front.
  const afterBreak =
    direction === "forward" &&
    range.startContainer instanceof Text &&
    range.startOffset === range.startContainer.length &&
    range.startContainer.data.endsWith("\n");
  if (((caretRuby && editor.contains(caretRuby)) || afterBreak) && !stopRuby) {
    if (!stop) return true;
    if (!("index" in stop)) {
      // Only the placeholder of an empty last line follows, so there is nothing to delete.
      if (stop.node.hasAttribute("data-editor-tail")) return true;
      const parent = stop.node.parentNode!;
      const index = Array.prototype.indexOf.call(parent.childNodes, stop.node);
      stop.node.remove();
      range.setStart(parent, index);
    } else {
      const [start, end] = characterSpan(stop.node.data, stop.index);
      stop.node.deleteData(start, end - start);
      if (stop.node.length) range.setStart(stop.node, start);
      else {
        // Drop the emptied text node, and the word wrapper it was the whole of, so the caret
        // never rests in an empty node.
        const wrapper = stop.node.parentElement;
        const removed: ChildNode =
          wrapper && wrapper !== editor && wrapper.classList.contains("word") && wrapper.childNodes.length === 1
            ? wrapper
            : stop.node;
        const parent = removed.parentNode!;
        const index = Array.prototype.indexOf.call(parent.childNodes, removed);
        removed.remove();
        range.setStart(parent, index);
      }
    }
    refreshEditorTail(editor);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  if (!stop || !("index" in stop)) return false;
  const ruby = stopRuby;
  if (!ruby || !editor.contains(ruby) || !ruby.parentNode) return false;

  const [start, end] = characterSpan(stop.node.data, stop.index);

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
    // An emptied editor or last line needs its placeholder, as after a typed break.
    // Without it the empty line collapses, so the caret jumps up a line until the
    // next annotation, and iOS WebKit leaves the removed reading painted.
    const text = editorText(editor);
    if ((!text || text.endsWith("\n")) && !editor.querySelector("[data-editor-tail]")) {
      const tail = document.createElement("br");
      tail.setAttribute("data-editor-tail", "");
      editor.append(tail);
    }
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
