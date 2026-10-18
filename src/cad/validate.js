import { RADIAL_TYPES, FIN_TYPES, LIMITS, NOSE_MODES, PROFILE_SAMPLES } from '../config.js';
import { samePoint, normalizePolygon } from '../geometry.js';

export function validateSettings(settings) {
  if (!settings || !NOSE_MODES.includes(settings.noseMode))
    throw new Error('Choose a supported nose construction.');
  if (
    !Number.isFinite(settings.wallThickness) ||
    settings.wallThickness < 0.2 ||
    settings.wallThickness > 100
  )
    throw new Error('Nose wall thickness must be between 0.2 and 100 mm.');
  if (!PROFILE_SAMPLES.includes(settings.samples)) throw new Error('Choose a supported profile resolution.');
}

const vector = (value, count) =>
  Array.isArray(value) &&
  value.length === count &&
  value.every((number) => Number.isFinite(number) && Math.abs(number) <= LIMITS.dimension * 2);

export function validateGeometry(geometry) {
  if (!geometry) throw new Error('Missing component geometry.');
  if (geometry.kind === 'fin') {
    if (
      !(geometry.thickness > 0) ||
      !Number.isFinite(geometry.thickness) ||
      geometry.thickness > LIMITS.dimension ||
      !Number.isFinite(geometry.radius) ||
      !Number.isFinite(geometry.angle) ||
      !Number.isFinite(geometry.cant) ||
      !Array.isArray(geometry.points) ||
      geometry.points.length > LIMITS.finPoints ||
      geometry.points.some((point) => !vector(point, 2))
    )
      throw new Error('Invalid fin dimensions.');
    normalizePolygon(geometry.points);
  } else if (geometry.kind === 'revolve') {
    if (
      !vector(geometry.start, 2) ||
      geometry.start[0] < 0 ||
      !Array.isArray(geometry.segments) ||
      geometry.segments.length < 3 ||
      geometry.segments.length > 1000
    )
      throw new Error('Invalid radial contour.');
    let last = geometry.start;
    for (const segment of geometry.segments) {
      if (
        !['line', 'spline'].includes(segment.kind) ||
        !Array.isArray(segment.points) ||
        !segment.points.length ||
        segment.points.length > 1000 ||
        segment.points.some((point) => !vector(point, 2) || point[0] < 0)
      )
        throw new Error('Invalid contour segment.');
      if (segment.kind === 'spline' && (segment.points.length < 3 || !samePoint(last, segment.points[0])))
        throw new Error('Disconnected profile curve.');
      if (samePoint(last, segment.points.at(-1))) throw new Error('A contour segment has zero length.');
      last = segment.points.at(-1);
    }
    if (!samePoint(last, geometry.start)) throw new Error('The radial contour is open.');
  } else throw new Error('Unsupported component geometry.');
}

export function validatePayload(payload) {
  if (!payload || typeof payload.name !== 'string') throw new Error('Invalid CAD project.');
  validateSettings(payload.settings);
  if (!Array.isArray(payload.warnings) || payload.warnings.some((warning) => typeof warning !== 'string'))
    throw new Error('Invalid CAD import report.');
  if (
    !Array.isArray(payload.nodes) ||
    !payload.nodes.length ||
    payload.nodes.length > LIMITS.expandedNodes ||
    !Array.isArray(payload.parts) ||
    !payload.parts.length ||
    payload.parts.length > LIMITS.solidParts
  )
    throw new Error('Invalid CAD component count.');
  const nodes = new Set();
  for (const [index, node] of payload.nodes.entries()) {
    if (
      !node ||
      typeof node.id !== 'string' ||
      !node.id ||
      nodes.has(node.id) ||
      typeof node.name !== 'string' ||
      typeof node.type !== 'string' ||
      typeof node.supported !== 'boolean' ||
      (index === 0 ? node.parentId !== null : !nodes.has(node.parentId))
    )
      throw new Error('Invalid CAD assembly hierarchy.');
    nodes.add(node.id);
  }
  const parts = new Set();
  for (const part of payload.parts) {
    if (
      !part ||
      typeof part.id !== 'string' ||
      !part.id ||
      parts.has(part.id) ||
      !nodes.has(part.sourceNodeId) ||
      typeof part.name !== 'string' ||
      (!RADIAL_TYPES.has(part.type) && !FIN_TYPES.has(part.type)) ||
      typeof part.material !== 'string' ||
      typeof part.internal !== 'boolean' ||
      !Number.isFinite(part.length) ||
      part.length <= 0 ||
      part.length > LIMITS.dimension ||
      !/^#[0-9a-f]{6}$/i.test(part.color) ||
      !vector(part.position, 3)
    )
      throw new Error('Invalid CAD component metadata.');
    parts.add(part.id);
    validateGeometry(part.geometry);
    if (RADIAL_TYPES.has(part.type) !== (part.geometry.kind === 'revolve'))
      throw new Error('The CAD component has incompatible geometry.');
  }
}
