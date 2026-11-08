import { editorText } from "./editorText.ts";

export type Stop = { node: Text; index: number } | { node: HTMLBRElement };

/** Visible caret stops in document order, skipping ruby readings and notes. */
export function caretStops(editor: HTMLElement) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node instanceof HTMLElement && (node.tagName === "RT" || node.hasAttribute("data-editor-note"))) {
        return NodeFilter.FILTER_REJECT;
      }
      return node instanceof Text || node instanceof HTMLBRElement ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const stops: Stop[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof HTMLBRElement) stops.push({ node });
    else if (node instanceof Text) for (let index = 0; index < node.length; index++) stops.push({ node, index });
  }
  return stops;
}

function stopRects(stop: Stop) {
  if (!("index" in stop)) return Array.from(stop.node.getClientRects());
  const range = document.createRange();
  range.setStart(stop.node, stop.index);
  range.setEnd(stop.node, stop.index + 1);
  // WebKit adds an empty rect at the end of the previous line for a character that starts a wrapped line.
  const rects = Array.from(range.getClientRects());
  const visible = rects.filter((rect) => rect.width > 0);
  return visible.length ? visible : rects;
}

function isLineBreak(stop: Stop) {
  return !("index" in stop) || stop.node.data[stop.index] === "\n";
}

/** The visible stops immediately before and after a collapsed range. */
export function adjacentStops(editor: HTMLElement, range: Range): { previous?: Stop; next?: Stop } {
  const stops = caretStops(editor);
  const after = stops.findIndex((stop) => range.comparePoint(stop.node, "index" in stop ? stop.index : 0) >= 0);
  return { previous: stops[(after === -1 ? stops.length : after) - 1], next: after === -1 ? undefined : stops[after] };
}

/** The collapsed caret range nearest a viewport point, or null outside the editor. */
export function caretRangeAtPoint(editor: HTMLElement, x: number, y: number): Range | null {
  let range: Range | null = null;
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
    }
  } else {
    range = document.caretRangeFromPoint?.(x, y) ?? null;
  }
  if (!range || !editor.contains(range.startContainer)) return null;
  range.collapse(true);
  return range;
}

/**
 * The caret position at the end of a paragraph or on an empty line when a viewport
 * point lies in the blank space after it, or null for points on or within text.
 */
export function paragraphEndAtPoint(editor: HTMLElement, x: number, y: number): Range | null {
  const range = caretRangeAtPoint(editor, x, y);
  if (!range) return null;

  const { previous, next } = adjacentStops(editor, range);
  if (next && !isLineBreak(next)) return null;
  const point = caretPoint(editor, range);
  const halfLine = parseFloat(getComputedStyle(editor).lineHeight) / 2;
  if (Math.abs(y - point.y) > halfLine) return null;
  // An empty line is blank across its width; otherwise only right of the paragraph's end.
  const emptyLine = !previous || isLineBreak(previous);
  return emptyLine || x >= point.x ? range : null;
}

/**
 * Viewport bands to invert for a selection, one per line of the base text. A fully
 * selected ruby spans its whole width, so words with wider readings leave no gaps.
 */
export function selectionBands(editor: HTMLElement, range: Range) {
  const bands: { left: number; right: number; top: number; bottom: number }[] = [];
  const fontSize = parseFloat(getComputedStyle(editor).fontSize);

  for (const stop of caretStops(editor)) {
    if (!("index" in stop) || stop.node.data[stop.index] === "\n") continue;
    if (range.comparePoint(stop.node, stop.index) < 0 || range.comparePoint(stop.node, stop.index + 1) > 0) continue;
    const rect = stopRects(stop)[0];
    if (!rect) continue;

    let { left, right } = rect;
    const ruby = stop.node.parentElement?.closest("ruby");
    if (ruby && range.isPointInRange(stop.node, 0) && range.isPointInRange(stop.node, stop.node.length)) {
      ({ left, right } = ruby.getBoundingClientRect());
    }

    const band = bands.at(-1);
    if (band && Math.abs((band.top + band.bottom) / 2 - (rect.top + rect.bottom) / 2) < fontSize / 2) {
      band.left = Math.min(band.left, left);
      band.right = Math.max(band.right, right);
      band.top = Math.min(band.top, rect.top);
      band.bottom = Math.max(band.bottom, rect.bottom);
    } else {
      bands.push({ left, right, top: rect.top, bottom: rect.bottom });
    }
  }
  // Keep each band to the glyphs' height so it never reaches the readings above.
  return bands.map((band) => {
    const middle = (band.top + band.bottom) / 2;
    return { ...band, top: middle - fontSize * 0.6, bottom: middle + fontSize * 0.6 };
  });
}

