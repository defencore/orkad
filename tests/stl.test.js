import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBinarySTL } from '../src/stl.js';

function encode(triangles) {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((t, i) => t.flat().forEach((v, j) => view.setFloat32(84 + i * 50 + 12 + j * 4, v, true)));
  return buffer;
}
const a = [0, 0, 0],
  b = [1, 0, 0],
  c = [0, 1, 0],
  d = [0, 0, 1];
const tetrahedron = [
  [a, c, b],
  [a, b, d],
  [b, c, d],
  [c, a, d],
];

test('STL cleanup removes collapsed triangles and preserves a closed consistently oriented mesh', () => {
  const result = cleanBinarySTL(encode([...tetrahedron, [a, a, b]]));
  assert.equal(new DataView(result).getUint32(80, true), 4);
  assert.equal(result.byteLength, 284);
});

test('STL cleanup rejects a hole and inconsistent face orientation', () => {
  assert.throws(() => cleanBinarySTL(encode(tetrahedron.slice(1))), /closed manifold/);
  const reversed = [...tetrahedron];
  reversed[0] = [...reversed[0]].reverse();
  assert.throws(() => cleanBinarySTL(encode(reversed)), /closed manifold/);
});

test('STL validation rejects truncated files, non-finite vertices, and zero-volume shells', () => {
  assert.throws(() => cleanBinarySTL(new ArrayBuffer(20)), /invalid STL/);
  const invalid = encode(tetrahedron);
  new DataView(invalid).setFloat32(96, NaN, true);
  assert.throws(() => cleanBinarySTL(invalid), /non-finite/);
  const flat = tetrahedron.map((triangle) => triangle.map(([x, y]) => [x, y, 0]));
  assert.throws(() => cleanBinarySTL(encode(flat)), /closed manifold|no printable volume/);
});

test('STL normals and winding are corrected for a globally inverted closed solid', () => {
  const result = cleanBinarySTL(encode(tetrahedron.map((triangle) => [...triangle].reverse())));
  const view = new DataView(result);
  assert.ok([...new Float32Array(result.slice(84, 132))].every(Number.isFinite));
  assert.equal(view.getFloat32(84 + 8, true), -1);
});
