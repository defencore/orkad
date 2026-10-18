import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import { setOC, measureVolume, Solid } from 'replicad';
import { buildShape } from '../src/cad/shape.js';
import { exportAssembly } from '../src/cad/step.js';
import { cleanBinarySTL } from '../src/stl.js';
import { radialGeometry } from '../src/radial-geometry.js';
import { DEFAULT_SETTINGS } from '../src/model.js';
import { geometryFixtures } from './geometry-fixtures.js';

// The upstream Emscripten Node loader expects CommonJS runtime bindings.
globalThis.__dirname = path.dirname(
  fileURLToPath(import.meta.resolve('replicad-opencascadejs/src/replicad_with_exceptions.js')),
);
globalThis.require = createRequire(import.meta.url);
const oc = await initOpenCascade({
  wasmBinary: fs.readFileSync(path.join(globalThis.__dirname, 'replicad_with_exceptions.wasm')),
  print: () => {},
  printErr: () => {},
});
setOC(oc);

for (const { name, payload } of geometryFixtures()) {
  test(`CAD solid validation: ${name}`, async () => {
    for (const part of payload.parts) {
      const shape = buildShape(part, oc);
      try {
        assert.ok(shape instanceof Solid, `${part.name} must contain exactly one solid`);
        assert.ok(measureVolume(shape) > 0);
        if (part.type === 'nosecone') {
          const stl = cleanBinarySTL(
            await shape.blobSTL({ tolerance: 0.03, angularTolerance: 0.12, binary: true }).arrayBuffer(),
          );
          assert.ok(stl.byteLength > 84);
        }
      } finally {
        shape.delete();
      }
    }
  });
}

test('STEP assembly can be exported repeatedly without corrupting CAD ownership', () => {
  const payload = geometryFixtures().at(-2).payload;
  const shapes = payload.parts.map((part) => buildShape(part, oc));
  try {
    for (let iteration = 0; iteration < 3; iteration++) {
      const step = new TextDecoder().decode(exportAssembly(payload, shapes, oc));
      assert.equal((step.match(/MANIFOLD_SOLID_BREP/g) || []).length, 11);
      assert.match(step, /automotive_design/);
      assert.match(step, /NEXT_ASSEMBLY_USAGE_OCCURRENCE/);
    }
  } finally {
    shapes.forEach((shape) => shape.delete());
  }
});

test('a zero-exponent power nose retains a cylindrical cavity and an axial end wall', () => {
  const node = {
    type: 'nosecone',
    shape: 'power',
    parameter: 0,
    foreRadius: 0,
    aftRadius: 27,
    length: 190,
    thickness: 2,
  };
  const expected = Math.PI * (27 ** 2 * 190 - 25 ** 2 * 188);
  for (const flipped of [false, true]) {
    const current = flipped ? { ...node, foreRadius: 27, aftRadius: 0 } : node;
    const shape = buildShape(
      { name: 'Flat power nose', position: [0, 0, 0], geometry: radialGeometry(current, DEFAULT_SETTINGS) },
      oc,
    );
    try {
      assert.ok(Math.abs(measureVolume(shape) - expected) / expected < 1e-9);
    } finally {
      shape.delete();
    }
  }
});
