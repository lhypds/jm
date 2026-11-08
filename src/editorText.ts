const blockTags = new Set(["DIV", "P"]);

/** Parts of the editor that are not text: ruby readings, the tail placeholder, and notes such as a translation. */
export function isEditorDecoration(node: Node): boolean {
  return (
    node instanceof HTMLElement &&
    (node.tagName === "RT" || node.hasAttribute("data-editor-tail") || node.hasAttribute("data-editor-note"))
  );
}

/** Read editable DOM without ruby readings, preserving hard line breaks. */
export function editorText(root: Node): string {
  if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? "";
  if (root instanceof HTMLElement) {
    if (isEditorDecoration(root)) return "";
    if (root.tagName === "BR") return "\n";
  }

  const children = Array.from(root.childNodes).filter((child) => !isEditorDecoration(child));

  // Browsers use a lone <br> to keep an otherwise empty paragraph editable.
  if (children.length === 1 && children[0] instanceof HTMLElement && children[0].tagName === "BR") return "";

  let text = "";
  let previousWasBlock = false;
  children.forEach((child, index) => {
    const isBlock = child instanceof HTMLElement && blockTags.has(child.tagName);
    // A final <br> after a hard break only keeps the empty last line visible, like the editor tail.
    // Copied ranges are excluded: their last <br> may be a real break before later text.
    if (
      !(root instanceof DocumentFragment) &&
      index === children.length - 1 &&
      child instanceof HTMLElement &&
      child.tagName === "BR" &&
      text.endsWith("\n")
    )
      return;
    if (index > 0 && (isBlock || previousWasBlock)) text += "\n";
    text += editorText(child);
    previousWasBlock = isBlock;
  });
  return text;
}
