export const LIMITS = Object.freeze({
  fileBytes: 20 * 1024 * 1024,
  xmlBytes: 12 * 1024 * 1024,
  sourceNodes: 1500,
  expandedNodes: 1500,
  solidParts: 2000,
  depth: 32,
  instances: 64,
  dimension: 1e6,
  finPoints: 4096,
});

export const GROUP_TYPES = new Set(['rocket', 'stage', 'axialstage', 'parallelstage', 'podset', 'assembly']);
export const INSTANCE_TYPES = new Set(['parallelstage', 'podset']);
export const SERIAL_TYPES = new Set(['stage', 'axialstage', 'nosecone', 'bodytube', 'transition']);
export const SYMMETRIC_TYPES = new Set(['bodytube', 'nosecone', 'transition']);
export const RADIAL_TYPES = new Set([
  'nosecone',
  'bodytube',
  'transition',
  'innertube',
  'tubecoupler',
  'centeringring',
  'bulkhead',
  'engineblock',
  'launchlug',
]);
export const FIN_TYPES = new Set(['trapezoidfinset', 'ellipticalfinset', 'freeformfinset']);
export const INTERNAL_TYPES = new Set([
  'innertube',
  'tubecoupler',
  'centeringring',
  'bulkhead',
  'engineblock',
]);
export const PROFILE_DEFAULTS = Object.freeze({
  conical: 0,
  ogive: 1,
  ellipsoid: 0,
  power: 0.5,
  parabolic: 1,
  haack: 0,
});
export const PROFILE_RANGES = Object.freeze({
  conical: [0, 1],
  ogive: [0, 1],
  ellipsoid: [0, 1],
  power: [0, 1],
  parabolic: [0, 1],
  haack: [0, 1 / 3],
});
export const PROFILE_SAMPLES = Object.freeze([48, 96, 192]);
export const NOSE_MODES = Object.freeze(['source', 'hollow', 'solid']);
export const CAD = Object.freeze({
  curveTolerance: 1e-5,
  meshTolerance: 0.03,
  meshAngle: 0.12,
  exportTimeout: 180000,
});
export const EPSILON = 1e-7;
