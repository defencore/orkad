import { FIN_TYPES } from './config.js';
import { samePoint } from './geometry.js';
import { radialGeometry } from './radial-geometry.js';
export { SHAPES, noseRadius, radiusAt, sampleProfile } from './profile-equations.js';
export { radialGeometry };

export function geometryFor(node, settings) {
  if (FIN_TYPES.has(node.type)) {
    return {
      kind: 'fin',
      points: node.points,
      thickness: node.thickness,
      radius: node.mountRadius,
      angle: node.angle,
      cant: node.cant || 0,
    };
  }
  return radialGeometry(node, settings);
}

export function profileContour(geometry) {
  const points = [geometry.start];
  for (const segment of geometry.segments) {
    for (const p of segment.kind === 'spline' ? segment.points.slice(1) : [segment.points.at(-1)]) {
      if (!samePoint(points.at(-1), p)) points.push(p);
    }
  }
  return points;
}
