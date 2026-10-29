import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ReadingSegment } from "../shared/types.ts";
import {
  caretOffset,
  caretPoint,
  caretPosition,
  caretRangeAtPoint,
  isAfterText,
  paragraphEndAtPoint,
  selectionBands,
} from "./editorCaret.ts";
import { editorText } from "./editorText.ts";
import {
  deleteEditorEmptyLastLine,
  deleteEditorRubyCharacter,
  insertEditorLineBreak,
  insertEditorText,
  removeEditorLinks,
} from "./editorInput.ts";
import { pronunciationText, pronounceJapanese, selectedPronunciation, stopPronunciation } from "./pronunciation.ts";
import "./App.css";

function sourceText(editor: HTMLElement) {
  return editorText(editor);
}

function renderReadings(editor: HTMLElement, segments: ReadingSegment[]) {
  const fragment = document.createDocumentFragment();

  for (const segment of segments) {
    if (!segment.reading) {
      if (/[\p{L}\p{N}]/u.test(segment.text)) {
        const word = document.createElement("span");
        word.className = "word";
        word.textContent = segment.text;
        fragment.append(word);
      } else {
        fragment.append(document.createTextNode(segment.text));
      }
      continue;
    }

    const ruby = document.createElement("ruby");
    ruby.className = "word";
    ruby.append(document.createTextNode(segment.text));
    const reading = document.createElement("rt");
    reading.contentEditable = "false";
    reading.lang = segment.readingLanguage ?? "ja";
    if (segment.readingKind === "meaning") reading.title = "English meaning";
    reading.textContent = segment.reading;
    ruby.append(reading);
    fragment.append(ruby);
  }

  // A trailing hard break needs a final empty line to remain visibly editable.
  if (segments.at(-1)?.text.endsWith("\n")) {
    const tail = document.createElement("br");
    tail.setAttribute("data-editor-tail", "");
    fragment.append(tail);
  }

  editor.replaceChildren(fragment);
}

/** Draw the selection as inverted bands over the base text, leaving the readings above untouched. */
function paintSelection(editor: HTMLElement, layer: HTMLElement, range: Range | null) {
  const page = layer.parentElement;
  const bands =
    page && range && !range.collapsed && editor.contains(range.commonAncestorContainer)
      ? selectionBands(editor, range)
      : [];
  editor.classList.toggle("selecting", bands.length > 0);
  const origin = page?.getBoundingClientRect();
  layer.replaceChildren(
    ...bands.map((band) => {
      const element = document.createElement("div");
      element.className = "selection-band";
      element.style.width = `${band.right - band.left}px`;
      element.style.height = `${band.bottom - band.top}px`;
      if (page && origin) {
        element.style.transform = `translate(${band.left - origin.left + page.scrollLeft}px, ${band.top - origin.top + page.scrollTop}px)`;
      }
      return element;
    }),
  );
  return bands;
}

/** Float the word tools below the selection's last line, kept within the page's width. */
function placeToolbar(toolbar: HTMLElement, bands: ReturnType<typeof selectionBands>) {
  const page = toolbar.parentElement;
  const band = bands.at(-1);
  toolbar.hidden = !page || !band;
  if (!page || !band) return;
  const origin = page.getBoundingClientRect();
  const margin = 8;
  const center = (band.left + band.right) / 2 - origin.left;
  const left = Math.max(margin, Math.min(center - toolbar.offsetWidth / 2, page.clientWidth - toolbar.offsetWidth - margin));
  toolbar.style.transform = `translate(${left + page.scrollLeft}px, ${band.bottom - origin.top + page.scrollTop + margin}px)`;
}

/** The selected text in the editor: the app's own touch selection, or the window's. */
function selectedRange(editor: HTMLElement, touchSelection: [number, number] | null) {
  if (touchSelection) return offsetRange(editor, touchSelection);
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range : null;
}

