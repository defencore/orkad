import { EPSILON } from './config.js';

/** @param {number[]} a @param {number[]} b */
export const samePoint = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPSILON;

/** @param {number[][]} points */
export function normalizePolygon(points, name = 'Fin') {
  /** @type {number[][]} */
  const result = [];
  for (const point of points) {
    if (point.length !== 2 || point.some((value) => !Number.isFinite(value)))
      throw new Error(`${name}: invalid fin outline.`);
    if (!result.length || !samePoint(result[result.length - 1], point)) result.push([...point]);
  }
  if (result.length > 1 && samePoint(result[0], result[result.length - 1])) result.pop();
  if (result.length < 3) throw new Error(`${name}: the fin outline needs at least three distinct points.`);
  const area = result.reduce((sum, p, i) => {
    const next = result[(i + 1) % result.length];
    return sum + p[0] * next[1] - next[0] * p[1];
  }, 0);
  if (Math.abs(area) <= EPSILON) throw new Error(`${name}: the fin outline has zero area.`);
  /** @param {number[]} a @param {number[]} b @param {number[]} c */
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  /** @param {number[]} a @param {number[]} b @param {number[]} p */
  const onSegment = (a, b, p) =>
    Math.abs(orient(a, b, p)) <= EPSILON &&
    p[0] >= Math.min(a[0], b[0]) - EPSILON &&
    p[0] <= Math.max(a[0], b[0]) + EPSILON &&
    p[1] >= Math.min(a[1], b[1]) - EPSILON &&
    p[1] <= Math.max(a[1], b[1]) + EPSILON;
  for (let i = 0; i < result.length; i++) {
    const a = result[i],
      b = result[(i + 1) % result.length];
    for (let j = i + 2; j < result.length; j++) {
      if (i === 0 && j === result.length - 1) continue;
      const c = result[j],
        d = result[(j + 1) % result.length];
      const crosses = orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
      if (crosses || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b))
        throw new Error(`${name}: the fin outline intersects itself.`);
    }
  }
  return result;
}
