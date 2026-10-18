/** @param {ArrayBuffer} buffer */
export function cleanBinarySTL(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 84)
    throw new Error('The CAD engine returned an invalid STL.');
  const input = new DataView(buffer);
  const count = input.getUint32(80, true);
  if (buffer.byteLength !== 84 + count * 50) throw new Error('The CAD engine returned an invalid STL.');
  /** @type {number[][]} */
  const vertices = [];
  const vertexMap = new Map();
  const triangles = [];
  const edges = new Map();
  /** @param {number} offset */
  const vertex = (offset) => {
    // Weld the tessellation seam and remove sub-micron numerical noise at the axis.
    const point = [0, 4, 8].map((d) =>
      Math.fround(Math.round(input.getFloat32(offset + d, true) * 1e6) / 1e6),
    );
    if (point.some((value) => !Number.isFinite(value)))
      throw new Error('The STL contains non-finite coordinates.');
    const key = point.join(',');
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length;
    vertexMap.set(key, index);
    vertices.push(point);
    return index;
  };
  for (let i = 0; i < count; i++) {
    const start = 84 + i * 50 + 12;
    const ids = [vertex(start), vertex(start + 12), vertex(start + 24)];
    if (new Set(ids).size < 3) continue;
    const [a, b, c] = ids.map((id) => vertices[id]);
    const ab = b.map((value, axis) => value - a[axis]);
    const ac = c.map((value, axis) => value - a[axis]);
    if (
      Math.hypot(
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ) < 1e-15
    )
      continue;
    triangles.push(ids);
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const item = edges.get(key) || { count: 0, direction: 0 };
      item.count++;
      item.direction += a < b ? 1 : -1;
      edges.set(key, item);
    }
  }
  if (!triangles.length || [...edges.values()].some((e) => e.count !== 2 || e.direction !== 0))
    throw new Error(
      'The nose tessellation is not a closed manifold. Increase profile resolution or export through FreeCAD.',
    );
  const origin = vertices[triangles[0][0]];
  const volume = triangles.reduce((sum, ids) => {
    const [a, b, c] = ids.map((id) => vertices[id].map((value, axis) => value - origin[axis]));
    return (
      sum +
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6
    );
  }, 0);
  if (!Number.isFinite(volume) || Math.abs(volume) < 1e-12)
    throw new Error('The STL has no printable volume.');
  if (volume < 0) triangles.forEach((ids) => ids.reverse());
  const output = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(output);
  new Uint8Array(output).set(new TextEncoder().encode('ORKAD - validated closed nose cone - millimetres'));
  view.setUint32(80, triangles.length, true);
  triangles.forEach((ids, i) => {
    const points = ids.map((id) => vertices[id]);
    const u = points[1].map((v, j) => v - points[0][j]);
    const v = points[2].map((n, j) => n - points[0][j]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal);
    const values = [...normal.map((n) => n / length), ...points.flat()];
    values.forEach((value, j) => view.setFloat32(84 + i * 50 + j * 4, value, true));
  });
  return output;
}
