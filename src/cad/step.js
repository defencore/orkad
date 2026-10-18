export function exportAssembly(payload, shapes, oc) {
  const owned = [];
  const own = (obj) => {
    owned.push(obj);
    return obj;
  };
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
    const transferred = writer.Transfer_1(
      docHandle,
      oc.STEPControl_StepModelType.STEPControl_AsIs,
      null,
      progress,
    );
    if (!transferred || writer.Write(filename) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone)
      throw new Error('The CAD kernel could not write the STEP assembly.');
    return oc.FS.readFile(filename).slice();
  } finally {
    if (oc.FS.analyzePath(filename).exists) oc.FS.unlink(filename);
    owned.reverse().forEach((obj) => obj.delete());
  }
}
