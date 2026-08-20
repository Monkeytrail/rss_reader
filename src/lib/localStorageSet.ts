export interface StoredSet {
  has(id: string): boolean;
  add(id: string): void;
  remove(id: string): void;
  all(): string[];
  count(): number;
}

export function createStoredSet(storageKey: string, maxEntries: number): StoredSet {
  function get(): Set<string> {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  }

  function save(set: Set<string>): void {
    localStorage.setItem(storageKey, JSON.stringify([...set]));
  }

  return {
    has(id) {
      return get().has(id);
    },
    add(id) {
      const set = get();
      set.add(id);
      if (set.size > maxEntries) {
        const arr = [...set];
        save(new Set(arr.slice(arr.length - maxEntries)));
      } else {
        save(set);
      }
    },
    remove(id) {
      const set = get();
      set.delete(id);
      save(set);
    },
    all() {
      return [...get()];
    },
    count() {
      return get().size;
    },
  };
}
