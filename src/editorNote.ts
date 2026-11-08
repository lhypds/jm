import { caretOffset } from "./editorCaret.ts";
import { editorText, isEditorDecoration } from "./editorText.ts";

/**
 * A note is a non-editable block shown between the lines of the text, such as a translation
 * under the passage it translates. It contributes nothing to the source text, and always sits
 * right after a line's hard break, or at the very end, so the text around it flows unchanged.
 * Several notes may follow the same line; such a run is treated as one block.
 */
export function editorNotes(editor: HTMLElement): HTMLElement[] {
  return Array.from(editor.querySelectorAll<HTMLElement>("[data-editor-note]"));
}

function isNote(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.hasAttribute("data-editor-note");
}

/** The source offset of the point just before the note. */
export function editorNoteOffset(editor: HTMLElement, note: HTMLElement): number {
  const parent = note.parentNode!;
  return caretOffset(editor, parent, Array.prototype.indexOf.call(parent.childNodes, note));
}

function indexIn(parent: Node, node: Node) {
  return Array.prototype.indexOf.call(parent.childNodes, node);
}

function neighbour(node: Node | null, direction: "backward" | "forward"): Node | null {
  while (node instanceof Text && node.length === 0) {
    node = direction === "backward" ? node.previousSibling : node.nextSibling;
  }
  return node;
}

/** The first and last of the notes that sit together with this one. */
function noteRun(note: HTMLElement) {
  let first = note;
  let last = note;
  for (let node = neighbour(first.previousSibling, "backward"); isNote(node); node = neighbour(node.previousSibling, "backward")) first = node;
  for (let node = neighbour(last.nextSibling, "forward"); isNote(node); node = neighbour(node.nextSibling, "forward")) last = node;
  return { first, last };
}

/** Place the note below the line holding a source offset: after that line's break, or at the end of the text. */
export function placeEditorNote(editor: HTMLElement, note: HTMLElement, offset: number) {
  note.remove();
  const source = editorText(editor);
  const lineStart = offset > 0 && source[offset - 1] === "\n";
  const nextBreak = source.indexOf("\n", offset);
  const target = lineStart ? offset : nextBreak === -1 ? source.length : nextBreak + 1;

  // Only the text counts: not readings, and not the words inside other notes.
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest("rt, [data-editor-note]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let remaining = target;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (remaining > node.length) {
      remaining -= node.length;
      continue;
    }
    // Stay outside a ruby, whose base is one word; the target follows a break, which never sits inside one.
    const edge = node.parentElement?.tagName === "RUBY" ? node.parentElement : node;
    if (remaining === 0) edge.before(note);
    else if (remaining === node.length) {
      // Notes already below this line keep their order; the new one joins them at the end.
      const next = neighbour(edge.nextSibling, "forward");
      (isNote(next) ? noteRun(next).last : edge).after(note);
    } else node.splitText(remaining).before(note);
    return;
  }
  // Past all text: before the placeholder that keeps an empty last line visible, if any.
  const tail = editor.lastChild;
  if (tail instanceof HTMLElement && tail.hasAttribute("data-editor-tail")) tail.before(note);
  else editor.append(note);
}

/** The note when the collapsed selection sits right against it, on the given side, else null. */
export function editorNoteAtCaret(editor: HTMLElement, direction: "backward" | "forward"): HTMLElement | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  let node: Node = range.startContainer;
  let offset = range.startOffset;
  if (!editor.contains(node) || node.parentElement?.closest("[data-editor-note]")) return null;
  const backward = direction === "backward";

  if (node instanceof Text) {
    if (backward ? offset > 0 : offset < node.length) return null;
    const parent = node.parentNode!;
    offset = indexIn(parent, node) + (backward ? 0 : 1);
    node = parent;
  }
  for (;;) {
    const sibling = neighbour(node.childNodes[backward ? offset - 1 : offset] ?? null, direction);
    if (sibling) return isNote(sibling) ? sibling : null;
    if (node === editor || !node.parentNode) return null;
    // At the edge of a ruby or another wrapper, the neighbour is the wrapper's own.
    offset = indexIn(node.parentNode, node) + (backward ? 0 : 1);
    node = node.parentNode;
  }
}

function setCaret(node: Node, offset: number) {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection?.addRange(range);
}

function setCaretAfter(node: Node) {
  const parent = node.parentNode!;
  setCaret(parent, indexIn(parent, node) + 1);
}

/**
 * Backspace just below the note removes the empty line there, as it would without the note:
 * the break after the note, or the one before it when the note ends the text. Returns false
 * when a line of text follows the note directly, which leaves the note itself to be removed.
 */
export function deleteEditorBreakAroundNote(note: HTMLElement): boolean {
  const { first, last } = noteRun(note);
  const next = neighbour(last.nextSibling, "forward");
  if (next instanceof Text && next.data.startsWith("\n")) {
    next.deleteData(0, 1);
    setCaretAfter(last);
    return true;
  }
  if (!next || isEditorDecoration(next)) {
    const previous = neighbour(first.previousSibling, "backward");
    if (previous instanceof Text && previous.data.endsWith("\n")) {
      previous.deleteData(previous.length - 1, 1);
      setCaret(previous, previous.length);
      return true;
    }
  }
  return false;
}

/**
 * A click below a note that ends the text continues writing under the note: on the empty line
 * already there, or on a new one, breaking the line above. Returns false when text follows the note.
 */
export function startLineBelowNote(note: HTMLElement): boolean {
  const { first, last } = noteRun(note);
  const next = neighbour(last.nextSibling, "forward");
  if (next && !isEditorDecoration(next)) return false;
  const previous = neighbour(first.previousSibling, "backward");
  if (previous && !(previous instanceof Text && previous.data.endsWith("\n"))) {
    first.before(document.createTextNode("\n"));
  }
  setCaretAfter(last);
  return true;
}

/**
 * Enter at the end of the line above the note starts the next line below the note, rather than
 * between the line and its translation. Returns false elsewhere.
 */
export function insertEditorBreakBelowNote(editor: HTMLElement, note: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || range.startContainer.parentElement?.closest("[data-editor-note]")) {
    return false;
  }
  const { first, last } = noteRun(note);
  const source = editorText(editor);
  const noteAt = editorNoteOffset(editor, first);
  const afterBreak = noteAt > 0 && source[noteAt - 1] === "\n";
  if (caretOffset(editor, range.startContainer, range.startOffset) !== (afterBreak ? noteAt - 1 : noteAt)) return false;

  // Below a line that already breaks, the new line comes after the note; otherwise the line breaks before it.
  const lineBreak = document.createTextNode("\n");
  if (afterBreak) last.after(lineBreak);
  else first.before(lineBreak);
  setCaretAfter(last);
  return true;
}
