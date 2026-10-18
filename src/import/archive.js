import { Gunzip, unzipSync } from 'fflate';
import { LIMITS } from '../config.js';

export const MAX_FILE_SIZE = LIMITS.fileBytes;
const xmlLimitError = () => new Error('The rocket XML exceeds the 12 MB limit.');

/** @param {Uint8Array} bytes */
function decompressGzip(bytes) {
  if (bytes.length < 18) throw new Error('The GZIP design is truncated.');
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  const stream = new Gunzip((chunk) => {
    size += chunk.length;
    if (size > LIMITS.xmlBytes) throw xmlLimitError();
    chunks.push(chunk.slice());
  });
  // Small compressed chunks bound allocations even when the footer size is forged.
  for (let offset = 0; offset < bytes.length; offset += 4096) {
    stream.push(bytes.subarray(offset, offset + 4096), offset + 4096 >= bytes.length);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** @param {string} xml */
export function validateXMLSource(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('The OpenRocket design is empty.');
  if (new TextEncoder().encode(xml).byteLength > LIMITS.xmlBytes) throw xmlLimitError();
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error('XML document types and custom entities are not supported.');
}

/** @param {Uint8Array | ArrayBuffer} input */
export function decodeOrk(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.length || bytes.length > LIMITS.fileBytes)
    throw new Error('Choose an OpenRocket file smaller than 20 MB.');
  /** @type {Uint8Array} */
  let content = bytes;
  try {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      let selected = 0;
      const entries = unzipSync(bytes, {
        filter(entry) {
          if (!/(^|\/)rocket\.ork$/i.test(entry.name)) return false;
          if (++selected > 1) throw new Error('The archive contains multiple rocket.ork designs.');
          if (entry.originalSize > LIMITS.xmlBytes) throw xmlLimitError();
          return true;
        },
      });
      const entry = Object.values(entries)[0];
      if (!entry)
        throw new Error('The archive does not contain rocket.ork. Export a design from OpenRocket.');
      content = entry;
    } else if (bytes[0] === 0x1f && bytes[1] === 0x8b) content = decompressGzip(bytes);
    if (content.length > LIMITS.xmlBytes) throw xmlLimitError();
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(content);
    validateXMLSource(xml);
    return xml;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown archive error';
    if (/12 MB|multiple rocket|does not contain|document types|empty|truncated/.test(message)) throw error;
    throw new Error(`The OpenRocket file is damaged or cannot be decoded: ${message}`, { cause: error });
  }
}
