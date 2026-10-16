export function generateFreeCAD(payload) {
  const encoded = btoa(Array.from(new TextEncoder().encode(JSON.stringify(payload)), (byte) => String.fromCharCode(byte)).join(''));
  const script = `# ORKAD: OpenRocket to a structured FreeCAD document.
# All dimensions are millimetres. No external Python packages are required.
# Curved profiles are B-spline approximations of the OpenRocket equations.
import base64
import json
import math
import os
import FreeCAD as App
import Part

_orkad_data = json.loads(base64.b64decode("${encoded}").decode("utf-8"))

def _orkad_vector(point):
    return App.Vector(point[0], 0, point[1])

def _orkad_shape(part):
    geometry = part["geometry"]
    edges = []
    if geometry["kind"] == "revolve":
        last = geometry["start"]
        for segment in geometry["segments"]:
            end = segment["points"][-1]
            if segment["kind"] == "spline":
                curve = Part.BSplineCurve()
                curve.approximate(Points=[_orkad_vector(p) for p in segment["points"]], DegMin=1, DegMax=6, Tolerance=0.00001)
                edges.append(curve.toShape())
            else:
                edges.append(Part.makeLine(_orkad_vector(last), _orkad_vector(end)))
            last = end
        shape = Part.Face(Part.Wire(edges)).revolve(App.Vector(0, 0, 0), App.Vector(0, 0, 1), 360)
    else:
        points = [App.Vector(r + geometry["radius"], -geometry["thickness"] / 2, x) for x, r in geometry["points"]]
        wire = Part.makePolygon(points + [points[0]])
        shape = Part.Face(wire).extrude(App.Vector(0, geometry["thickness"], 0))
        if geometry["cant"]:
            shape.rotate(App.Vector(geometry["radius"], 0, 0), App.Vector(1, 0, 0), geometry["cant"])
        shape.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), geometry["angle"])
    shape.translate(App.Vector(*part["position"]))
    if shape.isNull() or not shape.isValid() or len(shape.Solids) != 1 or shape.Volume <= 0:
        raise ValueError(part["name"] + ": failed to create one valid solid")
    return shape

# Build and validate all geometry before creating a document.
_orkad_shapes = [_orkad_shape(part) for part in _orkad_data["parts"]]
_orkad_doc = App.newDocument("ORKAD")
_orkad_groups = {}
_orkad_noses = []
try:
    for node in _orkad_data["nodes"]:
        group = _orkad_doc.addObject("App::Part", "Component")
        group.Label = node["name"]
        group.addProperty("App::PropertyString", "OpenRocketType", "OpenRocket")
        group.OpenRocketType = node["type"]
        group.addProperty("App::PropertyString", "ConversionStatus", "OpenRocket")
        group.ConversionStatus = "Converted" if node["supported"] else "Geometry omitted; see import report"
        _orkad_groups[node["id"]] = group
        if node["parentId"]:
            _orkad_groups[node["parentId"]].addObject(group)
    for part, shape in zip(_orkad_data["parts"], _orkad_shapes):
        obj = _orkad_doc.addObject("Part::Feature", "Solid")
        obj.Label = part["name"]
        obj.Shape = shape
        obj.addProperty("App::PropertyString", "OpenRocketType", "OpenRocket")
        obj.OpenRocketType = part["type"]
        obj.addProperty("App::PropertyString", "SourceMaterial", "OpenRocket")
        obj.SourceMaterial = part["material"]
        obj.addProperty("App::PropertyLength", "SourceLength", "OpenRocket")
        obj.SourceLength = part["length"]
        obj.addProperty("App::PropertyString", "GeometryNote", "OpenRocket")
        obj.GeometryNote = "Validated BREP solid; metadata is informational, not parametric"
        _orkad_groups[part["sourceNodeId"]].addObject(obj)
        if App.GuiUp:
            color = part["color"].lstrip("#")
            obj.ViewObject.ShapeColor = tuple(int(color[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
            obj.ViewObject.Deviation = 0.05
        if part["type"] == "nosecone":
            _orkad_noses.append(obj)
    _orkad_root = _orkad_groups[_orkad_data["nodes"][0]["id"]]
    _orkad_root.addProperty("App::PropertyStringList", "ImportReport", "OpenRocket")
    _orkad_root.ImportReport = _orkad_data["warnings"]
    _orkad_doc.recompute()
    if App.GuiUp:
        import FreeCADGui as Gui
        Gui.activeDocument().activeView().viewAxonometric()
        Gui.activeDocument().activeView().fitAll()
    App.Console.PrintMessage("ORKAD: created " + str(len(_orkad_shapes)) + " validated solids.\\n")
except Exception:
    App.closeDocument(_orkad_doc.Name)
    raise

def orkad_export_step(path=None):
    """Export the complete named assembly. Supply a path or use the save dialog."""
    import Import
    if path is None:
        from PySide import QtWidgets
        path = QtWidgets.QFileDialog.getSaveFileName(None, "Export STEP assembly", "rocket.step", "STEP files (*.step *.stp)")[0]
    if path:
        Import.export([_orkad_root], os.path.abspath(os.path.expanduser(path)))

def orkad_export_nose_stl(path=None, index=0):
    """Export one closed nose solid as a fine STL mesh for slicing."""
    import MeshPart
    if not _orkad_noses:
        raise ValueError("This project has no converted nose cone")
    if path is None:
        from PySide import QtWidgets
        path = QtWidgets.QFileDialog.getSaveFileName(None, "Export nose cone STL", "nose-cone.stl", "STL files (*.stl)")[0]
    if path:
        mesh = MeshPart.meshFromShape(Shape=_orkad_noses[index].Shape, LinearDeflection=0.03, AngularDeflection=0.12, Relative=False)
        mesh.write(os.path.abspath(os.path.expanduser(path)))

App.Console.PrintMessage("Save the document as FCStd, or run orkad_export_step() / orkad_export_nose_stl().\\n")
`;
  return { script, console: `exec(${JSON.stringify(script)})` };
}
