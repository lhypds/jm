import { useEffect, useRef, useState } from "react";
import type { ReadingSegment } from "../shared/types.ts";
import {
  caretOffset,
  caretPoint,
  caretPosition,
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
}

function placeOverlays(editor: HTMLElement, caret: HTMLElement, highlights: HTMLElement) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  paintSelection(editor, highlights, range);
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
  const editorRef = useRef<HTMLElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const highlightsRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const selectedPlaybackRef = useRef<string | null>(null);
  // Like vim: normal mode only reads text aloud, and i or a returns to insert mode.
  const [mode, setMode] = useState<"insert" | "normal">("insert");
  // Text starts at the top left; Cmd+E toggles centering it on the screen.
  const [layout, setLayout] = useState<"start" | "center">("start");
  const savedCaretRef = useRef<number | null>(null);
  const savedSelectionRef = useRef<[number, number] | null>(null);
  const selectAllRef = useRef(false);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");

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
      frame = requestAnimationFrame(() => {
        if (editor && caretRef.current && highlightsRef.current)
          placeOverlays(editor, caretRef.current, highlightsRef.current);
      });
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
  }, []);

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
          if (caretRef.current && highlightsRef.current) placeOverlays(editor, caretRef.current, highlightsRef.current);
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
  }, [text]);

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
        if (!editor) return;
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
    if (editorRef.current && caretRef.current && highlightsRef.current)
      placeOverlays(editorRef.current, caretRef.current, highlightsRef.current);
  }, [layout]);

  return (
    <div
      className="page"
      data-mode={mode}
      data-layout={layout}
      onMouseDown={(event) => {
        const editor = editorRef.current;
        pressRef.current = null;
        if (!editor || event.button !== 0 || composingRef.current) return;
        pressRef.current = { x: event.clientX, y: event.clientY };
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
          if (mode === "insert") {
            const [node, nodeOffset] = caretPosition(editor, offset);
            editor.focus({ preventScroll: true });
            window.getSelection()?.setBaseAndExtent(node, nodeOffset, node, nodeOffset);
          } else {
            savedCaretRef.current = offset;
            setMode("insert");
          }
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
          selectedPlaybackRef.current = null;
          if (event.button !== 0 || event.detail > 1 || composingRef.current) return;
          const selection = window.getSelection();
          if (!selection || selection.isCollapsed || !selection.rangeCount) return;
          const range = selection.getRangeAt(0);
          if (!event.currentTarget.contains(range.commonAncestorContainer)) return;
          const inside = Array.from(range.getClientRects()).some(
            (rect) =>
              event.clientX >= rect.left &&
              event.clientX <= rect.right &&
              event.clientY >= rect.top &&
              event.clientY <= rect.bottom,
          );
          if (!inside) return;
          event.preventDefault();
          selectedPlaybackRef.current = selectedPronunciation(range);
        }}
        onClick={(event) => {
          const selectedText = selectedPlaybackRef.current;
          selectedPlaybackRef.current = null;
          if (selectedText && !composingRef.current && event.detail === 1) {
            pronounceJapanese(selectedText);
            return;
          }
          if (composingRef.current || event.detail > 1 || !window.getSelection()?.isCollapsed) return;
          const target = event.target;
          if (!(target instanceof Element)) return;
          const word = target.closest<HTMLElement>(".word");
          if (word && event.currentTarget.contains(word)) pronounceJapanese(pronunciationText(word));
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
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          setText(sourceText(event.currentTarget));
        }}
        onInput={(event) => {
          removeEditorLinks(event.currentTarget);
          if (!composingRef.current) setText(sourceText(event.currentTarget));
        }}
      />
      <div ref={highlightsRef} className="selection-layer" aria-hidden="true" />
      <div ref={caretRef} className="caret" aria-hidden="true" hidden />
    </div>
  );
}

export default App;
