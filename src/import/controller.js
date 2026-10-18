export class ImportController {
  constructor() {
    this.generation = 0;
    /** @type {AbortController | null} */ this.abortController = null;
  }

  /**
   * @template T
   * @param {(signal: AbortSignal) => Promise<T>} read
   * @param {(value: T) => void} commit
   */
  async run(read, commit) {
    this.cancel();
    const generation = this.generation;
    this.abortController = new AbortController();
    try {
      const result = await read(this.abortController.signal);
      if (generation !== this.generation) return false;
      commit(result);
      return true;
    } catch (error) {
      if (generation === this.generation) throw error;
      return false;
    } finally {
      if (generation === this.generation) this.abortController = null;
    }
  }

  cancel() {
    this.generation++;
    this.abortController?.abort();
    this.abortController = null;
  }
}
