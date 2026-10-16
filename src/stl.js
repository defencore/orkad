export function cleanBinarySTL(buffer) {
  const input = new DataView(buffer);
  const count = input.getUint32(80, true);
  if (buffer.byteLength !== 84 + count * 50) throw new Error('The CAD engine returned an invalid STL.');
  const vertices = [];
  const vertexMap = new Map();
  const triangles = [];
  const edges = new Map();
  const vertex = (offset) => {
    // Weld the tessellation seam and remove sub-micron numerical noise at the axis.
    const point = [0, 4, 8].map((d) => Math.fround(Math.round(input.getFloat32(offset + d, true) * 1e6) / 1e6));
    const key = point.join(',');
    if (!vertexMap.has(key)) { vertexMap.set(key, vertices.length); vertices.push(point); }
    return vertexMap.get(key);
  };
  for (let i = 0; i < count; i++) {
    const start = 84 + i * 50 + 12;
    const ids = [vertex(start), vertex(start + 12), vertex(start + 24)];
    if (new Set(ids).size < 3) continue;
    triangles.push(ids);
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const item = edges.get(key) || { count: 0, direction: 0 };
      item.count++; item.direction += a < b ? 1 : -1; edges.set(key, item);
    }
  }
  if (!triangles.length || [...edges.values()].some((e) => e.count !== 2 || e.direction !== 0)) throw new Error('The nose tessellation is not a closed manifold. Increase profile resolution or export through FreeCAD.');
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
