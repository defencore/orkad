import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { gzipSync, strToU8, zipSync } from 'fflate';
import { decodeOrk, parseOrk } from '../src/parser.js';
import { LIMITS } from '../src/config.js';
import { normalizePolygon } from '../src/geometry.js';

const parse = (xml) => parseOrk(xml, DOMParser);
const wrap = (content) =>
  `<openrocket><rocket><subcomponents>${content}</subcomponents></rocket></openrocket>`;
const stage = (content) => `<stage><subcomponents>${content}</subcomponents></stage>`;
const tube = (content = '', radius = '0.025') =>
  `<bodytube><length>0.5</length><radius>${radius}</radius><thickness>0.001</thickness>${content}</bodytube>`;

test('direct parser rejects external entities and XML byte limits', () => {
  assert.throws(() => parse('<!DOCTYPE openrocket><openrocket/>'), /document types/);
  assert.throws(() => parse('é'.repeat(LIMITS.xmlBytes / 2 + 1)), /12 MB/);
});

test('archives reject ambiguous designs, truncated GZIP, and malformed UTF-8', () => {
  assert.throws(
    () =>
      decodeOrk(
        zipSync({
          'rocket.ork': strToU8(wrap(stage(tube()))),
          'nested/rocket.ork': strToU8(wrap(stage(tube()))),
        }),
      ),
    /multiple rocket/,
  );
  assert.throws(() => decodeOrk(new Uint8Array([0x1f, 0x8b])), /truncated/);
  assert.throws(() => decodeOrk(new Uint8Array([0xff, 0xfe, 0xff])), /cannot be decoded/);
});

test('GZIP decompression enforces actual output size with a forged footer', () => {
  const bytes = gzipSync(strToU8('a'.repeat(LIMITS.xmlBytes + 1)));
  new DataView(bytes.buffer).setUint32(bytes.length - 4, 1, true);
  assert.throws(() => decodeOrk(bytes), /12 MB/);
});

test('negative dimensions, fractional instances, and invalid profile parameters fail clearly', () => {
  for (const [content, message] of [
    [tube().replace('0.5', '-0.5'), /invalid length/],
    [tube('<instancecount>1.5</instancecount>'), /instance count/],
    [tube('<cant>91</cant>'), /cant/],
    [
      '<nosecone><length>0.1</length><aftradius>0.025</aftradius><shape>haack</shape><shapeparameter>0.8</shapeparameter></nosecone>',
      /profile parameter/,
    ],
  ]) {
    assert.throws(() => parse(wrap(stage(content))), message);
  }
});

test('serial stage lengths include gaps so the following stage does not overlap', () => {
  const first = stage(
    tube().replace('</length>', '</length><axialoffset method="after">0.1</axialoffset>') + tube(),
  );
  const model = parse(wrap(first + stage(tube())));
  assert.deepEqual(
    model.parts.map((part) => part.x),
    [100, 600, 1100],
  );
  assert.equal(model.maxX, 1600);
});

test('unresolved automatic radii are rejected or use an explicitly stored value', () => {
  assert.throws(() => parse(wrap(stage(tube('', 'auto')))), /could not be resolved/);
  const model = parse(wrap(stage(tube('', 'auto 0.019'))));
  assert.equal(model.parts[0].radius, 19);
  assert.match(model.warnings[0], /stored OpenRocket value/);
});

test('automatic radii do not leak across independent booster axes', () => {
  const pod = `<podset><radiusoffset method="free">0.1</radiusoffset><subcomponents>${tube('', 'auto 0.010')}</subcomponents></podset>`;
  const model = parse(wrap(stage(tube(`<subcomponents>${pod}</subcomponents>`))));
  assert.deepEqual(
    model.parts.map((part) => part.radius),
    [25, 10],
  );
});

test('ordinary radial offsets are inherited by internal components', () => {
  const internal = '<bulkhead><length>0.01</length><outerradius>auto</outerradius></bulkhead>';
  const model = parse(
    wrap(
      stage(
        tube(
          `<radialposition>0.1</radialposition><radialdirection>90</radialdirection><subcomponents>${internal}</subcomponents>`,
        ),
      ),
    ),
  );
  assert.ok(model.parts.every((part) => Math.abs(part.z - 100) < 1e-8));
  assert.ok(model.parts.every((part) => Math.abs(part.y) < 1e-8));
});

test('automatic ring holes use tubes that overlap the ring axially', () => {
  const inner = (radius, offset) =>
    `<innertube><length>0.1</length><outerradius>${radius}</outerradius><thickness>0.001</thickness><axialoffset method="top">${offset}</axialoffset></innertube>`;
  const ring =
    '<centeringring><length>0.01</length><outerradius>auto</outerradius><innerradius>auto</innerradius><axialoffset method="top">0</axialoffset></centeringring>';
  const model = parse(
    wrap(stage(tube(`<subcomponents>${inner('.01', '0')}${inner('.02', '.2')}${ring}</subcomponents>`))),
  );
  assert.equal(model.parts.find((part) => part.type === 'centeringring').thickness, 14);
});

test('fin outlines remove a repeated closing point and reject invalid polygons', () => {
  assert.deepEqual(
    normalizePolygon([
      [0, 0],
      [1, 2],
      [3, 0],
      [0, 0],
    ]),
    [
      [0, 0],
      [1, 2],
      [3, 0],
    ],
  );
  assert.throws(
    () =>
      normalizePolygon([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    /zero area/,
  );
  assert.throws(
    () =>
      normalizePolygon([
        [0, 0],
        [3, 2],
        [0, 2],
        [2, 0],
      ]),
    /intersects/,
  );
});

test('expanded instance wrappers obey the component budget', () => {
  const pod = (content) =>
    `<podset><instancecount>64</instancecount><subcomponents>${content}</subcomponents></podset>`;
  assert.throws(() => parse(wrap(stage(pod(pod(tube()))))), /1,500 component limit/);
});
