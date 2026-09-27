export function resolveThreadInvalidationDebounce(isCoarsePointer: boolean): {
  debounceMs: number;
  maxWaitMs: number;
} {
  return isCoarsePointer
    ? { debounceMs: 150, maxWaitMs: 400 }
    : { debounceMs: 50, maxWaitMs: 200 };
}
