export interface VisibleTextBuffer {
  visibleChunks: string[];
  visibleLength: number;
  visibleTextCache: string | null;
}

function appendVisibleSegment(buffer: VisibleTextBuffer, text: string): void {
  if (text.length === 0) {
    return;
  }
  buffer.visibleChunks.push(text);
  buffer.visibleLength += text.length;
  if (buffer.visibleTextCache !== null) {
    buffer.visibleTextCache += text;
  }
}

export function createVisibleTextBuffer(): VisibleTextBuffer {
  return {
    visibleChunks: [],
    visibleLength: 0,
    visibleTextCache: null,
  };
}

export function appendVisibleTextBuffer(
  buffer: VisibleTextBuffer,
  delta: string,
): boolean {
  if (delta.length === 0) {
    return false;
  }
  appendVisibleSegment(buffer, delta);
  return true;
}

export function setVisibleTextBuffer(
  buffer: VisibleTextBuffer,
  text: string,
): boolean {
  const changed = getVisibleTextBufferFullText(buffer) !== text;
  buffer.visibleChunks = text.length > 0 ? [text] : [];
  buffer.visibleLength = text.length;
  buffer.visibleTextCache = text;
  return changed;
}

export function flushVisibleTextBuffer(_buffer: VisibleTextBuffer): boolean {
  return false;
}

export function getVisibleTextBufferFullLength(
  buffer: VisibleTextBuffer,
): number {
  return buffer.visibleLength;
}

export function getVisibleTextBufferFullText(
  buffer: VisibleTextBuffer,
): string {
  return getVisibleTextBufferText(buffer) ?? "";
}

export function getVisibleTextBufferText(
  buffer: VisibleTextBuffer,
): string | undefined {
  if (buffer.visibleLength === 0) {
    return undefined;
  }
  if (buffer.visibleTextCache === null) {
    buffer.visibleTextCache = buffer.visibleChunks.join("");
  }
  return buffer.visibleTextCache;
}
