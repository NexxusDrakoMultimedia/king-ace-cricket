// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Storage for saved matches and custom teams.
 *
 * The app talks to the async `Store` interface only, so the browser's
 * localStorage backend here can later be swapped for a server-backed one
 * (for example Cloudflare D1 or KV behind a small API) without touching the UI.
 */

/** The slice of the Web Storage API we use, so tests can pass a fake. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryKV implements KV {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

export interface Store<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  save(item: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export class KVStore<T extends { id: string }> implements Store<T> {
  private kv: KV;
  private key: string;
  private parse: (x: unknown) => T | null;

  /** `parse` validates each stored item; anything invalid is dropped, never thrown. */
  constructor(kv: KV, key: string, parse: (x: unknown) => T | null) {
    this.kv = kv;
    this.key = key;
    this.parse = parse;
  }

  private read(): T[] {
    let raw: string | null;
    try {
      raw = this.kv.getItem(this.key);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const arr: unknown = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      const out: T[] = [];
      for (const x of arr) {
        const item = this.parse(x);
        if (item) out.push(item);
      }
      return out;
    } catch {
      return [];
    }
  }

  private write(items: T[]): void {
    try {
      this.kv.setItem(this.key, JSON.stringify(items));
    } catch {
      throw new Error("Could not save: browser storage is full or unavailable.");
    }
  }

  async list(): Promise<T[]> {
    return this.read();
  }
  async get(id: string): Promise<T | undefined> {
    return this.read().find((x) => x.id === id);
  }
  async save(item: T): Promise<void> {
    const items = this.read();
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = item;
    else items.push(item);
    this.write(items);
  }
  async remove(id: string): Promise<void> {
    this.write(this.read().filter((x) => x.id !== id));
  }
}

export const MATCHES_KEY = "kac:v1:matches";
export const TEAMS_KEY = "kac:v1:teams";
export const COMPETITIONS_KEY = "kac:v1:competitions";
export const SYSTEMS_KEY = "kac:v1:systems";
