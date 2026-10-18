import { geometryFor } from './profiles.js';
import { validateSettings, validatePayload } from './cad/validate.js';

export const DEFAULT_SETTINGS = Object.freeze({ noseMode: 'source', wallThickness: 2, samples: 96 });

export function makePayload(model, settings) {
  validateSettings(settings);
  const parts = model.parts.map((part) => {
    if (
      part.type === 'nosecone' &&
      settings.noseMode === 'hollow' &&
      settings.wallThickness >= Math.max(part.foreRadius, part.aftRadius)
    )
      throw new Error(`${part.name}: the wall must be thinner than the base radius.`);
    return {
      id: part.id,
      sourceNodeId: part.sourceNodeId,
      name: part.name,
      type: part.type,
      color: part.color,
      position: [part.y, part.z, part.x],
      geometry: geometryFor(part, settings),
      length: part.length,
      material: part.material,
      internal: part.internal,
    };
  });
  const payload = {
    name: model.name,
    settings: { ...settings },
    warnings: [...model.warnings],
    nodes: model.nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      name: n.name,
      type: n.type,
      supported: n.supported,
    })),
    parts,
  };
  validatePayload(payload);
  return payload;
}

export function fileStem(name) {
  return (
    name
      .replace(/\.(ork|xml)$/i, '')
      .replace(/[^\p{L}\p{N}._-]+/gu, '_')
      .slice(0, 90) || 'rocket'
  );
}
