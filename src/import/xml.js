import { validateXMLSource } from './archive.js';

export const childElements = (element) =>
  Array.from(element?.childNodes || []).filter((node) => node.nodeType === 1);
export const child = (element, tag) =>
  childElements(element).find((node) => node.tagName.toLowerCase() === tag);
export const text = (element, tag, fallback = '') => child(element, tag)?.textContent.trim() ?? fallback;
export const boolean = (element, tag) => text(element, tag) === 'true';

export function number(element, tag, fallback = 0) {
  const raw = text(element, tag);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Error(`Invalid ${tag} in ${text(element, 'name', element.tagName)}.`);
  return value;
}

export const millimetres = (element, tag, fallback = 0) => number(element, tag, fallback / 1000) * 1000;

export function parseDocument(xml, Parser = globalThis.DOMParser) {
  validateXMLSource(xml);
  if (!Parser) throw new Error('An XML parser is required to import OpenRocket designs.');
  let document;
  try {
    document = new Parser().parseFromString(xml, 'application/xml');
  } catch {
    throw new Error('This is not a valid OpenRocket XML document.');
  }
  if (
    document.getElementsByTagName('parsererror').length ||
    document.documentElement?.tagName !== 'openrocket'
  ) {
    throw new Error('This is not a valid OpenRocket XML document.');
  }
  const root = child(document.documentElement, 'rocket');
  if (!root) throw new Error('No rocket design was found in this file.');
  return { document, root };
}
