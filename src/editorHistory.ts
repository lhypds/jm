/** The editor's text and selection, as source offsets, at one moment. */
export type EditorSnapshot = { text: string; selection: [number, number] | null };

const maxEntries = 200;
/** Edits of one kind this close together undo as one step, like a burst of typing. */
const groupWindow = 1000;

/**
 * Undo history kept by the app, since the browser's own breaks whenever the readings are rendered.
 * A snapshot is recorded before each edit; undo returns to it and redo to the state undone from.
 */
export class EditorHistory {
  private undoStack: EditorSnapshot[] = [];
  private redoStack: EditorSnapshot[] = [];
  private last: { time: number; group: string | null } = { time: 0, group: null };

  /** Record the state before an edit. A group names edits that merge with the previous one of the same group. */
  record(before: EditorSnapshot, group: string | null, now = Date.now()) {
    this.redoStack = [];
    const top = this.undoStack.at(-1);
    // Nothing changed since the last record: only the selection moved on, and that is what undo restores.
    if (top && top.text === before.text) {
      top.selection = before.selection;
      this.last = { time: now, group };
      return;
    }
    if (group && group === this.last.group && now - this.last.time < groupWindow && top) {
      this.last.time = now;
      return;
    }
    this.undoStack.push(before);
    if (this.undoStack.length > maxEntries) this.undoStack.shift();
    this.last = { time: now, group };
  }

  /** The state to return to from the current one, or null with nothing to undo. */
  undo(current: EditorSnapshot): EditorSnapshot | null {
    this.last = { time: 0, group: null };
    while (this.undoStack.length) {
      const snapshot = this.undoStack.pop()!;
      if (snapshot.text === current.text) continue;
      this.redoStack.push(current);
      return snapshot;
    }
    return null;
  }

  /** The state undone from most recently, or null with nothing to redo. */
  redo(current: EditorSnapshot): EditorSnapshot | null {
    this.last = { time: 0, group: null };
    while (this.redoStack.length) {
      const snapshot = this.redoStack.pop()!;
      if (snapshot.text === current.text) continue;
      this.undoStack.push(current);
      return snapshot;
    }
    return null;
  }
}
