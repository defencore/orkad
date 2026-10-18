import { FREECAD_TEMPLATE } from './cad/freecad-template.js';
import { validatePayload } from './cad/validate.js';

export function generateFreeCAD(payload) {
  validatePayload(payload);
  const encoded = btoa(
    Array.from(new TextEncoder().encode(JSON.stringify(payload)), (byte) => String.fromCharCode(byte)).join(
      '',
    ),
  );
  const script = FREECAD_TEMPLATE.replace('__ORKAD_PAYLOAD__', encoded);
  return { script, console: `exec(${JSON.stringify(script)})` };
}
