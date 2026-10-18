export const FREECAD_TEMPLATE = String.raw`# ORKAD: OpenRocket to a structured FreeCAD document.
# All dimensions are millimetres. No external Python packages are required.
# Curved profiles are B-spline approximations of the OpenRocket equations.
def _orkad_create(encoded):
    import base64
    import json
    import os
    import FreeCAD as App
    import Part

    def vector(point):
        return App.Vector(point[0], 0, point[1])
    
    def build_shape(part):
        geometry = part["geometry"]
        edges = []
        if geometry["kind"] == "revolve":
            last = geometry["start"]
            for segment in geometry["segments"]:
                end = segment["points"][-1]
                if segment["kind"] == "spline":
                    curve = Part.BSplineCurve()
                    curve.approximate(Points=[vector(p) for p in segment["points"]], DegMin=1, DegMax=6, Tolerance=0.00001)
                    edges.append(curve.toShape())
                else:
                    edges.append(Part.makeLine(vector(last), vector(end)))
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
    

    class Project:
        def __init__(self, data):
            self.shapes = [build_shape(part) for part in data["parts"]]
            self.document = App.newDocument("ORKAD")
            self.noses = []
            self.groups = {}
            try:
                for node in data["nodes"]:
                    group = self.document.addObject("App::Part", "Component")
                    group.Label = node["name"]
                    group.addProperty("App::PropertyString", "OpenRocketType", "OpenRocket")
                    group.OpenRocketType = node["type"]
                    group.addProperty("App::PropertyString", "ConversionStatus", "OpenRocket")
                    group.ConversionStatus = "Converted" if node["supported"] else "Geometry omitted; see import report"
                    self.groups[node["id"]] = group
                    if node["parentId"]:
                        self.groups[node["parentId"]].addObject(group)
                for part, shape in zip(data["parts"], self.shapes):
                    obj = self.document.addObject("Part::Feature", "Solid")
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
                    self.groups[part["sourceNodeId"]].addObject(obj)
                    if App.GuiUp:
                        color = part["color"].lstrip("#")
                        obj.ViewObject.ShapeColor = tuple(int(color[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
                        obj.ViewObject.Deviation = 0.05
                    if part["type"] == "nosecone":
                        self.noses.append(obj)
                self.root = self.groups[data["nodes"][0]["id"]]
                self.root.addProperty("App::PropertyStringList", "ImportReport", "OpenRocket")
                self.root.ImportReport = data["warnings"]
                self.document.recompute()
                if App.GuiUp:
                    import FreeCADGui as Gui
                    Gui.activeDocument().activeView().viewAxonometric()
                    Gui.activeDocument().activeView().fitAll()
                App.Console.PrintMessage("ORKAD: created " + str(len(self.shapes)) + " validated solids.\n")
            except Exception:
                App.closeDocument(self.document.Name)
                raise

        def check_open(self):
            try:
                if App.getDocument(self.document.Name) is not None and self.document.getObject(self.root.Name) == self.root:
                    return
            except Exception:
                pass
            raise ValueError("The ORKAD document is closed. Run the project script again.")

        def destination(self, path, title, filename, file_filter):
            self.check_open()
            if path is None:
                if not App.GuiUp:
                    raise ValueError("Supply an export path when running without the FreeCAD GUI")
                from PySide import QtWidgets
                path = QtWidgets.QFileDialog.getSaveFileName(None, title, filename, file_filter)[0]
            return os.path.abspath(os.path.expanduser(os.fspath(path))) if path else None

        def export_step(self, path=None):
            """Export the complete named assembly. Supply a path or use the save dialog."""
            import Import
            path = self.destination(path, "Export STEP assembly", "rocket.step", "STEP files (*.step *.stp)")
            if path:
                Import.export([self.root], path)

        def export_nose_stl(self, path=None, index=0):
            """Export one closed nose solid as a fine STL mesh for slicing."""
            import MeshPart
            self.check_open()
            if not isinstance(index, int) or isinstance(index, bool) or index < 0 or index >= len(self.noses):
                raise ValueError("Choose a valid nose cone index between 0 and " + str(len(self.noses) - 1))
            path = self.destination(path, "Export nose cone STL", "nose-cone.stl", "STL files (*.stl)")
            if path:
                mesh = MeshPart.meshFromShape(Shape=self.noses[index].Shape, LinearDeflection=0.03, AngularDeflection=0.12, Relative=False)
                if not mesh.isSolid() or mesh.Volume <= 0:
                    raise ValueError("The nose tessellation is not a closed printable solid")
                mesh.write(path)

    project = Project(json.loads(base64.b64decode(encoded).decode("utf-8")))
    App.Console.PrintMessage("Save the document as FCStd, or run orkad_export_step() / orkad_export_nose_stl().\n")
    return project

_orkad_project = _orkad_create("__ORKAD_PAYLOAD__")
orkad_export_step = _orkad_project.export_step
orkad_export_nose_stl = _orkad_project.export_nose_stl
del _orkad_create
`;
