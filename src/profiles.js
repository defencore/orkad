const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const sqrt = (value) => Math.sqrt(Math.max(0, value));
export const SHAPES = ['conical', 'ogive', 'ellipsoid', 'power', 'parabolic', 'haack'];

export function noseRadius(shape, x, radius, length, parameter) {
  if (x <= 0) return 0;
  if (x >= length) return radius;
  let t = clamp(x / length, 0, 1);
  const p = parameter ?? ({ ogive: 1, power: 0.5, parabolic: 1, haack: 0 }[shape] ?? 0);
  switch (shape) {
    case 'conical': return radius * t;
    case 'ellipsoid': return radius * sqrt(2 * t - t * t);
    case 'power': return radius * t ** clamp(p, 0, 1);
    case 'parabolic': return radius * (2 * t - p * t * t) / (2 - p);
    case 'haack': {
      const theta = Math.acos(1 - 2 * t);
      return radius * sqrt((theta - Math.sin(2 * theta) / 2 + p * Math.sin(theta) ** 3) / Math.PI);
    }
    case 'ogive': {
      if (p < 0.001) return radius * t;
      length = Math.max(length, radius);
      x = t * length;
      const circle = sqrt((length ** 2 + radius ** 2) * (((2 - p) * length) ** 2 + (p * radius) ** 2) / (4 * (p * radius) ** 2));
      const center = length / p;
      return sqrt(circle ** 2 - (center - x) ** 2) - sqrt(circle ** 2 - center ** 2);
    }
    default: throw new Error(`Unsupported profile: ${shape}`);
  }
}

export function radiusAt(node, x) {
  if (!['nosecone', 'transition'].includes(node.type)) return node.radius || 0;
  let r1 = node.foreRadius;
  let r2 = node.aftRadius;
  if (r1 === r2) return r1;
  x = clamp(x, 0, node.length);
  if (r1 > r2) { [r1, r2] = [r2, r1]; x = node.length - x; }
  if (node.clipped && ['ellipsoid', 'power', 'haack'].includes(node.shape) && r1 > 0) {
    let low = 0;
    let high = node.length;
    for (let i = 0; i < 40 && noseRadius(node.shape, high, r2, high + node.length, node.parameter) < r1; i++) high *= 2;
    for (let i = 0; i < 70; i++) {
      const mid = (low + high) / 2;
      if (noseRadius(node.shape, mid, r2, mid + node.length, node.parameter) > r1) high = mid;
      else low = mid;
    }
    const clip = (low + high) / 2;
    return noseRadius(node.shape, clip + x, r2, clip + node.length, node.parameter);
  }
  return r1 + noseRadius(node.shape, x, r2 - r1, node.length, node.parameter);
}

export function sampleProfile(node, samples = 96) {
  // Cosine spacing resolves both a sharp tip and a rounded base.
  return Array.from({ length: samples + 1 }, (_, i) => {
    const z = node.length * (1 - Math.cos(Math.PI * i / samples)) / 2;
    return [radiusAt(node, z), z];
  });
}

