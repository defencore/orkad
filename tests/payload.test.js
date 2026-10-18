import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseOrk } from '../src/parser.js';
import { makePayload, DEFAULT_SETTINGS } from '../src/model.js';
import { validatePayload } from '../src/cad/validate.js';

const model = parseOrk(fs.readFileSync(new URL('../public/demo.xml', import.meta.url), 'utf8'), DOMParser);
const payload = () => makePayload(model, DEFAULT_SETTINGS);

test('conversion settings reject unsupported modes and resolutions', () => {
  assert.throws(() => makePayload(model, { ...DEFAULT_SETTINGS, noseMode: 'invalid' }), /construction/);
  assert.throws(() => makePayload(model, { ...DEFAULT_SETTINGS, samples: 4 }), /resolution/);
  assert.throws(() => makePayload(model, { ...DEFAULT_SETTINGS, wallThickness: NaN }), /wall thickness/);
});

test('CAD boundaries reject malformed hierarchies, duplicate IDs and invalid positions', () => {
  const wrongParent = payload();
  wrongParent.nodes[1].parentId = 'missing';
  assert.throws(() => validatePayload(wrongParent), /hierarchy/);
  const duplicate = payload();
  duplicate.parts[1].id = duplicate.parts[0].id;
  assert.throws(() => validatePayload(duplicate), /metadata/);
  const nonFinite = payload();
  nonFinite.parts[0].position[0] = Infinity;
  assert.throws(() => validatePayload(nonFinite), /metadata/);
});

test('CAD boundaries reject open contours and disconnected splines', () => {
  const open = payload();
  open.parts[0].geometry.segments.pop();
  assert.throws(() => validatePayload(open), /open/);
  const disconnected = payload();
  disconnected.parts[0].geometry.segments[0].points[0] = [1, 1];
  assert.throws(() => validatePayload(disconnected), /Disconnected/);
});

test('CAD boundaries reject missing export metadata and incompatible geometry', () => {
  const invalid = payload();
  delete invalid.parts[0].material;
  assert.throws(() => validatePayload(invalid), /metadata/);
  const missingReport = payload();
  delete missingReport.warnings;
  assert.throws(() => validatePayload(missingReport), /import report/);
  const wrongGeometry = payload();
  wrongGeometry.parts[0].type = 'trapezoidfinset';
  assert.throws(() => validatePayload(wrongGeometry), /incompatible/);
});
