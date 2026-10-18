"""Verify native FreeCAD projects and browser CAD exports with FreeCAD's Python."""
import json
import pathlib
import FreeCAD as App
import Part
import Mesh
import Import


def verify_projects(output):
    manifest = json.loads((output / "manifest.json").read_text())
    namespace = {"shape": "user shape", "part": "user part"}
    for case in manifest:
        script = (output / case["script"]).read_text()
        exec("exec(" + json.dumps(script) + ")", namespace)
        project = namespace["_orkad_project"]
        assert namespace["shape"] == "user shape" and namespace["part"] == "user part"
        assert len(project.shapes) == len(case["volumes"]), case["name"]
        assert len(project.groups) == case["nodes"], case["name"]
        for shape, reference in zip(project.shapes, case["volumes"]):
            assert shape.isValid() and len(shape.Solids) == 1 and shape.Volume > 0, case["name"]
            assert abs(shape.Volume - reference) / reference < 0.0001, case["name"]
        if case["name"] == "ogive-hollow":
            project.export_nose_stl(str(output / "native-nose.stl"))
            mesh = Mesh.Mesh(str(output / "native-nose.stl"))
            assert mesh.isSolid() and mesh.Volume > 0
            for index in (-1, len(project.noses), 0.5, True):
                try:
                    project.export_nose_stl(str(output / "invalid.stl"), index=index)
                    raise AssertionError("Invalid nose index was accepted")
                except ValueError:
                    pass
        if case["name"] == "demo.xml":
            saved_export = namespace["orkad_export_step"]
            saved_project = project
            continue
        if case["name"] == "triad-heavy.xml":
            saved_export(str(output / "bound-first-project.step"))
            shape = Part.Shape()
            shape.read(str(output / "bound-first-project.step"))
            assert len(shape.Solids) == 11, "A saved helper must retain its original project"
            project.export_step(str(output / "native-heavy.step"))
            App.closeDocument(saved_project.document.Name)
            try:
                saved_export(str(output / "closed-project.step"))
                raise AssertionError("A closed document export was accepted")
            except ValueError:
                pass
        App.closeDocument(project.document.Name)
        print("PASS native project: " + case["name"])
    print("PASS: " + str(len(manifest)) + " native FreeCAD geometry configurations")


def verify_browser(output):
    candidates = list(output.glob("*/generated_freecad.py"))
    if len(candidates) != 1:
        raise FileNotFoundError("Run the browser tests first; expected one generated_freecad.py")
    directory = candidates[0].parent
    step = Part.Shape()
    step.read(str(directory / "assembly.step"))
    assert len(step.Solids) == 11
    assert all(solid.isValid() and solid.Volume > 0 for solid in step.Solids)
    document = App.newDocument("ORKAD_RoundTrip")
    Import.insert(str(directory / "assembly.step"), document.Name)
    labels = [obj.Label for obj in document.Objects]
    assert "Sustainer" in labels and "Ogive nose cone" in labels
    assert any(obj.TypeId == "App::Part" and len(obj.Group) > 1 for obj in document.Objects)
    App.closeDocument(document.Name)
    mesh = Mesh.Mesh(str(directory / "nose.stl"))
    assert mesh.isSolid() and mesh.Volume > 0
    namespace = {}
    exec("exec(" + json.dumps(candidates[0].read_text()) + ")", namespace)
    project = namespace["_orkad_project"]
    assert len(project.shapes) == 11
    assert abs(mesh.Volume - project.noses[0].Shape.Volume) / mesh.Volume < 0.002
    assert abs(step.Volume - sum(shape.Volume for shape in project.shapes)) / step.Volume < 0.0001
    App.closeDocument(project.document.Name)
    print("PASS: browser STEP hierarchy, STL topology, console execution and volume agreement")


if __name__ == "__main__":
    results = pathlib.Path(__file__).resolve().parents[1] / "test-results"
    verify_projects(results / "native")
    verify_browser(results)