export function radialGeometry(node, settings) {
  const isNose = node.type === 'nosecone';
  const custom = isNose && settings.noseMode === 'hollow';
  const filled = isNose && settings.noseMode === 'solid' || node.filled && !custom;
  const wall = custom ? settings.wallThickness : node.thickness;
  const curved = ['nosecone', 'transition'].includes(node.type) && node.shape !== 'conical';
  const profile = ['nosecone', 'transition'].includes(node.type)
    ? (curved ? sampleProfile(node, settings.samples) : [[node.foreRadius, 0], [node.aftRadius, node.length]])
    : [[node.radius, 0], [node.radius, node.length]];
  const segments = [];
  let pointer;
  function add(kind, points) {
    if (kind === 'line' && pointer && Math.hypot(pointer[0] - points.at(-1)[0], pointer[1] - points.at(-1)[1]) < 1e-7) return;
    segments.push({ kind, points });
    pointer = points.at(-1);
  }
  const start = profile[0];
  pointer = start;
  add(curved ? 'spline' : 'line', profile);
  const aft = filled || custom || node.aftShoulder?.thickness > 0 ? node.aftShoulder : null;
  const fore = filled || custom || node.foreShoulder?.thickness > 0 ? node.foreShoulder : null;
  if (aft?.length > 0 && aft.radius > 0) {
    add('line', [[aft.radius, node.length]]);
    add('line', [[aft.radius, node.length + aft.length]]);
  }
  const endZ = pointer[1];
  if (filled) {
    add('line', [[0, endZ]]);
    add('line', [[0, fore?.length ? -fore.length : 0]]);
  } else {
    const outerBase = profile.at(-1)[0];
    const innerBase = Math.max(0, outerBase - wall);
    if (aft?.length > 0 && aft.radius > 0) {
      const aw = custom ? wall : aft.thickness;
      const ri = Math.max(0, aft.radius - aw);
      if (aft.capped) {
        add('line', [[0, endZ]]);
        add('line', [[0, endZ - Math.min(aw, aft.length)]]);
        add('line', [[ri, endZ - Math.min(aw, aft.length)]]);
      } else add('line', [[ri, endZ]]);
      add('line', [[ri, node.length]]);
      add('line', [[Math.min(innerBase, ri), node.length]]);
    } else add('line', [[innerBase, node.length]]);
    const inner = profile.map(([r, z]) => [Math.max(0, r - wall), z]);
    // Stop the cavity at its first positive radius, then solve the exact axial closure.
    const firstPositive = inner.findIndex(([r]) => r > 1e-8);
    if (firstPositive < 0) {
      add('line', [[0, 0]]);
    } else {
      let cavity = inner.slice(firstPositive);
      if (firstPositive > 0) {
        let lo = profile[firstPositive - 1][1];
        let hi = profile[firstPositive][1];
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (radiusAt(node, mid) > wall) hi = mid;
          else lo = mid;
        }
        cavity.unshift([0, (lo + hi) / 2]);
      }
      if (aft?.length > 0 && aft.radius > 0 && innerBase > aft.radius - (custom ? wall : aft.thickness)) {
        // A thicker internal lip joins the shoulder to the main wall.
        const lip = Math.min(wall, node.length / 20);
        cavity = cavity.filter(([, z]) => z < node.length - lip);
        cavity.push([Math.max(0, radiusAt(node, node.length - lip) - wall), node.length - lip]);
        add('line', [cavity.at(-1)]);
      }
      const reverse = cavity.slice().reverse();
      if (Math.hypot(pointer[0] - reverse[0][0], pointer[1] - reverse[0][1]) > 1e-7) add('line', [reverse[0]]);
      if (curved && reverse.length > 2) add('spline', reverse);
      else for (const p of reverse.slice(1)) add('line', [p]);
    }
  }
  if (fore?.length > 0 && fore.radius > 0) {
    const foreWall = custom ? wall : fore.thickness;
    const ri = filled ? 0 : Math.max(0, fore.radius - foreWall);
    add('line', [[ri, 0]]);
    add('line', [[ri, -fore.length + (fore.capped && !filled ? foreWall : 0)]]);
    if (fore.capped && !filled) {
      add('line', [[0, -fore.length + foreWall]]);
      add('line', [[0, -fore.length]]);
    }
    add('line', [[fore.radius, -fore.length]]);
    add('line', [[fore.radius, 0]]);
  }
  add('line', [start]);
  return { kind: 'revolve', start, segments };
}

export function geometryFor(node, settings) {
  if (node.type.endsWith('finset') && node.type !== 'tubefinset') {
    return { kind: 'fin', points: node.points, thickness: node.thickness, radius: node.mountRadius, angle: node.angle, cant: node.cant || 0 };
  }
  return radialGeometry(node, settings);
}

export function profileContour(geometry) {
  const points = [geometry.start];
  for (const segment of geometry.segments) {
    for (const p of segment.kind === 'spline' ? segment.points.slice(1) : [segment.points.at(-1)]) {
      if (Math.hypot(points.at(-1)[0] - p[0], points.at(-1)[1] - p[1]) > 1e-7) points.push(p);
    }
  }
  return points;
}
