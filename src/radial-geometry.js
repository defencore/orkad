import { radiusAt, sampleProfile } from './profile-equations.js';
import { samePoint } from './geometry.js';
import { EPSILON } from './config.js';

export function radialGeometry(node, settings) {
  const custom = node.type === 'nosecone' && settings.noseMode === 'hollow';
  const filled = (node.type === 'nosecone' && settings.noseMode === 'solid') || (node.filled && !custom);
  const wall = custom ? settings.wallThickness : node.thickness;
  const shaped = ['nosecone', 'transition'].includes(node.type);
  const flatPower =
    shaped && node.shape === 'power' && node.parameter === 0 && node.foreRadius !== node.aftRadius;
  const curved = shaped && node.shape !== 'conical' && !(node.shape === 'power' && node.parameter === 0);
  const profile = curved
    ? sampleProfile(node, settings.samples)
    : shaped
      ? [
          [node.foreRadius, 0],
          [node.aftRadius, node.length],
        ]
      : [
          [node.radius, 0],
          [node.radius, node.length],
        ];
  if (shaped && node.shape === 'power' && node.parameter === 0) {
    const high = Math.max(node.foreRadius, node.aftRadius);
    profile.splice(1, 0, [high, node.foreRadius > node.aftRadius ? node.length : 0]);
  }
  const shoulder = (end) => {
    const value = node[`${end}Shoulder`];
    return value?.length > EPSILON &&
      value.radius > EPSILON &&
      (filled || custom || value.thickness > EPSILON)
      ? value
      : null;
  };
  const fore = shoulder('fore');
  const aft = shoulder('aft');
  const start = fore ? [fore.radius, -fore.length] : profile[0];
  const segments = [];
  let pointer = start;
  function line(point) {
    if (!samePoint(pointer, point)) {
      segments.push({ kind: 'line', points: [point] });
      pointer = point;
    }
  }
  function path(points) {
    if (!points.length) return;
    line(points[0]);
    const clean = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
    if (curved && clean.length > 2) {
      segments.push({ kind: 'spline', points: clean });
      pointer = clean.at(-1);
    } else clean.slice(1).forEach(line);
  }
  if (fore) line([fore.radius, 0]);
  path(profile);
  if (aft) {
    line([aft.radius, node.length]);
    line([aft.radius, node.length + aft.length]);
  }
  const endZ = pointer[1];
  if (filled) {
    line([0, endZ]);
    line([0, start[1]]);
  } else {
    const innerRadius = (z) => Math.max(0, radiusAt(node, z) - wall);
    const isOpen = (z) => innerRadius(z) > 0;
    const shoulderInner = (value) => Math.max(0, value.radius - (custom ? wall : value.thickness));
    const cap = (value) => (value.capped ? Math.min(custom ? wall : value.thickness, value.length) : 0);
    const lip = Math.min(wall, node.length / 20);
    const aftInner = aft && cap(aft) < aft.length ? shoulderInner(aft) : 0;
    const foreInner = fore && cap(fore) < fore.length ? shoulderInner(fore) : 0;
    let lower = fore && innerRadius(0) > foreInner + EPSILON ? lip : 0;
    let upper = aft && innerRadius(node.length) > aftInner + EPSILON ? node.length - lip : node.length;
    // A zero-exponent power nose has a flat end, which needs an axial end wall.
    if (flatPower && node.foreRadius < node.aftRadius)
      lower = Math.max(lower, Math.min(wall, node.length / 2));
    if (flatPower && node.foreRadius > node.aftRadius)
      upper = Math.min(upper, node.length - Math.min(wall, node.length / 2));
    if (aft) {
      if (aft.capped) {
        line([0, endZ]);
        line([0, endZ - cap(aft)]);
      }
      line([aftInner, endZ - cap(aft)]);
      line([aftInner, node.length]);
    } else if (flatPower && node.foreRadius > node.aftRadius) {
      line([Math.max(0, node.aftRadius - wall), node.length]);
      if (node.aftRadius === 0) line([0, upper]);
    }
    const positions = [lower, ...profile.map(([, z]) => z).filter((z) => z > lower && z < upper), upper];
    // Split exactly where a radial wall closes on the axis, including reversed profiles.
    const inner = [];
    for (let index = 0; index < positions.length; index++) {
      const z = positions[index];
      if (index && isOpen(positions[index - 1]) !== isOpen(z)) {
        let low = positions[index - 1],
          high = z;
        const increasing = isOpen(z);
        for (let iteration = 0; iteration < 60; iteration++) {
          const middle = (low + high) / 2;
          if (isOpen(middle) === increasing) high = middle;
          else low = middle;
        }
        inner.push([0, (low + high) / 2]);
      }
      if (innerRadius(z) > EPSILON) inner.push([innerRadius(z), z]);
    }
    if (inner.length) {
      const reverse = inner.reverse();
      path(reverse);
    } else line([0, upper]);
    if (fore) {
      line([foreInner, 0]);
      line([foreInner, -fore.length + cap(fore)]);
      if (fore.capped) {
        line([0, -fore.length + cap(fore)]);
        line([0, -fore.length]);
      }
    } else if (flatPower && node.foreRadius < node.aftRadius) {
      if (node.foreRadius === 0) line([0, lower]);
      line([Math.max(0, node.foreRadius - wall), 0]);
    } else if (!inner.length || inner.at(-1)[1] > EPSILON) line([0, 0]);
  }
  line(start);
  return { kind: 'revolve', start, segments };
}
