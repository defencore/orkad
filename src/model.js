import { geometryFor } from './profiles.js';

export const DEFAULT_SETTINGS = { noseMode: 'source', wallThickness: 2, samples: 96 };

export function makePayload(model, settings) {
  if (!Number.isFinite(settings.wallThickness) || settings.wallThickness < 0.2 || settings.wallThickness > 100) throw new Error('Nose wall thickness must be between 0.2 and 100 mm.');
  if (![48, 96, 192].includes(settings.samples)) throw new Error('Choose a supported profile resolution.');
  const parts = model.parts.map((part) => {
    if (part.type === 'nosecone' && settings.noseMode === 'hollow' && settings.wallThickness >= Math.max(part.foreRadius, part.aftRadius)) throw new Error(`${part.name}: the wall must be thinner than the base radius.`);
    return { id: part.id, sourceNodeId: part.sourceNodeId, name: part.name, type: part.type, color: part.color, position: [part.y, part.z, part.x], geometry: geometryFor(part, settings), length: part.length, material: part.material, internal: part.internal };
  });
  return { name: model.name, settings: { ...settings }, warnings: [...model.warnings], nodes: model.nodes.map((n) => ({ id: n.id, parentId: n.parentId, name: n.name, type: n.type, supported: n.supported })), parts };
}

export function fileStem(name) {
  return name.replace(/\.(ork|xml)$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 90) || 'rocket';
}