/** The words a range touches, in whole, with the reading shown for a single annotated word. */
function selectedWords(editor: HTMLElement, range: Range) {
  let start = caretOffset(editor, range.startContainer, range.startOffset);
  let end = caretOffset(editor, range.endContainer, range.endOffset);
  const words = Array.from(editor.querySelectorAll<HTMLElement>(".word"))
    .filter((word) => range.intersectsNode(word) && word.firstChild)
    .map((word) => {
      const wordStart = caretOffset(editor, word.firstChild!, 0);
      return { word, start: wordStart, end: wordStart + (word.firstChild!.textContent?.length ?? 0) };
    })
    // A range starting at the very end of a word does not select any of it.
    .filter((word) => word.start < end && word.end > start);
  if (words.length) {
    start = words[0].start;
    end = words.at(-1)!.end;
  }
  const only = words.length === 1 ? words[0].word : null;
  return {
    word: sourceText(editor).slice(start, end),
    reading: (only?.tagName === "RUBY" && only.querySelector("rt")?.textContent) || "",
    offsets: [start, end] as [number, number],
  };
}

/** The window selection when a viewport point lies on its painted bands, or null. */
function selectionAtPoint(editor: HTMLElement, x: number, y: number) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  return isOnRange(editor, range, x, y) ? range : null;
}

function isOnRange(editor: HTMLElement, range: Range, x: number, y: number) {
  return selectionBands(editor, range).some(
    (band) => x >= band.left && x <= band.right && y >= band.top && y <= band.bottom,
  );
}

/** Mark the word last tapped to read, since touch screens have no hover to show it. */
function markTappedWord(editor: HTMLElement, word: HTMLElement | null) {
  editor.querySelectorAll(".word.tapped").forEach((element) => element.classList.remove("tapped"));
  word?.classList.add("tapped");
}

/** A range between two source offsets, in either order. */
function offsetRange(editor: HTMLElement, [anchor, focus]: [number, number]) {
  const range = document.createRange();
  range.setStart(...caretPosition(editor, Math.min(anchor, focus)));
  range.setEnd(...caretPosition(editor, Math.max(anchor, focus)));
  return range;
}

function placeOverlays(
  editor: HTMLElement,
  caret: HTMLElement,
  highlights: HTMLElement,
  toolbar: HTMLElement | null,
  touchSelection: [number, number] | null,
) {
  const selection = window.getSelection();
  const range = touchSelection
    ? offsetRange(editor, touchSelection)
    : selection?.rangeCount
      ? selection.getRangeAt(0)
      : null;
  const bands = paintSelection(editor, highlights, range);
  if (toolbar) placeToolbar(toolbar, bands);
  if (
    document.activeElement !== editor ||
    !range ||
    !range.collapsed ||
    !editor.contains(range.startContainer) ||
    !caret.parentElement
  ) {
    caret.hidden = true;
    return;
  }

  const { x, y } = caretPoint(editor, range);
  const page = caret.parentElement;
  const origin = page.getBoundingClientRect();
  const fontSize = parseFloat(getComputedStyle(editor).fontSize);
  caret.hidden = false;
  caret.style.width = caret.style.height = `${fontSize}px`;
  caret.style.transform = `translate(${x - origin.left + page.scrollLeft}px, ${y - origin.top + page.scrollTop - fontSize / 2}px)`;
  // Hold the caret solid while it moves, then resume blinking.
  caret.getAnimations().forEach((animation) => (animation.currentTime = 0));
}

