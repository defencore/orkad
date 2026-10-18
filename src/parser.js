import { parseDocument } from './import/xml.js';
import { readComponents } from './import/components.js';
import { placeComponents } from './import/layout.js';
import { resolveDimensions } from './import/dimensions.js';
import { expandAssembly } from './import/assembly.js';
export { decodeOrk, MAX_FILE_SIZE } from './import/archive.js';

export function parseOrk(xml, Parser = globalThis.DOMParser) {
  const { document, root: rootElement } = parseDocument(xml, Parser);
  const warnings = new Set();
  const warn = (message) => warnings.add(message);
  const { root, nodes } = readComponents(rootElement, warn);
  placeComponents(root, nodes);
  resolveDimensions(nodes, warn);
  const assembly = expandAssembly(root, nodes, warn);
  return {
    ...assembly,
    name: root.name,
    warnings: [...warnings],
    creator: document.documentElement.getAttribute('creator') || 'OpenRocket',
    version: document.documentElement.getAttribute('version') || 'unknown',
  };
}
