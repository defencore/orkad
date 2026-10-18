import {
  makeLine,
  makeBSplineApproximation,
  assembleWire,
  makeFace,
  revolution,
  basicFaceExtrusion,
  Vector,
  measureVolume,
  Solid,
} from 'replicad';
import { CAD } from '../config.js';

export function buildShape(part, oc) {
  const g = part.geometry;
  const edges = [];
  let wire, face, shape;
  try {
    if (g.kind === 'revolve') {
      let last = g.start;
      for (const segment of g.segments) {
        const end = segment.points.at(-1);
        if (segment.kind === 'spline')
          edges.push(
            makeBSplineApproximation(
              segment.points.map(([r, z]) => [r, 0, z]),
              { tolerance: CAD.curveTolerance, degMax: 6 },
            ),
          );
        else edges.push(makeLine([last[0], 0, last[1]], [end[0], 0, end[1]]));
        last = end;
      }
      wire = assembleWire(edges);
      face = makeFace(wire);
      shape = revolution(face, [0, 0, 0], [0, 0, 1], 360);
    } else {
      const points = g.points.map(([x, r]) => [r + g.radius, -g.thickness / 2, x]);
      for (let i = 0; i < points.length; i++)
        edges.push(makeLine(points[i], points[(i + 1) % points.length]));
      wire = assembleWire(edges);
      face = makeFace(wire);
      const direction = new Vector([0, g.thickness, 0]);
      try {
        shape = basicFaceExtrusion(face, direction);
      } finally {
        direction.delete();
      }
      if (g.cant) shape = shape.rotate(g.cant, [g.radius, 0, 0], [1, 0, 0]);
      shape = shape.rotate(g.angle, [0, 0, 0], [0, 0, 1]);
    }
    shape = shape.translate(part.position);
    const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false);
    const valid = analyzer.IsValid_2();
    analyzer.delete();
    if (!valid || !(shape instanceof Solid) || !(measureVolume(shape) > 1e-8))
      throw new Error('The CAD kernel could not produce one valid solid.');
    return shape;
  } catch (error) {
    shape?.delete();
    throw new Error(`${part.name}: ${error instanceof Error ? error.message : 'CAD construction failed.'}`, {
      cause: error,
    });
  } finally {
    face?.delete();
    wire?.delete();
    edges.forEach((edge) => edge.delete());
  }
}
