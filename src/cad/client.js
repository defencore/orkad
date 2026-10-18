import { CAD } from '../config.js';

/** @typedef {{id: number, buffer: ArrayBuffer, solids: number}} CadResult */

export class CadClient {
  /** @param {() => Worker} createWorker */
  constructor(createWorker, timeout = CAD.exportTimeout) {
    this.createWorker = createWorker;
    this.timeout = timeout;
    this.sequence = 0;
    /** @type {Worker | null} */
    this.worker = null;
    /** @type {{id: number, timer: ReturnType<typeof setTimeout> | null, finish: (error?: unknown, result?: CadResult | null, reset?: boolean) => void} | null} */
    this.active = null;
  }

  /**
   * @param {'step' | 'stl'} kind
   * @param {unknown} payload
   * @param {string | undefined} partId
   * @param {(message: string) => void} onProgress
   * @returns {Promise<CadResult>}
   */
  export(kind, payload, partId, onProgress = () => {}) {
    if (this.active) return Promise.reject(new Error('A CAD export is already running.'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      /** @param {unknown} [error] @param {CadResult | null} [result] */
      const finish = (error, result, reset = false) => {
        if (this.active?.id !== id) return;
        if (this.active.timer !== null) clearTimeout(this.active.timer);
        this.active = null;
        if (reset) {
          this.worker?.terminate();
          this.worker = null;
        }
        if (error) reject(error);
        else if (result) resolve(result);
      };
      this.active = { id, finish, timer: null };
      try {
        if (!this.worker) this.worker = this.createWorker();
        this.worker.onmessage = ({ data }) => {
          if (data?.id !== this.active?.id) return;
          if (typeof data.progress === 'string') {
            onProgress(data.progress);
            return;
          }
          if (data.error) finish(new Error(String(data.error)));
          else if (
            !(data.buffer instanceof ArrayBuffer) ||
            !data.buffer.byteLength ||
            !Number.isInteger(data.solids) ||
            data.solids < 1
          )
            finish(new Error('The CAD engine returned an invalid export.'), null, true);
          else finish(null, data);
        };
        this.worker.onerror = this.worker.onmessageerror = () =>
          finish(
            new Error('The CAD engine could not start. Try again, or use the FreeCAD script.'),
            null,
            true,
          );
        this.active.timer = setTimeout(
          () =>
            finish(
              new Error('CAD export timed out. Try a lower profile resolution or use the FreeCAD script.'),
              null,
              true,
            ),
          this.timeout,
        );
        this.worker.postMessage({ id, kind, payload, partId });
      } catch (error) {
        finish(error, null, true);
      }
    });
  }

  dispose() {
    this.active?.finish(new Error('CAD export was cancelled.'), null, true);
    this.worker?.terminate();
    this.worker = null;
  }
}
