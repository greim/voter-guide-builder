import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Every stage writes its output under cache/<pdf-hash>/. A stage whose output
// file already exists is skipped, so deleting one file re-runs just that piece.

export class Cache {
  constructor(readonly dir: string) {}

  path(...parts: string[]): string {
    return join(this.dir, ...parts);
  }

  async has(...parts: string[]): Promise<boolean> {
    try {
      await stat(this.path(...parts));
      return true;
    } catch {
      return false;
    }
  }

  async readJson<T>(...parts: string[]): Promise<T> {
    return JSON.parse(await readFile(this.path(...parts), 'utf8')) as T;
  }

  async writeJson(value: unknown, ...parts: string[]): Promise<void> {
    await this.writeText(JSON.stringify(value, null, 2) + '\n', ...parts);
  }

  async writeText(text: string | Uint8Array, ...parts: string[]): Promise<void> {
    const file = this.path(...parts);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }

  /** Returns the cached JSON if present, otherwise computes, stores and returns it. */
  async json<T>(parts: string[], compute: () => Promise<T>): Promise<T> {
    if (await this.has(...parts)) return this.readJson<T>(...parts);
    const value = await compute();
    await this.writeJson(value, ...parts);
    return value;
  }
}
