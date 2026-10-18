import { PROFILE_DEFAULTS } from './config.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const sqrt = (value) => Math.sqrt(Math.max(0, value));
export const SHAPES = Object.keys(PROFILE_DEFAULTS);

export function noseRadius(shape, x, radius, length, parameter) {
  if (x <= 0) return 0;
  if (x >= length) return radius;
  const t = clamp(x / length, 0, 1);
  const p = parameter ?? PROFILE_DEFAULTS[shape] ?? 0;
  switch (shape) {
    case 'conical':
      return radius * t;
    case 'ellipsoid':
      return radius * sqrt(2 * t - t * t);
    case 'power':
      return radius * t ** clamp(p, 0, 1);
    case 'parabolic':
      return (radius * (2 * t - p * t * t)) / (2 - p);
    case 'haack': {
      const theta = Math.acos(1 - 2 * t);
      return radius * sqrt((theta - Math.sin(2 * theta) / 2 + p * Math.sin(theta) ** 3) / Math.PI);
    }
    case 'ogive': {
      if (p < 0.001) return radius * t;
      length = Math.max(length, radius);
      x = t * length;
      const circle = sqrt(
        ((length ** 2 + radius ** 2) * (((2 - p) * length) ** 2 + (p * radius) ** 2)) /
          (4 * (p * radius) ** 2),
      );
      const center = length / p;
      return sqrt(circle ** 2 - (center - x) ** 2) - sqrt(circle ** 2 - center ** 2);
    }
    default:
      throw new Error(`Unsupported profile: ${shape}`);
  }
}

export function radiusAt(node, x) {
  if (!['nosecone', 'transition'].includes(node.type)) return node.radius || 0;
  let r1 = node.foreRadius;
  let r2 = node.aftRadius;
  if (x <= 0) return r1;
  if (x >= node.length) return r2;
  if (r1 === r2) return r1;
  x = clamp(x, 0, node.length);
  if (r1 > r2) {
    [r1, r2] = [r2, r1];
    x = node.length - x;
  }
  if (node.clipped && ['ellipsoid', 'power', 'haack'].includes(node.shape) && r1 > 0) {
    let low = 0;
    let high = node.length;
    for (let i = 0; i < 40 && noseRadius(node.shape, high, r2, high + node.length, node.parameter) < r1; i++)
      high *= 2;
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
    const z = (node.length * (1 - Math.cos((Math.PI * i) / samples))) / 2;
    return [radiusAt(node, z), z];
  });
}
