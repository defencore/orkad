import {
  INTERNAL_TYPES,
  INSTANCE_TYPES,
  SYMMETRIC_TYPES,
  RADIAL_TYPES,
  FIN_TYPES,
  LIMITS,
} from '../config.js';
import { radiusAt } from '../profiles.js';

export function resolveDimensions(nodes, warn) {
  const map = new Map(nodes.map((node) => [node.id, node]));
  const symmetric = nodes.filter((node) => SYMMETRIC_TYPES.has(node.type));
  const resolving = new Set();
  function axis(node) {
    const parent = map.get(node.parentId);
    return !parent || INSTANCE_TYPES.has(parent.type) ? (parent?.id ?? null) : axis(parent);
  }
  function explicit(raw, node) {
    if (/^auto(?:\s|$)/.test(raw) || raw === '') return null;
    const value = Number(raw) * 1000;
    if (!Number.isFinite(value) || value < 0 || value > LIMITS.dimension)
      throw new Error(`${node.name}: invalid radius.`);
    return value;
  }
  function resolve(node, side = 'radius') {
    const key = `${node.id}:${side}`;
    if (Number.isFinite(node[side])) return node[side];
    if (resolving.has(key)) return null;
    resolving.add(key);
    const raw = side === 'radius' ? node.radiusRaw : side === 'foreRadius' ? node.foreRaw : node.aftRaw;
    let value = explicit(raw, node);
    if (value === null && SYMMETRIC_TYPES.has(node.type)) {
      const peers = symmetric.filter((other) => axis(other) === axis(node));
      const index = peers.indexOf(node);
      const before = peers.slice(0, index).reverse();
      const after = peers.slice(index + 1);
      const candidates =
        side === 'foreRadius' ? before : side === 'aftRadius' ? after : [...after, ...before];
      for (const other of candidates) {
        value = resolve(
          other,
          other.type === 'bodytube' ? 'radius' : peers.indexOf(other) < index ? 'aftRadius' : 'foreRadius',
        );
        if (value > 0) break;
      }
    }
    const parent = map.get(node.parentId);
    if (!(value > 0) && value !== 0 && parent && RADIAL_TYPES.has(parent.type)) {
      if (parent.type === 'bodytube' || !SYMMETRIC_TYPES.has(parent.type)) resolve(parent);
      else {
        resolve(parent, 'foreRadius');
        resolve(parent, 'aftRadius');
      }
      value = radiusAt(parent, node.x - parent.x) - (INTERNAL_TYPES.has(node.type) ? parent.thickness : 0);
    }
    if (value === null || value === undefined) {
      const cached = /^auto\s+(.+)$/.exec(raw);
      if (cached) {
        value = explicit(cached[1], node);
        warn(
          `${node.name}: automatic ${side} uses the stored OpenRocket value (${value.toFixed(2)} mm); check the fit before manufacturing.`,
        );
      } else
        throw new Error(
          `${node.name}: automatic ${side} could not be resolved. Set an explicit radius in OpenRocket.`,
        );
    }
    resolving.delete(key);
    if (!Number.isFinite(value) || value < 0 || value > LIMITS.dimension)
      throw new Error(`${node.name}: invalid ${side}.`);
    node[side] = value;
    return value;
  }
  for (const node of symmetric) {
    if (node.type === 'bodytube') resolve(node);
    else {
      resolve(node, 'foreRadius');
      resolve(node, 'aftRadius');
    }
  }
  for (const node of nodes.filter((node) => RADIAL_TYPES.has(node.type) && !SYMMETRIC_TYPES.has(node.type)))
    resolve(node);
  for (const node of nodes) {
    if (['centeringring', 'bulkhead', 'engineblock'].includes(node.type)) {
      let inner = node.type === 'bulkhead' ? 0 : explicit(node.innerRaw, node);
      if (inner === null && node.innerRaw.startsWith('auto')) {
        const tubes =
          map
            .get(node.parentId)
            ?.children.filter(
              (other) =>
                other.type === 'innertube' &&
                other.x < node.x + node.length &&
                other.x + other.length > node.x,
            ) ?? [];
        inner = Math.max(0, ...tubes.map((tube) => tube.radius));
        warn(
          `${node.name}: automatic inner radius is matched to overlapping motor tubes (${inner.toFixed(2)} mm).`,
        );
      }
      if (inner !== null) {
        if (inner >= node.radius)
          throw new Error(`${node.name}: inner radius must be smaller than outer radius.`);
        node.thickness = node.radius - inner;
      }
    }
    if (FIN_TYPES.has(node.type)) {
      const parent = map.get(node.parentId);
      node.mountRadius = parent ? radiusAt(parent, node.x - parent.x) : 0;
    }
    for (const end of ['fore', 'aft']) {
      const shoulder = node[`${end}Shoulder`];
      const radius = node.type === 'bodytube' ? node.radius : node[`${end}Radius`];
      if (shoulder.length > 0 && shoulder.radius > 0 && Number.isFinite(radius) && shoulder.radius > radius)
        throw new Error(`${node.name}: ${end} shoulder exceeds the adjacent body radius.`);
    }
  }
}
