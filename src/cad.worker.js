import { cleanBinarySTL } from './stl.js';
import initOpenCascade from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import wasmUrl from 'replicad-opencascadejs/src/replicad_with_exceptions.wasm?url';
import { setOC } from 'replicad';
import { buildShape } from './cad/shape.js';
import { exportAssembly } from './cad/step.js';
import { validatePayload } from './cad/validate.js';
import { CAD } from './config.js';

let kernel;
async function getKernel() {
  if (!kernel) kernel = initOpenCascade({ locateFile: () => wasmUrl, print: () => {}, printErr: () => {} });
  let oc;
  try {
    oc = await kernel;
  } catch (error) {
    kernel = null;
    throw error;
  }
  setOC(oc);
  return oc;
}

let busy = false;
self.onmessage = async ({ data }) => {
  const { id, kind, payload, partId } = data || {};
  if (busy) {
    self.postMessage({ id, error: 'A CAD export is already running.' });
    return;
  }
  busy = true;
  const shapes = [];
  try {
    if (!['step', 'stl'].includes(kind)) throw new Error('Unsupported CAD export format.');
    validatePayload(payload);
    self.postMessage({ id, progress: 'Loading the CAD engine…' });
    const oc = await getKernel();
    const parts =
      kind === 'stl' ? payload.parts.filter((p) => p.id === partId && p.type === 'nosecone') : payload.parts;
    if (!parts.length) throw new Error('Select a nose cone to export.');
    for (const [i, part] of parts.entries()) {
      self.postMessage({ id, progress: `Building ${part.name} (${i + 1}/${parts.length})…` });
      shapes.push(buildShape(part, oc));
    }
    self.postMessage({
      id,
      progress: kind === 'step' ? 'Writing the named STEP assembly…' : 'Meshing the nose cone…',
    });
    let buffer;
    if (kind === 'step') buffer = exportAssembly(payload, shapes, oc).buffer;
    else
      buffer = cleanBinarySTL(
        await shapes[0]
          .blobSTL({ tolerance: CAD.meshTolerance, angularTolerance: CAD.meshAngle, binary: true })
          .arrayBuffer(),
      );
    self.postMessage({ id, buffer, solids: shapes.length }, [buffer]);
  } catch (error) {
    console.error('CAD export failure', error);
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'CAD export failed. Check the imported dimensions.',
    });
  } finally {
    shapes.forEach((shape) => shape.delete());
    busy = false;
  }
};
