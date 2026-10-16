import { cleanBinarySTL } from './stl.js';
import initOpenCascade from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import wasmUrl from 'replicad-opencascadejs/src/replicad_with_exceptions.wasm?url';
import { setOC, makeLine, makeBSplineApproximation, assembleWire, makeFace, revolution, basicFaceExtrusion, Vector, measureVolume } from 'replicad';

let kernel;
async function getKernel() {
  if (!kernel) kernel = initOpenCascade({ locateFile: () => wasmUrl, print: () => {}, printErr: () => {} });
  const oc = await kernel;
  setOC(oc);
  return oc;
}

function buildShape(part, oc) {
  const g = part.geometry;
  const edges = [];
  let wire, face, shape;
  try {
    if (g.kind === 'revolve') {
      let last = g.start;
      for (const segment of g.segments) {
        const end = segment.points.at(-1);
        if (segment.kind === 'spline') edges.push(makeBSplineApproximation(segment.points.map(([r, z]) => [r, 0, z]), { tolerance: 1e-5, degMax: 6 }));
        else edges.push(makeLine([last[0], 0, last[1]], [end[0], 0, end[1]]));
        last = end;
      }
      wire = assembleWire(edges);
      face = makeFace(wire);
      shape = revolution(face, [0, 0, 0], [0, 0, 1], 360);
    } else {
      const points = g.points.map(([x, r]) => [r + g.radius, -g.thickness / 2, x]);
      for (let i = 0; i < points.length; i++) edges.push(makeLine(points[i], points[(i + 1) % points.length]));
      wire = assembleWire(edges);
      face = makeFace(wire);
      const direction = new Vector([0, g.thickness, 0]);
      try { shape = basicFaceExtrusion(face, direction); } finally { direction.delete(); }
      if (g.cant) shape = shape.rotate(g.cant, [g.radius, 0, 0], [1, 0, 0]);
      shape = shape.rotate(g.angle, [0, 0, 0], [0, 0, 1]);
    }
    shape = shape.translate(part.position);
    const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false);
    const valid = analyzer.IsValid_2();
    analyzer.delete();
    if (!valid || !(measureVolume(shape) > 1e-8)) throw new Error('The CAD kernel could not produce a valid solid.');
    return shape;
  } catch (error) {
    shape?.delete();
    throw new Error(`${part.name}: ${error instanceof Error ? error.message : 'CAD construction failed.'}`);
  } finally {
    face?.delete(); wire?.delete(); edges.forEach((edge) => edge.delete());
  }
}

function exportAssembly(payload, shapes, oc) {
  const owned = [];
  const own = (obj) => { owned.push(obj); return obj; };
  const str = (value) => own(new oc.TCollection_ExtendedString_2(value, true));
  const name = (label, value) => own(oc.TDataStd_Name.Set_1(label, str(value)));
  const filename = '/orkad.step';
  try {
    // The document handle owns the C++ document; deleting both would double-free it.
    const doc = new oc.TDocStd_Document(str('XmlOcaf'));
    const docHandle = own(new oc.Handle_TDocStd_Document_2(doc));
    const mainLabel = own(doc.Main());
    const toolHandle = own(oc.XCAFDoc_DocumentTool.ShapeTool(mainLabel));
    const colorHandle = own(oc.XCAFDoc_DocumentTool.ColorTool(mainLabel));
    const tool = toolHandle.get();
    const colors = colorHandle.get();
    oc.XCAFDoc_ShapeTool.SetAutoNaming(false);
    const labels = new Map();
    const location = own(new oc.TopLoc_Location_1());
    for (const node of payload.nodes) {
      const label = own(tool.NewShape());
      name(label, node.name);
      labels.set(node.id, label);
      if (node.parentId) own(tool.AddComponent_1(labels.get(node.parentId), label, location));
    }
    payload.parts.forEach((part, i) => {
      const label = own(tool.NewShape());
      tool.SetShape(label, shapes[i].wrapped);
      name(label, part.name);
      const rgb = part.color.match(/\w\w/g).map((v) => parseInt(v, 16) / 255);
      const color = own(new oc.Quantity_ColorRGBA_5(...rgb, 1));
      colors.SetColor_3(label, color, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
      own(tool.AddComponent_1(labels.get(part.sourceNodeId), label, location));
    });
    tool.UpdateAssemblies();
    const writer = own(new oc.STEPCAFControl_Writer_1());
    writer.SetNameMode(true);
    writer.SetColorMode(true);
    oc.Interface_Static.SetCVal('xstep.cascade.unit', 'MM');
    oc.Interface_Static.SetCVal('write.step.unit', 'MM');
    oc.Interface_Static.SetIVal('write.step.assembly', 2);
    oc.Interface_Static.SetIVal('write.step.schema', 4);
    const progress = own(new oc.Message_ProgressRange_1());
    const transferred = writer.Transfer_1(docHandle, oc.STEPControl_StepModelType.STEPControl_AsIs, null, progress);
    if (!transferred || writer.Write(filename) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('The CAD kernel could not write the STEP assembly.');
    return oc.FS.readFile(filename).slice();
  } finally {
    if (oc.FS.analyzePath(filename).exists) oc.FS.unlink(filename);
    owned.reverse().forEach((obj) => obj.delete());
  }
}

self.onmessage = async ({ data }) => {
  const { id, kind, payload, partId } = data;
  const shapes = [];
  try {
    self.postMessage({ id, progress: 'Loading the CAD engine…' });
    const oc = await getKernel();
    const parts = kind === 'stl' ? payload.parts.filter((p) => p.id === partId && p.type === 'nosecone') : payload.parts;
    if (!parts.length) throw new Error('Select a nose cone to export.');
    for (const [i, part] of parts.entries()) {
      self.postMessage({ id, progress: `Building ${part.name} (${i + 1}/${parts.length})…` });
      shapes.push(buildShape(part, oc));
    }
    self.postMessage({ id, progress: kind === 'step' ? 'Writing the named STEP assembly…' : 'Meshing the nose cone…' });
    let buffer;
    if (kind === 'step') buffer = exportAssembly(payload, shapes, oc).buffer;
    else buffer = cleanBinarySTL(await shapes[0].blobSTL({ tolerance: 0.03, angularTolerance: 0.12, binary: true }).arrayBuffer());
    self.postMessage({ id, buffer, solids: shapes.length }, [buffer]);
  } catch (error) {
    console.error('CAD export failure', error);
    self.postMessage({ id, error: error instanceof Error ? error.message : 'CAD export failed. Check the imported dimensions.' });
  } finally { shapes.forEach((shape) => shape.delete()); }
};
