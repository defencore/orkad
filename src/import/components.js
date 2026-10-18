import { SHAPES } from '../profiles.js';
import {
  LIMITS,
  GROUP_TYPES as GROUPS,
  RADIAL_TYPES as RADIAL,
  FIN_TYPES as FINS,
  INTERNAL_TYPES as INTERNAL,
  PROFILE_DEFAULTS,
  PROFILE_RANGES,
} from '../config.js';
import { childElements as children, child, text, boolean, number, millimetres as mm } from './xml.js';
import { normalizePolygon } from '../geometry.js';

export function readComponents(rootEl, warn) {
  const nodes = [];
  let nextId = 0;
  function read(el, parent = null, depth = 0) {
    if (depth > LIMITS.depth || nodes.length >= LIMITS.sourceNodes)
      throw new Error('The design exceeds the supported component count or nesting depth.');
    const type = el.tagName.toLowerCase();
    const node = {
      id: `part-${nextId++}`,
      type,
      name: text(el, 'name', type),
      parentId: parent?.id ?? null,
      children: [],
      supported: GROUPS.has(type) || RADIAL.has(type) || FINS.has(type),
      internal: INTERNAL.has(type),
      sourceId: text(el, 'id'),
    };
    nodes.push(node);
    node.length = mm(el, 'length');
    node.thickness =
      text(el, 'thickness') === 'filled' ? 1 : mm(el, 'thickness', type === 'bulkhead' ? node.length : 1);
    node.filled = boolean(el, 'filled') || text(el, 'thickness') === 'filled';
    node.material = text(el, 'material');
    node.position = child(el, 'axialoffset') || child(el, 'position');
    node.method =
      node.position?.getAttribute('method') ||
      node.position?.getAttribute('type') ||
      (GROUPS.has(type) || ['bodytube', 'nosecone', 'transition'].includes(type) ? 'after' : 'top');
    node.offset = node.position ? Number(node.position.textContent) * 1000 : 0;
    delete node.position;
    if (!Number.isFinite(node.offset)) throw new Error(`Invalid position in ${node.name}.`);
    node.radiusRaw = text(el, type === 'bodytube' || type === 'launchlug' ? 'radius' : 'outerradius');
    node.foreRaw = type === 'nosecone' ? '0' : text(el, 'foreradius');
    node.aftRaw = text(el, 'aftradius');
    node.innerRaw = text(el, 'innerradius');
    node.shape = text(el, 'shape', 'conical');
    node.clipped = text(el, 'shapeclipped', 'true') === 'true';
    node.parameter = number(el, 'shapeparameter', PROFILE_DEFAULTS[node.shape] ?? 0);
    if (type === 'nosecone' && node.shape === 'power' && node.parameter === 0) {
      warn(
        `${node.name}: a zero-exponent power profile has a flat end; hollow modes retain an axial end wall.`,
      );
    }
    if (['nosecone', 'transition'].includes(type) && !SHAPES.includes(node.shape)) {
      node.supported = false;
      warn(`${node.name}: profile "${node.shape}" is unsupported; geometry is omitted.`);
    }
    if (type === 'nosecone' && boolean(el, 'isflipped')) {
      [node.foreRaw, node.aftRaw] = [node.aftRaw, '0'];
      node.flipped = true;
    }
    for (const end of ['fore', 'aft'])
      node[`${end}Shoulder`] = {
        radius: mm(el, `${end}shoulderradius`),
        length: mm(el, `${end}shoulderlength`),
        thickness: mm(el, `${end}shoulderthickness`, node.thickness),
        capped: boolean(el, `${end}shouldercapped`),
      };
    if (node.flipped) [node.foreShoulder, node.aftShoulder] = [node.aftShoulder, node.foreShoulder];
    for (const end of ['fore', 'aft']) {
      const shoulder = node[`${end}Shoulder`];
      if (shoulder.length > 0 && shoulder.radius > 0 && shoulder.thickness <= 0)
        warn(
          `${node.name}: the zero-thickness ${end} shoulder is omitted in source mode. Hollow for printing gives it a wall.`,
        );
    }
    node.count = number(el, 'fincount', number(el, 'instancecount', 1));
    if (!Number.isInteger(node.count) || node.count < 1 || node.count > LIMITS.instances)
      throw new Error(`${node.name}: instance count must be between 1 and 64.`);
    node.separation = mm(el, 'instanceseparation');
    node.angle = number(el, 'rotation', number(el, 'radialdirection'));
    const angleOffset = child(el, 'angleoffset');
    if (angleOffset) {
      const method = angleOffset.getAttribute('method') || 'relative';
      node.angle = method === 'fixed' ? 0 : Number(angleOffset.textContent);
      if (!['fixed', 'relative'].includes(method)) {
        node.supported = false;
        warn(`${node.name}: unsupported angle method ${method}; geometry is omitted.`);
      }
    }
    if (!Number.isFinite(node.angle)) throw new Error(`${node.name}: invalid rotation angle.`);
    node.radial = mm(el, 'radialposition');
    const radiusOffset = child(el, 'radiusoffset');
    node.radiusOffset = radiusOffset ? Number(radiusOffset.textContent) * 1000 : node.radial;
    node.radiusMethod = radiusOffset?.getAttribute('method') || 'free';
    if (!Number.isFinite(node.radiusOffset)) throw new Error(`${node.name}: invalid radial offset.`);
    node.cant = number(el, 'cant');
    node.color =
      {
        nosecone: '#e96e3a',
        bodytube: '#d9e1e6',
        transition: '#9baebc',
        innertube: '#b59d77',
        tubecoupler: '#aa8d6d',
        centeringring: '#c4a56a',
        bulkhead: '#c4a56a',
        engineblock: '#c4a56a',
        launchlug: '#91a3ac',
      }[type] || '#e96e3a';
    const color = child(el, 'color') || child(child(el, 'appearance'), 'paint');
    if (color)
      node.color =
        '#' +
        ['red', 'green', 'blue']
          .map((k) =>
            Math.round(Math.max(0, Math.min(255, Number(color.getAttribute(k)) || 0)))
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
    if (FINS.has(type)) {
      const root = mm(el, 'rootchord');
      const height = mm(el, 'height');
      if (type === 'trapezoidfinset') {
        const sweep = mm(el, 'sweeplength');
        node.points = [
          [0, 0],
          [sweep, height],
          [sweep + mm(el, 'tipchord'), height],
          [root, 0],
        ];
      } else if (type === 'ellipticalfinset') {
        node.points = Array.from({ length: 49 }, (_, i) => [
          (root * (1 - Math.cos((Math.PI * i) / 48))) / 2,
          height * Math.sin((Math.PI * i) / 48),
        ]);
      } else
        node.points = children(child(el, 'finpoints')).map((p) => [
          Number(p.getAttribute('x')) * 1000,
          Number(p.getAttribute('y')) * 1000,
        ]);
      if (node.points.length > LIMITS.finPoints) throw new Error(`${node.name}: invalid fin outline.`);
      node.points = normalizePolygon(node.points, node.name);
      node.length = Math.max(...node.points.map(([x]) => x)) - Math.min(...node.points.map(([x]) => x));
      if (text(el, 'crosssection', 'square') !== 'square')
        warn(
          `${node.name}: ${text(el, 'crosssection')} cross-section is approximated by a constant-thickness fin.`,
        );
      if (mm(el, 'tabheight') > 0 || mm(el, 'filletradius') > 0)
        warn(`${node.name}: fin tabs and fillets are omitted.`);
    }
    if (type === 'innertube' && !['', 'single'].includes(text(el, 'clusterconfiguration'))) {
      node.supported = false;
      warn(`${node.name}: clustered motor tubes are omitted.`);
    }
    if (!node.supported) warn(`${node.name}: ${type} is kept in the tree; its geometry is omitted.`);
    for (const c of children(child(el, 'subcomponents'))) node.children.push(read(c, node, depth + 1));
    if (GROUPS.has(type))
      node.length = node.children
        .filter((c) => ['stage', 'axialstage', 'nosecone', 'bodytube', 'transition'].includes(c.type))
        .reduce((sum, c) => sum + c.length, 0);
    return node;
  }
  const root = read(rootEl);
  for (const node of nodes) {
    for (const [label, value] of [
      ['length', node.length],
      ['thickness', node.thickness],
      ['instance separation', node.separation],
    ]) {
      if (!Number.isFinite(value) || value < 0 || value > LIMITS.dimension)
        throw new Error(`${node.name}: invalid ${label}.`);
    }
    if (
      Math.abs(node.offset) > LIMITS.dimension ||
      Math.abs(node.radiusOffset) > LIMITS.dimension ||
      Math.abs(node.radial) > LIMITS.dimension
    )
      throw new Error(`${node.name}: position exceeds the supported range.`);
    if (Math.abs(node.cant) > 90)
      throw new Error(`${node.name}: fin cant must be between -90 and 90 degrees.`);
    const range = PROFILE_RANGES[node.shape];
    if (
      ['nosecone', 'transition'].includes(node.type) &&
      range &&
      (node.parameter < range[0] || node.parameter > range[1])
    )
      throw new Error(`${node.name}: profile parameter is outside the supported range.`);
    for (const end of ['fore', 'aft'])
      for (const value of Object.values(node[`${end}Shoulder`]).filter((v) => typeof v === 'number')) {
        if (value < 0 || value > LIMITS.dimension)
          throw new Error(`${node.name}: invalid ${end} shoulder dimension.`);
      }
  }
  return { root, nodes };
}
