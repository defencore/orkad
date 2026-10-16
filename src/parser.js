import { gunzipSync, strFromU8, unzipSync } from 'fflate';
import { SHAPES, radiusAt } from './profiles.js';

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_XML_SIZE = 12 * 1024 * 1024;
const GROUPS = new Set(['rocket', 'stage', 'axialstage', 'parallelstage', 'podset', 'assembly']);
const INSTANCED_GROUPS = new Set(['parallelstage', 'podset']);
const RADIAL = new Set(['nosecone', 'bodytube', 'transition', 'innertube', 'tubecoupler', 'centeringring', 'bulkhead', 'engineblock', 'launchlug']);
const FINS = new Set(['trapezoidfinset', 'ellipticalfinset', 'freeformfinset']);
const INTERNAL = new Set(['innertube', 'tubecoupler', 'centeringring', 'bulkhead', 'engineblock']);
const children = (el) => Array.from(el?.childNodes || []).filter((n) => n.nodeType === 1);
const child = (el, tag) => children(el).find((n) => n.tagName.toLowerCase() === tag);
const text = (el, tag, fallback = '') => child(el, tag)?.textContent.trim() ?? fallback;
const boolean = (el, tag) => text(el, tag) === 'true';
function number(el, tag, fallback = 0) {
  const raw = text(el, tag);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${tag} in ${text(el, 'name', el.tagName)}.`);
  return value;
}
const mm = (el, tag, fallback = 0) => number(el, tag, fallback / 1000) * 1000;

export function decodeOrk(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.length || bytes.length > MAX_FILE_SIZE) throw new Error('Choose an OpenRocket file smaller than 20 MB.');
  let xml;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = unzipSync(bytes, { filter: (entry) => {
      const match = /(^|\/)rocket\.ork$/i.test(entry.name);
      if (match && entry.originalSize > MAX_XML_SIZE) throw new Error('The rocket XML exceeds the 12 MB limit.');
      return match;
    } });
    const key = Object.keys(entries).find((name) => /(^|\/)rocket\.ork$/i.test(name));
    if (!key) throw new Error('The archive does not contain rocket.ork. Export a design from OpenRocket.');
    xml = strFromU8(entries[key]);
  } else if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 4, true);
    if (size > MAX_XML_SIZE) throw new Error('The rocket XML exceeds the 12 MB limit.');
    xml = strFromU8(gunzipSync(bytes));
  } else xml = strFromU8(bytes);
  if (xml.length > MAX_XML_SIZE) throw new Error('The rocket XML exceeds the 12 MB limit.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML document types and custom entities are not supported.');
  return xml;
}

export function parseOrk(xml, Parser = globalThis.DOMParser) {
  const doc = new Parser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement?.tagName !== 'openrocket') throw new Error('This is not a valid OpenRocket XML document.');
  const rootEl = child(doc.documentElement, 'rocket');
  if (!rootEl) throw new Error('No rocket design was found in this file.');
  const warnings = [];
  const nodes = [];
  let nextId = 0;
  const warn = (message) => { if (!warnings.includes(message)) warnings.push(message); };
  function read(el, parent = null, depth = 0) {
    if (depth > 32 || nodes.length >= 1500) throw new Error('The design exceeds the supported component count or nesting depth.');
    const type = el.tagName.toLowerCase();
    const node = { id: `part-${nextId++}`, type, name: text(el, 'name', type), parentId: parent?.id ?? null, children: [], supported: GROUPS.has(type) || RADIAL.has(type) || FINS.has(type), internal: INTERNAL.has(type), sourceId: text(el, 'id') };
    nodes.push(node);
    node.length = mm(el, 'length');
    node.thickness = text(el, 'thickness') === 'filled' ? 1 : mm(el, 'thickness', type === 'bulkhead' ? node.length : 1);
    node.filled = boolean(el, 'filled') || text(el, 'thickness') === 'filled';
    node.material = text(el, 'material');
    node.position = child(el, 'axialoffset') || child(el, 'position');
    node.method = node.position?.getAttribute('method') || node.position?.getAttribute('type') || (GROUPS.has(type) || ['bodytube', 'nosecone', 'transition'].includes(type) ? 'after' : 'top');
    node.offset = node.position ? Number(node.position.textContent) * 1000 : 0;
    delete node.position;
    if (!Number.isFinite(node.offset)) throw new Error(`Invalid position in ${node.name}.`);
    node.radiusRaw = text(el, type === 'bodytube' || type === 'launchlug' ? 'radius' : 'outerradius');
    node.foreRaw = type === 'nosecone' ? '0' : text(el, 'foreradius');
    node.aftRaw = text(el, 'aftradius');
    node.innerRaw = text(el, 'innerradius');
    node.shape = text(el, 'shape', 'conical');
    node.clipped = text(el, 'shapeclipped', 'true') === 'true';
    node.parameter = number(el, 'shapeparameter', { ogive: 1, power: 0.5, parabolic: 1, haack: 0 }[node.shape] || 0);
    if (['nosecone', 'transition'].includes(type) && !SHAPES.includes(node.shape)) {
      node.supported = false;
      warn(`${node.name}: profile "${node.shape}" is unsupported; geometry is omitted.`);
    }
    if (type === 'nosecone' && boolean(el, 'isflipped')) {
      [node.foreRaw, node.aftRaw] = [node.aftRaw, '0'];
      node.flipped = true;
    }
    for (const end of ['fore', 'aft']) node[`${end}Shoulder`] = {
      radius: mm(el, `${end}shoulderradius`), length: mm(el, `${end}shoulderlength`), thickness: mm(el, `${end}shoulderthickness`, node.thickness), capped: boolean(el, `${end}shouldercapped`),
    };
    if (node.flipped) [node.foreShoulder, node.aftShoulder] = [node.aftShoulder, node.foreShoulder];
    for (const end of ['fore', 'aft']) {
      const shoulder = node[`${end}Shoulder`];
      if (shoulder.length > 0 && shoulder.radius > 0 && shoulder.thickness <= 0) warn(`${node.name}: the zero-thickness ${end} shoulder is omitted in source mode. Hollow for printing gives it a wall.`);
    }
    node.count = Math.trunc(number(el, 'fincount', number(el, 'instancecount', 1)));
    if (node.count < 1 || node.count > 64) throw new Error(`${node.name}: instance count must be between 1 and 64.`);
    node.separation = mm(el, 'instanceseparation');
    node.angle = number(el, 'rotation', number(el, 'radialdirection'));
    const angleOffset = child(el, 'angleoffset');
    if (angleOffset) {
      const method = angleOffset.getAttribute('method') || 'relative';
      node.angle = method === 'fixed' ? 0 : Number(angleOffset.textContent);
      if (!['fixed', 'relative'].includes(method)) { node.supported = false; warn(`${node.name}: unsupported angle method ${method}; geometry is omitted.`); }
    }
    if (!Number.isFinite(node.angle)) throw new Error(`${node.name}: invalid rotation angle.`);
    node.radial = mm(el, 'radialposition');
    const radiusOffset = child(el, 'radiusoffset');
    node.radiusOffset = radiusOffset ? Number(radiusOffset.textContent) * 1000 : node.radial;
    node.radiusMethod = radiusOffset?.getAttribute('method') || 'free';
    if (!Number.isFinite(node.radiusOffset)) throw new Error(`${node.name}: invalid radial offset.`);
    node.cant = number(el, 'cant');
    node.color = { nosecone: '#e96e3a', bodytube: '#d9e1e6', transition: '#9baebc', innertube: '#b59d77', tubecoupler: '#aa8d6d', centeringring: '#c4a56a', bulkhead: '#c4a56a', engineblock: '#c4a56a', launchlug: '#91a3ac' }[type] || '#e96e3a';
    const color = child(el, 'color') || child(child(el, 'appearance'), 'paint');
    if (color) node.color = '#' + ['red', 'green', 'blue'].map((k) => Math.round(Math.max(0, Math.min(255, Number(color.getAttribute(k)) || 0))).toString(16).padStart(2, '0')).join('');
    if (FINS.has(type)) {
      const root = mm(el, 'rootchord');
      const height = mm(el, 'height');
      if (type === 'trapezoidfinset') {
        const sweep = mm(el, 'sweeplength');
        node.points = [[0, 0], [sweep, height], [sweep + mm(el, 'tipchord'), height], [root, 0]];
      } else if (type === 'ellipticalfinset') {
        node.points = Array.from({ length: 49 }, (_, i) => [root * (1 - Math.cos(Math.PI * i / 48)) / 2, height * Math.sin(Math.PI * i / 48)]);
      } else node.points = children(child(el, 'finpoints')).map((p) => [Number(p.getAttribute('x')) * 1000, Number(p.getAttribute('y')) * 1000]);
      if (node.points.length < 3 || node.points.some((p) => p.some((v) => !Number.isFinite(v)))) throw new Error(`${node.name}: invalid fin outline.`);
      node.length = Math.max(...node.points.map(([x]) => x)) - Math.min(...node.points.map(([x]) => x));
      if (text(el, 'crosssection', 'square') !== 'square') warn(`${node.name}: ${text(el, 'crosssection')} cross-section is approximated by a constant-thickness fin.`);
      if (mm(el, 'tabheight') > 0 || mm(el, 'filletradius') > 0) warn(`${node.name}: fin tabs and fillets are omitted.`);
    }
    if (type === 'innertube' && !['', 'single'].includes(text(el, 'clusterconfiguration'))) {
      node.supported = false;
      warn(`${node.name}: clustered motor tubes are omitted.`);
    }
    if (!node.supported) warn(`${node.name}: ${type} is kept in the tree; its geometry is omitted.`);
    for (const c of children(child(el, 'subcomponents'))) node.children.push(read(c, node, depth + 1));
    if (GROUPS.has(type)) node.length = node.children.filter((c) => ['stage', 'axialstage', 'nosecone', 'bodytube', 'transition'].includes(c.type)).reduce((sum, c) => sum + c.length, 0);
    return node;
  }
  const sourceRoot = read(rootEl);
  const map = new Map(nodes.map((n) => [n.id, n]));
  const symmetric = nodes.filter((n) => ['bodytube', 'nosecone', 'transition'].includes(n.type));
  const resolving = new Set();
  const explicit = (raw) => /^auto(?:\s|$)/.test(raw) || raw === '' ? null : Number(raw) * 1000;
  function resolve(node, side = 'radius') {
    const key = `${node.id}:${side}`;
    if (Number.isFinite(node[side])) return node[side];
    if (resolving.has(key)) return null;
    resolving.add(key);
    const raw = side === 'radius' ? node.radiusRaw : side === 'foreRadius' ? node.foreRaw : node.aftRaw;
    let value = explicit(raw);
    if (value === null) {
      const idx = symmetric.indexOf(node);
      const candidates = side === 'aftRadius' ? symmetric.slice(idx + 1) : side === 'foreRadius' ? symmetric.slice(0, idx).reverse() : [...symmetric.slice(idx + 1), ...symmetric.slice(0, idx).reverse()];
      for (const other of candidates) {
        if (other.parentId !== node.parentId && map.get(other.parentId)?.parentId !== map.get(node.parentId)?.parentId) continue;
        value = resolve(other, other.type === 'bodytube' ? 'radius' : symmetric.indexOf(other) < idx ? 'aftRadius' : 'foreRadius');
        if (value !== null && value > 0) break;
      }
      if (!(value > 0) && node.parentId) {
        const p = map.get(node.parentId);
        value = (p.radius ?? p.aftRadius ?? 0) - (INTERNAL.has(node.type) ? p.thickness || 0 : 0);
      }
      if (!(value > 0)) { value = 25; warn(`${node.name}: automatic ${side} could not be resolved; 25 mm is used. Check this dimension before manufacturing.`); }
    }
    resolving.delete(key);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${node.name}: invalid ${side}.`);
    node[side] = value;
    return value;
  }
  symmetric.forEach((n) => n.type === 'bodytube' ? resolve(n) : (resolve(n, 'foreRadius'), resolve(n, 'aftRadius')));
  function place(node, parentStart = 0, parentLength = 0, after = 0) {
    const offset = node.offset;
    switch (node.method) {
      case 'absolute': node.x = offset; break;
      case 'bottom': node.x = parentStart + parentLength - node.length + offset; break;
      case 'middle': node.x = parentStart + (parentLength - node.length) / 2 + offset; break;
      case 'after': node.x = parentStart + after + offset; break;
      case 'top': node.x = parentStart + offset; break;
      default: throw new Error(`${node.name}: unknown axial positioning method "${node.method}".`);
    }
    if (RADIAL.has(node.type) && !symmetric.includes(node)) resolve(node);
    if (['centeringring', 'bulkhead', 'engineblock'].includes(node.type)) {
      let ri = explicit(node.innerRaw);
      if (node.type === 'bulkhead') ri = 0;
      else if (ri === null && node.innerRaw.startsWith('auto')) {
        const p = map.get(node.parentId);
        const tubes = p?.children.filter((n) => n.type === 'innertube') || [];
        ri = Math.max(0, ...tubes.map((n) => resolve(n)));
        warn(`${node.name}: automatic inner radius is matched to the largest sibling motor tube (${ri.toFixed(2)} mm).`);
      }
      if (ri !== null) node.thickness = node.radius - ri;
    }
    if (FINS.has(node.type)) {
      const parent = map.get(node.parentId);
      node.mountRadius = parent ? radiusAt(parent, node.x - parent.x) : 0;
    }
    let cursor = 0;
    for (const c of node.children) {
      place(c, node.x, node.length, cursor);
      if (['stage', 'axialstage', 'nosecone', 'bodytube', 'transition'].includes(c.type)) cursor = c.x + c.length - node.x;
    }
  }
  place(sourceRoot);
  const worldNodes = [];
  function envelope(node) {
    return Math.max(node.radius || 0, node.foreRadius || 0, node.aftRadius || 0, ...node.children.filter((c) => !INSTANCED_GROUPS.has(c.type)).map(envelope));
  }
  function expand(node, parentId = null, suffix = '', context = { y: 0, z: 0, angle: 0 }) {
    if (worldNodes.length >= 1500) throw new Error('Expanded assemblies exceed the 1,500 component limit.');
    const result = { ...node, id: node.id + suffix, parentId, children: [], centerY: context.y, centerZ: context.z, frameAngle: context.angle };
    worldNodes.push(result);
    if (INSTANCED_GROUPS.has(node.type)) {
      const parent = map.get(node.parentId);
      let distance = node.radiusOffset;
      const parentRadius = parent?.type === 'bodytube' ? parent.radius : 0;
      if (node.radiusMethod === 'surface') distance = parentRadius + envelope(node);
      else if (node.radiusMethod === 'relative') distance += parentRadius + envelope(node);
      else if (node.radiusMethod === 'coaxial') distance = 0;
      else if (node.radiusMethod !== 'free') throw new Error(`${node.name}: unsupported radial positioning method "${node.radiusMethod}".`);
      for (let i = 0; i < node.count; i++) {
        const angle = context.angle + node.angle + i * 360 / node.count;
        const rad = angle * Math.PI / 180;
        const instanceContext = { y: context.y + distance * Math.cos(rad), z: context.z + distance * Math.sin(rad), angle };
        if (node.count > 1) {
          const instanceId = result.id + '@' + i;
          const instance = { ...result, id: instanceId, parentId: result.id, type: 'assembly', name: `${node.name} ${i + 1}`, children: [], count: 1, centerY: instanceContext.y, centerZ: instanceContext.z, frameAngle: angle };
          worldNodes.push(instance);
          result.children.push(instance);
          instance.children = node.children.map((c) => expand(c, instanceId, suffix + '@' + node.id + '-' + i, instanceContext));
        } else result.children = node.children.map((c) => expand(c, result.id, suffix, instanceContext));
      }
    } else result.children = node.children.map((c) => expand(c, result.id, suffix, context));
    return result;
  }
  const root = expand(sourceRoot);
  const worldMap = new Map(worldNodes.map((n) => [n.id, n]));
  const parts = [];
  for (const n of worldNodes) {
    if (!n.supported || GROUPS.has(n.type)) continue;
    let ancestor = worldMap.get(n.parentId);
    let blocked = false;
    while (ancestor) { if (!ancestor.supported) blocked = true; ancestor = worldMap.get(ancestor.parentId); }
    if (blocked) { n.supported = false; warn(`${n.name}: geometry is omitted because its parent assembly is unsupported.`); continue; }
    if (!(n.length > 0) || !(n.thickness > 0) || n.length > 1e6) { warn(`${n.name}: invalid or zero dimensions; geometry is omitted.`); n.supported = false; continue; }
    const radius = Math.max(n.radius || 0, n.foreRadius || 0, n.aftRadius || 0);
    if (!FINS.has(n.type) && !(radius > 0)) { n.supported = false; continue; }
    if (n.thickness >= radius && !FINS.has(n.type)) n.filled = true;
    for (let i = 0; i < n.count; i++) {
      const p = { ...n, children: [], id: n.count > 1 ? `${n.id}-${i}` : n.id, sourceNodeId: n.id, name: n.count > 1 ? `${n.name} ${i + 1}` : n.name, angle: n.frameAngle + n.angle + (FINS.has(n.type) ? i * 360 / n.count : 0), x: n.x + (FINS.has(n.type) ? 0 : i * n.separation), y: 0, z: 0 };
      const radial = n.type === 'launchlug' ? (worldMap.get(n.parentId)?.radius || 0) + n.radius : n.radial;
      p.y = n.centerY + radial * Math.cos(p.angle * Math.PI / 180);
      p.z = n.centerZ + radial * Math.sin(p.angle * Math.PI / 180);
      parts.push(p);
    }
  }
  if (!parts.length) throw new Error('No supported solid components were found in this design.');
  if (parts.length > 2000) throw new Error('The design exceeds the 2,000 solid instance limit.');
  const minX = Math.min(...parts.map((p) => p.x - (p.foreShoulder?.length || 0)));
  const maxX = Math.max(...parts.map((p) => p.x + p.length + (p.aftShoulder?.length || 0)));
  return { name: root.name, root, nodes: worldNodes, parts, warnings, length: maxX - minX, minX, maxX, diameter: 2 * Math.max(...symmetric.map((n) => Math.max(n.radius || 0, n.foreRadius || 0, n.aftRadius || 0))), creator: doc.documentElement.getAttribute('creator') || 'OpenRocket', version: doc.documentElement.getAttribute('version') || 'unknown' };
}
