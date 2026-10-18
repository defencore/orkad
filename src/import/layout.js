import { GROUP_TYPES, SERIAL_TYPES, LIMITS, EPSILON } from '../config.js';

export function placeComponents(root, nodes) {
  function place(node, parentStart = 0, parentLength = 0, after = 0) {
    const origins = {
      absolute: 0,
      bottom: parentStart + parentLength - node.length,
      middle: parentStart + (parentLength - node.length) / 2,
      after: parentStart + after,
      top: parentStart,
    };
    if (!(node.method in origins))
      throw new Error(`${node.name}: unknown axial positioning method "${node.method}".`);
    node.x = origins[node.method] + node.offset;
    if (!Number.isFinite(node.x) || Math.abs(node.x) > LIMITS.dimension)
      throw new Error(`${node.name}: axial position exceeds the supported range.`);
    let cursor = 0;
    for (const child of node.children) {
      place(child, node.x, node.length, cursor);
      if (SERIAL_TYPES.has(child.type)) cursor = child.x + child.length - node.x;
    }
  }
  // Assembly lengths include signed offsets and gaps between serial components.
  for (let iteration = 0; iteration < LIMITS.depth + 2; iteration++) {
    place(root);
    let changed = false;
    for (const node of [...nodes].reverse()) {
      if (!GROUP_TYPES.has(node.type)) continue;
      const length = Math.max(
        0,
        ...node.children
          .filter((child) => SERIAL_TYPES.has(child.type))
          .map((child) => child.x + child.length - node.x),
      );
      if (Math.abs(length - node.length) > EPSILON) {
        node.length = length;
        changed = true;
      }
    }
    if (!changed) return;
  }
  throw new Error('The assembly has circular axial positioning constraints.');
}