function App() {
  const pageRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const highlightsRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  // Touch screens keep the app's own selection, as source offsets, so the system's never shows.
  const touchSelectionRef = useRef<[number, number] | null>(null);
  const pressedSelectionRef = useRef(false);
  // Like vim: normal mode only reads text aloud, and i or a returns to insert mode.
  const [mode, setMode] = useState<"insert" | "normal">("insert");
  // Text starts at the top left; Cmd+E toggles centering it on the screen.
  const [layout, setLayout] = useState<"start" | "center">("start");
  const savedCaretRef = useRef<number | null>(null);
  const savedSelectionRef = useRef<[number, number] | null>(null);
  const selectAllRef = useRef(false);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const correctionInputRef = useRef<HTMLInputElement>(null);
  // The words being corrected stay highlighted while their reading is typed, which moves the selection away.
  const correctionRef = useRef<{ word: string; offsets: [number, number]; touch: boolean } | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState<string | null>(null);
  // Bumped after a correction is saved, to annotate the text again.
  const [readingsVersion, setReadingsVersion] = useState(0);

  const repaintOverlays = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !caretRef.current || !highlightsRef.current) return;
    const correction = correctionRef.current;
    // Some input methods select the text being composed; only a selection the user made gets the tools.
    if (composingRef.current && toolbarRef.current) toolbarRef.current.hidden = true;
    placeOverlays(
      editor,
      caretRef.current,
      highlightsRef.current,
      correction || composingRef.current ? null : toolbarRef.current,
      correction?.offsets ?? touchSelectionRef.current,
    );
  }, []);

  function closeCorrection(restoreSelection: boolean) {
    const correction = correctionRef.current;
    const editor = editorRef.current;
    if (!correction || !editor) return;
    correctionRef.current = null;
    setCorrectionDraft(null);
    // Select the words again, so their tools return and show the new reading.
    if (restoreSelection && !correction.touch) {
      if (editor.isContentEditable) editor.focus({ preventScroll: true });
      const range = offsetRange(editor, correction.offsets);
      window.getSelection()?.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
    }
    repaintOverlays();
  }

  async function saveCorrection(event: FormEvent) {
    event.preventDefault();
    const correction = correctionRef.current;
    if (!correction || correctionDraft === null) return;
    try {
      const response = await fetch("/api/readings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: correction.word, reading: correctionDraft }),
      });
      if (!response.ok) throw new Error();
    } catch {
      console.error("Could not save the reading.");
      return;
    }
    if (correctionRef.current !== correction) return;
    closeCorrection(true);
    setReadingsVersion((version) => version + 1);
  }

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    function handleBeforeInput(event: InputEvent) {
      if (event.isComposing || composingRef.current || !editor) return;
      if (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward") {
        const backward = event.inputType === "deleteContentBackward";
        if (
          !(backward && deleteEditorEmptyLastLine(editor)) &&
          !deleteEditorRubyCharacter(editor, backward ? "backward" : "forward")
        )
          return;
      } else if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        if (!insertEditorLineBreak(editor)) return;
      } else return;
      event.preventDefault();
      setText(sourceText(editor));
    }

    editor.addEventListener("beforeinput", handleBeforeInput);
    editor.focus({ preventScroll: true });
    const observer = new MutationObserver(() => removeEditorLinks(editor));
    observer.observe(editor, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "color", "face", "size", "href"],
    });
    removeEditorLinks(editor);

    let frame = 0;
    function updateCaret() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(repaintOverlays);
    }
    // Center a single line, but align longer text to the left. Alignment never changes the width, so this settles.
    const resizeObserver = new ResizeObserver(() => {
      editor.classList.toggle("multiline", editor.clientHeight > parseFloat(getComputedStyle(editor).lineHeight) * 1.5);
      updateCaret();
    });
    resizeObserver.observe(editor);
    document.addEventListener("selectionchange", updateCaret);
    editor.addEventListener("focus", updateCaret);
    editor.addEventListener("blur", updateCaret);
    editor.addEventListener("input", updateCaret);
    window.addEventListener("resize", updateCaret);
    void document.fonts.ready.then(updateCaret);
    updateCaret();

    return () => {
      editor.removeEventListener("beforeinput", handleBeforeInput);
      observer.disconnect();
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      document.removeEventListener("selectionchange", updateCaret);
      editor.removeEventListener("focus", updateCaret);
      editor.removeEventListener("blur", updateCaret);
      editor.removeEventListener("input", updateCaret);
      window.removeEventListener("resize", updateCaret);
    };
  }, [repaintOverlays]);

  useEffect(() => {
    if (!text.trim()) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/annotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<{ segments: ReadingSegment[] }>;
        })
        .then(({ segments }) => {
          const editor = editorRef.current;
          if (!editor || controller.signal.aborted || composingRef.current || sourceText(editor) !== text) return;

          const focused = document.activeElement === editor;
          const selection = window.getSelection();
          const anchor = selection?.anchorNode;
          const focus = selection?.focusNode;
          const savedSelection =
            focused && anchor && focus && editor.contains(anchor) && editor.contains(focus)
              ? [caretOffset(editor, anchor, selection.anchorOffset), caretOffset(editor, focus, selection.focusOffset)]
              : null;

          renderReadings(editor, segments);

          if (focused) {
            editor.focus({ preventScroll: true });
            if (savedSelection) {
              const [anchorNode, anchorOffset] = caretPosition(editor, savedSelection[0]);
              const [focusNode, focusOffset] = caretPosition(editor, savedSelection[1]);
              window.getSelection()?.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
            }
          }
          repaintOverlays();
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            console.error("Could not add readings.");
          }
        });
    }, 120);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, readingsVersion, repaintOverlays]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (mode === "insert") {
      editor.focus({ preventScroll: true });
      if (selectAllRef.current) {
        window.getSelection()?.selectAllChildren(editor);
      } else if (savedSelectionRef.current) {
        const [anchorNode, anchorOffset] = caretPosition(editor, savedSelectionRef.current[0]);
        const [focusNode, focusOffset] = caretPosition(editor, savedSelectionRef.current[1]);
        window.getSelection()?.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
      } else if (savedCaretRef.current !== null) {
        const [node, offset] = caretPosition(editor, savedCaretRef.current);
        window.getSelection()?.setBaseAndExtent(node, offset, node, offset);
      }
      selectAllRef.current = false;
      savedSelectionRef.current = null;
      savedCaretRef.current = null;
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!editor || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement) return;
      if (event.key !== "i" && event.key !== "a") return;
      event.preventDefault();

      // Insert at the last clicked or edited position; a moves past the character there.
      const source = sourceText(editor);
      const selection = window.getSelection();
      const focus = selection?.focusNode;
      let offset =
        focus && editor.contains(focus)
          ? caretOffset(editor, focus, selection.focusOffset)
          : (savedCaretRef.current ?? source.length);
      if (event.key === "a" && offset < source.length && source[offset] !== "\n") {
        offset += source.codePointAt(offset)! > 0xffff ? 2 : 1;
      }
      savedCaretRef.current = offset;
      setMode("insert");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.isComposing) return;
      // Escape stops speech in either mode; the editor also uses it to leave insert mode.
      if (event.key === "Escape") stopPronunciation();
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "e") {
        event.preventDefault();
        setLayout((layout) => (layout === "start" ? "center" : "start"));
      } else if (key === "a") {
        // Select all of the text for editing, from either mode, rather than the whole page.
        const editor = editorRef.current;
        if (!editor || event.target instanceof HTMLInputElement) return;
        event.preventDefault();
        if (editor.isContentEditable) {
          editor.focus({ preventScroll: true });
          window.getSelection()?.selectAllChildren(editor);
        } else {
          selectAllRef.current = true;
          setMode("insert");
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    const editor = editorRef.current;
    if (!page || !editor) return;

    // On touch screens the app handles every touch on the text itself, so the system's selection, handles,
    // magnifier and Cut/Copy menu never appear. One finger dragged across the text selects it, a tap on that
    // selection reads it, and two fingers scroll; a drag from the blank margins still scrolls natively.
    let start: { x: number; y: number; offset: number; target: Element; dragged: boolean } | null = null;
    let scrollY: number | null = null;

    const repaint = repaintOverlays;

    function handleTouchStart(event: TouchEvent) {
      if (start && event.touches.length === 2) {
        start = null;
        scrollY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        return;
      }
      start = null;
      scrollY = null;
      if (!editor || event.touches.length !== 1 || composingRef.current) return;
      if (!(event.target instanceof Element) || !editor.contains(event.target)) return;
      const touch = event.touches[0];
      const range = caretRangeAtPoint(editor, touch.clientX, touch.clientY);
      if (!range) return;
      // Cancelling the touch also keeps the editor's focus, so an open keyboard stays open.
      event.preventDefault();
      start = {
        x: touch.clientX,
        y: touch.clientY,
        offset: caretOffset(editor, range.startContainer, range.startOffset),
        target: event.target,
        dragged: false,
      };
    }

    function handleTouchMove(event: TouchEvent) {
      if (!page || !editor) return;
      if (scrollY !== null && event.touches.length === 2) {
        event.preventDefault();
        const y = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        page.scrollTop += scrollY - y;
        scrollY = y;
        return;
      }
      if (!start || event.touches.length !== 1) return;
      event.preventDefault();
      const touch = event.touches[0];
      // Leave small jitters as taps, which read words aloud.
      if (!start.dragged && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) < 8) return;
      if (!start.dragged) markTappedWord(editor, null);
      start.dragged = true;

      // Scroll while the finger is near the top or bottom edge, so the selection can grow past the screen.
      const bounds = page.getBoundingClientRect();
      const edge = 48;
      if (touch.clientY < bounds.top + edge) page.scrollTop -= edge / 4;
      else if (touch.clientY > bounds.bottom - edge) page.scrollTop += edge / 4;

      const range = caretRangeAtPoint(editor, touch.clientX, touch.clientY);
      if (!range) return;
      touchSelectionRef.current = [start.offset, caretOffset(editor, range.startContainer, range.startOffset)];
      repaint();
    }

    function handleTouchEnd(event: TouchEvent) {
      const tap = start && !start.dragged && event.type === "touchend" ? start : null;
      start = null;
      if (event.touches.length < 2) scrollY = null;
      if (!tap || !editor) return;
      const { clientX, clientY } = event.changedTouches[0];

      // A tap on the selection keeps it, since its tools read it; a tap anywhere else clears it.
      if (touchSelectionRef.current) {
        const range = offsetRange(editor, touchSelectionRef.current);
        if (isOnRange(editor, range, clientX, clientY)) return;
        touchSelectionRef.current = null;
        repaint();
      }

      // The cancelled touch produces no click, so replay it: tapping a word reads it, and tapping
      // other text while writing moves the caret there, as the browser would have.
      if (editor.isContentEditable && !tap.target.closest(".word")) {
        const range = caretRangeAtPoint(editor, clientX, clientY);
        editor.focus({ preventScroll: true });
        if (range)
          window.getSelection()?.setBaseAndExtent(range.startContainer, range.startOffset, range.startContainer, range.startOffset);
      }
      for (const type of ["mousedown", "mouseup", "click"]) {
        tap.target.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX, clientY, button: 0, detail: 1 }),
        );
      }
    }

    page.addEventListener("touchstart", handleTouchStart, { passive: false });
    page.addEventListener("touchmove", handleTouchMove, { passive: false });
    page.addEventListener("touchend", handleTouchEnd);
    page.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      page.removeEventListener("touchstart", handleTouchStart);
      page.removeEventListener("touchmove", handleTouchMove);
      page.removeEventListener("touchend", handleTouchEnd);
      page.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [repaintOverlays]);

  useEffect(repaintOverlays, [layout, repaintOverlays]);

  return (
    <div
      ref={pageRef}
      className="page"
      data-mode={mode}
      data-layout={layout}
      onMouseDown={(event) => {
        const editor = editorRef.current;
        pressRef.current = null;
        if (!editor || event.button !== 0 || composingRef.current) return;
        pressRef.current = { x: event.clientX, y: event.clientY };
        markTappedWord(editor, null);
        // A tap outside the text clears the touch selection, which would otherwise hide the caret.
        if (touchSelectionRef.current) {
          touchSelectionRef.current = null;
          repaintOverlays();
        }
        const target = event.target instanceof Element ? event.target : null;

        // Clicking a word reads it, so leave insert mode without showing the caret.
        if (target?.closest(".word") && editor.contains(target) && mode === "insert") {
          editor.blur();
          setMode("normal");
        }
      }}
      onClick={(event) => {
        const editor = editorRef.current;
        const press = pressRef.current;
        pressRef.current = null;
        if (!editor || !press || event.detail > 1 || composingRef.current) return;

        // Dragging selects text for editing, even when it started on a word that left insert mode.
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) {
          const selection = window.getSelection();
          const anchor = selection?.anchorNode;
          const focus = selection?.focusNode;
          if (mode === "normal" && anchor && focus && editor.contains(anchor) && editor.contains(focus)) {
            savedSelectionRef.current = [
              caretOffset(editor, anchor, selection.anchorOffset),
              caretOffset(editor, focus, selection.focusOffset),
            ];
            setMode("insert");
          }
          return;
        }

        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".word") && editor.contains(target)) return;

        // Clicking the blank after a paragraph, an empty line, or below the text continues writing there.
        const paragraphEnd = paragraphEndAtPoint(editor, event.clientX, event.clientY);
        if (paragraphEnd || isAfterText(editor, event.clientX, event.clientY)) {
          const offset = paragraphEnd
            ? caretOffset(editor, paragraphEnd.startContainer, paragraphEnd.startOffset)
            : sourceText(editor).length;
          // iOS opens the keyboard only for focus given during the tap itself, so make the editor
          // editable and focus it now, rather than after insert mode renders.
          editor.contentEditable = "true";
          const [node, nodeOffset] = caretPosition(editor, offset);
          editor.focus({ preventScroll: true });
          window.getSelection()?.setBaseAndExtent(node, nodeOffset, node, nodeOffset);
          if (mode === "normal") setMode("insert");
          return;
        }

        // Other blank space leaves editing, since the editor has lost focus.
        if (mode === "insert" && document.activeElement !== editor) setMode("normal");
      }}
    >
      <main
        ref={editorRef}
        className="paper"
        contentEditable={mode === "insert"}
        suppressContentEditableWarning
        role="textbox"
        aria-label="Japanese text"
        aria-multiline="true"
        lang="ja"
        spellCheck={false}
        onMouseDown={(event) => {
          pressedSelectionRef.current = false;
          if (event.button !== 0 || event.detail > 1 || composingRef.current) return;
          if (!selectionAtPoint(event.currentTarget, event.clientX, event.clientY)) return;
          // A click on the selection keeps it, rather than reading the word under it; its tools read it.
          event.preventDefault();
          pressedSelectionRef.current = true;
        }}
        onClick={(event) => {
          const pressedSelection = pressedSelectionRef.current;
          pressedSelectionRef.current = false;
          if (pressedSelection) return;
          if (composingRef.current || event.detail > 1 || !window.getSelection()?.isCollapsed) return;
          const target = event.target;
          if (!(target instanceof Element)) return;
          const word = target.closest<HTMLElement>(".word");
          if (word && event.currentTarget.contains(word)) {
            markTappedWord(event.currentTarget, word);
            pronounceJapanese(pronunciationText(word));
          }
        }}
        onKeyDown={(event) => {
          // Escape enters normal mode unless an input method is using it to cancel composition.
          if (event.key !== "Escape" || event.nativeEvent.isComposing || composingRef.current) return;
          event.preventDefault();
          const selection = window.getSelection();
          const focus = selection?.focusNode;
          const editor = event.currentTarget;
          savedCaretRef.current =
            focus && editor.contains(focus) ? caretOffset(editor, focus, selection.focusOffset) : null;
          editor.blur();
          setMode("normal");
        }}
        onPaste={(event) => {
          event.preventDefault();
          const pasted = event.clipboardData.getData("text/plain");
          if (pasted && insertEditorText(event.currentTarget, pasted)) {
            setText(sourceText(event.currentTarget));
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
          repaintOverlays();
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          setText(sourceText(event.currentTarget));
          repaintOverlays();
        }}
        onInput={(event) => {
          // Typing goes to the caret, so a touch selection would no longer match the text.
          touchSelectionRef.current = null;
          removeEditorLinks(event.currentTarget);
          if (!composingRef.current) setText(sourceText(event.currentTarget));
        }}
      />
      <div ref={highlightsRef} className="selection-layer" aria-hidden="true" />
      <div ref={caretRef} className="caret" aria-hidden="true" hidden />
      <div
        ref={toolbarRef}
        className="word-tools"
        hidden
        // Keep the selection and the page's own click handling out of the tools.
        onMouseDown={(event) => {
          event.stopPropagation();
          if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {correctionDraft === null ? (
          <>
            <button
              type="button"
              aria-label="Read aloud"
              title="Read aloud"
              onClick={() => {
                const editor = editorRef.current;
                const range = editor && selectedRange(editor, touchSelectionRef.current);
                if (range) pronounceJapanese(selectedPronunciation(range));
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9h4l5-4v14l-5-4H4z" />
                <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Correct the reading"
              title="Correct the reading"
              onClick={() => {
                const editor = editorRef.current;
                const range = editor && selectedRange(editor, touchSelectionRef.current);
                if (!editor || !range) return;
                const { word, reading, offsets } = selectedWords(editor, range);
                if (!word.trim() || word.includes("\n")) return;
                correctionRef.current = { word, offsets, touch: touchSelectionRef.current !== null };
                // Focus during the tap itself, or iOS will not open the keyboard.
                flushSync(() => setCorrectionDraft(reading));
                correctionInputRef.current?.focus({ preventScroll: true });
                correctionInputRef.current?.select();
                repaintOverlays();
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
                <path d="M13 7l4 4" />
              </svg>
            </button>
          </>
        ) : (
          <form onSubmit={saveCorrection}>
            <input
              ref={correctionInputRef}
              value={correctionDraft}
              onChange={(event) => setCorrectionDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                closeCorrection(true);
              }}
              onBlur={() => closeCorrection(false)}
              aria-label="Correct reading, in kana or English"
              maxLength={100}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            <button type="submit" aria-label="Save the reading" title="Save the reading">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 5v7a3 3 0 0 1-3 3H5" />
                <path d="M9 11l-4 4 4 4" />
              </svg>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default App;
