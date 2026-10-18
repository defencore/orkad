import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import initOpenCascade from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import { setOC, measureVolume } from 'replicad';
import { geometryFixtures } from '../tests/geometry-fixtures.js';
import { buildShape } from '../src/cad/shape.js';
import { generateFreeCAD } from '../src/freecad.js';

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
const output = new URL('../test-results/native/', import.meta.url);
fs.mkdirSync(output, { recursive: true });
const manifest = [];
for (const { name, payload } of geometryFixtures()) {
  const script = `${name}.py`;
  fs.writeFileSync(new URL(script, output), generateFreeCAD(payload).script);
  const volumes = payload.parts.map((part) => {
    const shape = buildShape(part, oc);
    try {
      return measureVolume(shape);
    } finally {
      shape.delete();
    }
  });
  manifest.push({ name, script, volumes, nodes: payload.nodes.length });
}
fs.writeFileSync(new URL('manifest.json', output), JSON.stringify(manifest, null, 2));
console.log(
  `Prepared ${manifest.length} FreeCAD projects with independent browser-kernel reference volumes.`,
);
