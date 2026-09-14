// A tiny keyed JSON store on disk, shared by the per-topic caches.
//
// Three properties matter and every caller needs them:
//   - the path is resolved lazily, because tests redirect it with
//     ZHIBIAN_DATA_DIR before the first read;
//   - writes go through a temp file + rename, so a crash cannot leave a
//     half-written store behind;
//   - writes are serialised through one queue, so two concurrent saves cannot
//     clobber each other.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function dataFile(name) {
  const dir = process.env.ZHIBIAN_DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url));
  return path.join(dir, name);
}

export function createJsonStore({ name, limit = 200, label = name }) {
  const debug = (...args) => { if (process.env.ZHIBIAN_DEBUG) console.error('[' + label + ']', ...args); };
  let cache = null;
  let queue = Promise.resolve();

  async function read() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(await readFile(dataFile(name), 'utf8'));
      cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      if (error.code !== 'ENOENT') debug('read failed', error.message);
      cache = {};
    }
    return cache;
  }

  async function write(next) {
    const file = dataFile(name);
    await mkdir(path.dirname(file), { recursive: true });
    const temp = file + '.' + process.pid + '.tmp';
    await writeFile(temp, JSON.stringify(next, null, 2), 'utf8');
    await rename(temp, file);
    cache = next;
  }

  /** Upserts one key; oldest entries (by `at`) fall off past the limit. */
  function put(key, value) {
    queue = queue.then(async () => {
      const store = await read();
      const next = { ...store, [key]: value };
      const keys = Object.keys(next);
      if (keys.length > limit) {
        const oldest = keys.sort((a, b) => String(next[a]?.at || '').localeCompare(String(next[b]?.at || '')));
        for (const drop of oldest.slice(0, keys.length - limit)) delete next[drop];
      }
      await write(next);
    }).catch(error => { debug('write failed', error.message); });
    return queue;
  }

  /** Empties the store — for tests and for starting over. */
  function reset() {
    queue = queue.then(async () => {
      cache = {};
      await write({});
    }).catch(error => { debug('reset failed', error.message); });
    return queue;
  }

  return { read, put, reset };
}