/** Where the text ends on screen, with half the height of a line. */
function textEnd(editor: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return { end: caretPoint(editor, range), halfLine: parseFloat(getComputedStyle(editor).lineHeight) / 2 };
}

/** Whether a viewport point lies after the end of the text: right of its last line, or below it. */
export function isAfterText(editor: HTMLElement, x: number, y: number) {
  const { end, halfLine } = textEnd(editor);
  return y > end.y + halfLine || (y >= end.y - halfLine && x >= end.x);
}

/** Whether a viewport point lies below the text's last line. */
export function isBelowText(editor: HTMLElement, y: number) {
  const { end, halfLine } = textEnd(editor);
  return y > end.y + halfLine;
}

/**
 * Where a paragraph wraps, the start of one screen line is the same point as the end of the
 * line above. A caret that Home put there belongs to the line below, until the selection leaves.
 */
const wrappedLineStarts = new WeakMap<HTMLElement, { node: Node; offset: number; settle: () => void }>();

function atWrappedLineStart(editor: HTMLElement, range: Range) {
  const start = wrappedLineStarts.get(editor);
  return !!start && range.collapsed && range.startContainer === start.node && range.startOffset === start.offset;
}

function markWrappedLineStart(editor: HTMLElement, node: Node, offset: number) {
  clearWrappedLineStart(editor);
  const settle = () => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !atWrappedLineStart(editor, range)) clearWrappedLineStart(editor);
  };
  wrappedLineStarts.set(editor, { node, offset, settle });
  document.addEventListener("selectionchange", settle);
}

function clearWrappedLineStart(editor: HTMLElement) {
  const start = wrappedLineStarts.get(editor);
  if (!start) return;
  document.removeEventListener("selectionchange", start.settle);
  wrappedLineStarts.delete(editor);
}

/** Viewport point where the next typed character will start, centered on its line. */
export function caretPoint(editor: HTMLElement, range: Range): { x: number; y: number } {
  const { previous, next } = adjacentStops(editor, range);

  if (previous && !isLineBreak(previous) && !atWrappedLineStart(editor, range)) {
    const rects = stopRects(previous);
    const rect = rects[rects.length - 1];
    if (rect) return { x: rect.right, y: rect.top + rect.height / 2 };
  }
  if (next) {
    const rect = stopRects(next)[0];
    if (rect) return { x: rect.left, y: rect.top + rect.height / 2 };
  }
  // A final <br> holds the empty last line, so it marks where that line starts.
  if (previous && !("index" in previous)) {
    const rect = previous.node.getClientRects()[0];
    if (rect) return { x: rect.left, y: rect.top + rect.height / 2 };
  }

  // An empty editor starts its first character where its alignment puts it.
  const rect = editor.getBoundingClientRect();
  const style = getComputedStyle(editor);
  const x = style.textAlign === "center" ? rect.left + rect.width / 2 - parseFloat(style.fontSize) / 2 : rect.left;
  return { x, y: rect.top + rect.height / 2 };
}

/**
 * Move the caret to the start or end of its line on screen, as Home and End do, or extend the
 * selection there. The line is the one the caret is drawn on: a wrapped paragraph has several,
 * and a hard break ends one. Returns false outside the editor.
 */
