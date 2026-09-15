// Bookkeeping for the Zhihu hot-list API's daily quota.
//
// The hot list is a separate, small daily quota (100 calls on this account), and
// every lobby load used to be able to spend one. The server now fetches it only a
// few times per Beijing calendar day; this module holds the date helpers and the
// place where the call count lives. The production server keeps it on disk so a
// restart or a deploy cannot spend the quota again; tests use the in-memory one
// so separate handlers do not share state.
import { createJsonStore } from './json-store.mjs';

const DAY = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET = 8 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' in Beijing time — the day the open-platform quota resets on. */
export const beijingDay = ms => new Date(ms + BEIJING_OFFSET).toISOString().slice(0, 10);

/** The next 00:00 Beijing time after `ms`, as a timestamp. */
export const nextBeijingMidnight = ms => Math.floor((ms + BEIJING_OFFSET) / DAY) * DAY + DAY - BEIJING_OFFSET;

export function memoryHotState() {
  const state = {};
  return { load: async () => state, save: async () => {} };
}

export function fileHotState({ name = 'hot-usage.json' } = {}) {
  const store = createJsonStore({ name, label: 'hot-usage' });
  let state = null;
  return {
    async load() {
      if (!state) {
        const saved = (await store.read()).hot;
        state = saved && typeof saved === 'object' ? { ...saved } : {};
      }
      return state;
    },
    save() {
      return store.put('hot', { ...state, at: new Date().toISOString() });
    }
  };
}
