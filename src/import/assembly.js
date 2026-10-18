import {
  GROUP_TYPES as GROUPS,
  INSTANCE_TYPES as INSTANCED_GROUPS,
  FIN_TYPES as FINS,
  LIMITS,
} from '../config.js';
import { radiusAt } from '../profiles.js';

export function expandAssembly(sourceRoot, nodes, warn) {
  const map = new Map(nodes.map((node) => [node.id, node]));
  const worldNodes = [];
  const append = (node) => {
    if (worldNodes.length >= LIMITS.expandedNodes)
      throw new Error('Expanded assemblies exceed the 1,500 component limit.');
    worldNodes.push(node);
  };
  function envelope(node) {
    return Math.max(
      node.radius || 0,
      node.foreRadius || 0,
      node.aftRadius || 0,
      ...node.children.filter((c) => !INSTANCED_GROUPS.has(c.type)).map(envelope),
    );
  }
  function expand(node, parentId = null, suffix = '', context = { y: 0, z: 0, angle: 0 }) {
    if (worldNodes.length >= 1500) throw new Error('Expanded assemblies exceed the 1,500 component limit.');
    const result = {
      ...node,
      id: node.id + suffix,
      parentId,
      children: [],
      centerY: context.y,
      centerZ: context.z,
      frameAngle: context.angle,
    };
    append(result);
    if (INSTANCED_GROUPS.has(node.type)) {
      const parent = map.get(node.parentId);
      let distance = node.radiusOffset;
      const parentRadius = parent?.type === 'bodytube' ? parent.radius : 0;
      if (node.radiusMethod === 'surface') distance = parentRadius + envelope(node);
      else if (node.radiusMethod === 'relative') distance += parentRadius + envelope(node);
      else if (node.radiusMethod === 'coaxial') distance = 0;
      else if (node.radiusMethod !== 'free')
        throw new Error(`${node.name}: unsupported radial positioning method "${node.radiusMethod}".`);
      for (let i = 0; i < node.count; i++) {
        const angle = context.angle + node.angle + (i * 360) / node.count;
        const rad = (angle * Math.PI) / 180;
        const instanceContext = {
          y: context.y + distance * Math.cos(rad),
          z: context.z + distance * Math.sin(rad),
          angle,
        };
        if (node.count > 1) {
          const instanceId = result.id + '@' + i;
          const instance = {
            ...result,
            id: instanceId,
            parentId: result.id,
            type: 'assembly',
            name: `${node.name} ${i + 1}`,
            children: [],
            count: 1,
            centerY: instanceContext.y,
            centerZ: instanceContext.z,
            frameAngle: angle,
          };
          append(instance);
          result.children.push(instance);
          instance.children = node.children.map((c) =>
            expand(c, instanceId, suffix + '@' + node.id + '-' + i, instanceContext),
          );
        } else result.children = node.children.map((c) => expand(c, result.id, suffix, instanceContext));
      }
    } else {
      const angle = context.angle + node.angle;
      const parent = map.get(node.parentId);
      const radial =
        node.type === 'launchlug'
          ? (parent ? radiusAt(parent, node.x - parent.x) : 0) + node.radius
          : node.radial;
      result.centerY += radial * Math.cos((angle * Math.PI) / 180);
      result.centerZ += radial * Math.sin((angle * Math.PI) / 180);
      const descendantContext = { y: result.centerY, z: result.centerZ, angle: context.angle };
      if (node.count > 1 && !FINS.has(node.type) && node.children.length)
        throw new Error(
          `${node.name}: repeated components with descendants must use a pod assembly in OpenRocket.`,
        );
      result.children = node.children.map((c) => expand(c, result.id, suffix, descendantContext));
    }
    return result;
  }
  const root = expand(sourceRoot);
  const worldMap = new Map(worldNodes.map((n) => [n.id, n]));
  const parts = [];
  for (const n of worldNodes) {
    if (!n.supported || GROUPS.has(n.type)) continue;
    let ancestor = worldMap.get(n.parentId);
    let blocked = false;
    while (ancestor) {
      if (!ancestor.supported) blocked = true;
      ancestor = worldMap.get(ancestor.parentId);
    }
    if (blocked) {
      n.supported = false;
      warn(`${n.name}: geometry is omitted because its parent assembly is unsupported.`);
      continue;
    }
    if (!(n.length > 0) || !(n.thickness > 0) || n.length > 1e6) {
      warn(`${n.name}: invalid or zero dimensions; geometry is omitted.`);
      n.supported = false;
      continue;
    }
    const radius = Math.max(n.radius || 0, n.foreRadius || 0, n.aftRadius || 0);
    if (!FINS.has(n.type) && !(radius > 0)) {
      n.supported = false;
      continue;
    }
    if (n.thickness >= radius && !FINS.has(n.type)) n.filled = true;
    for (let i = 0; i < n.count; i++) {
      const p = {
        ...n,
        children: [],
        id: n.count > 1 ? `${n.id}-${i}` : n.id,
        sourceNodeId: n.id,
        name: n.count > 1 ? `${n.name} ${i + 1}` : n.name,
        angle: n.frameAngle + n.angle + (FINS.has(n.type) ? (i * 360) / n.count : 0),
        x: n.x + (FINS.has(n.type) ? 0 : i * n.separation),
        y: 0,
        z: 0,
      };

      p.y = n.centerY;
      p.z = n.centerZ;
      if (parts.length >= LIMITS.solidParts)
        throw new Error('The design exceeds the 2,000 solid instance limit.');
      parts.push(p);
    }
  }
  if (!parts.length) throw new Error('No supported solid components were found in this design.');
  const minX = Math.min(...parts.map((part) => part.x - (part.foreShoulder?.length || 0)));
  const maxX = Math.max(...parts.map((part) => part.x + part.length + (part.aftShoulder?.length || 0)));
  const diameter =
    2 *
    Math.max(...parts.map((part) => Math.max(part.radius || 0, part.foreRadius || 0, part.aftRadius || 0)));
  return { root, nodes: worldNodes, parts, length: maxX - minX, minX, maxX, diameter };
}