export function moveCaretToLineEdge(editor: HTMLElement, edge: "start" | "end", extend: boolean): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.focusNode || !editor.contains(selection.focusNode)) return false;
  const anchorNode = selection.anchorNode ?? selection.focusNode;
  const anchorOffset = selection.anchorOffset;
  const range = document.createRange();
  range.setStart(selection.focusNode, selection.focusOffset);
  range.collapse(true);

  // Stops share the caret's line when their glyphs are centered on it, as the selection bands judge.
  const stops = caretStops(editor);
  const found = stops.findIndex((stop) => range.comparePoint(stop.node, "index" in stop ? stop.index : 0) >= 0);
  const after = found === -1 ? stops.length : found;
  const { y } = caretPoint(editor, range);
  const tolerance = (parseFloat(getComputedStyle(editor).fontSize) || 16) / 2;
  const onLine = (stop: Stop) => {
    if (isLineBreak(stop)) return false;
    const rect = stopRects(stop)[0];
    return !rect || Math.abs(rect.top + rect.height / 2 - y) < tolerance;
  };

  const source = editorText(editor);
  let offset = caretOffset(editor, range.startContainer, range.startOffset);
  if (edge === "start") {
    let first = after;
    while (first > 0 && onLine(stops[first - 1])) first--;
    const stop = first < after ? stops[first] : null;
    if (stop && "index" in stop) offset = caretOffset(editor, stop.node, stop.index);
    // Keep an astral character whole.
    if (/[\uDC00-\uDFFF]/.test(source[offset] ?? "") && /[\uD800-\uDBFF]/.test(source[offset - 1] ?? "")) offset--;
  } else {
    let last = after;
    while (last < stops.length && onLine(stops[last])) last++;
    const stop = last > after ? stops[last - 1] : null;
    if (stop && "index" in stop) offset = caretOffset(editor, stop.node, stop.index) + 1;
    if (/[\uD800-\uDBFF]/.test(source[offset - 1] ?? "") && /[\uDC00-\uDFFF]/.test(source[offset] ?? "")) offset++;
  }

  const [node, nodeOffset] = caretPosition(editor, offset);
  if (extend) selection.setBaseAndExtent(anchorNode, anchorOffset, node, nodeOffset);
  else selection.setBaseAndExtent(node, nodeOffset, node, nodeOffset);
  // The start of a wrapped line is also the end of the line above; the caret stays on the line below.
  if (!extend && edge === "start" && offset > 0 && source[offset - 1] !== "\n") markWrappedLineStart(editor, node, nodeOffset);
  else clearWrappedLineStart(editor);
  return true;
}

/** The caret's offset in the editor's source text, ignoring ruby readings. */
export function caretOffset(editor: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.setEnd(node, offset);
  const content = range.cloneContents();
  return editorText(content).length;
}

/** The DOM point for a source-text offset, kept outside ruby readings and notes. */
export function caretPosition(editor: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest("rt, [data-editor-note]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let remaining = offset;
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      // Keep the caret outside a ruby's non-editable reading at its boundary.
      const ruby = node.parentElement;
      const edge = ruby?.tagName === "RUBY" ? ruby : node;
      // Only a ruby opening the text, or a line below a note, is reached at its very start.
      if (remaining === 0 && edge !== node && edge.parentNode) {
        return [edge.parentNode, Array.prototype.indexOf.call(edge.parentNode.childNodes, edge)];
      }
      if (remaining === length && edge.parentNode) {
        // A line that starts below notes begins after them, so the caret there types below the notes.
        let next = edge.nextSibling;
        if (next instanceof HTMLElement && next.hasAttribute("data-editor-note") && node.textContent?.endsWith("\n")) {
          while (next.nextSibling instanceof HTMLElement && next.nextSibling.hasAttribute("data-editor-note")) {
            next = next.nextSibling;
          }
          return [edge.parentNode, Array.prototype.indexOf.call(edge.parentNode.childNodes, next) + 1];
        }
        if (edge !== node) return [edge.parentNode, Array.prototype.indexOf.call(edge.parentNode.childNodes, edge) + 1];
      }
      return [node, remaining];
    }
    remaining -= length;
    node = walker.nextNode();
  }
  return [editor, editor.childNodes.length];
}
