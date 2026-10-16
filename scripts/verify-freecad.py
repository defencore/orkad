"""Verify browser exports using FreeCAD's bundled Python interpreter."""
import json
import pathlib
import FreeCAD as App
import Part
import Mesh
import Import

_project_root = pathlib.Path(__file__).resolve().parents[1]
_output = _project_root / "test-results" / "workspace-inspect-a-design-f81ae--export-validated-CAD-files"
_step_path = _output / "assembly.step"
_stl_path = _output / "nose.stl"
_python_path = _output / "generated_freecad.py"
for _path in (_step_path, _stl_path, _python_path):
    if not _path.exists():
        raise FileNotFoundError("Run the browser tests first: " + str(_path))

_test_shape = Part.Shape()
_test_shape.read(str(_step_path))
_test_step_volumes = [solid.Volume for solid in _test_shape.Solids]
assert len(_test_step_volumes) == 11
assert all(solid.isValid() and solid.Volume > 0 for solid in _test_shape.Solids)

_test_import_doc = App.newDocument("ORKAD_RoundTrip")
Import.insert(str(_step_path), _test_import_doc.Name)
_test_labels = [obj.Label for obj in _test_import_doc.Objects]
assert "Sustainer" in _test_labels
assert "Ogive nose cone" in _test_labels
assert any(obj.TypeId == "App::Part" and len(obj.Group) > 1 for obj in _test_import_doc.Objects)
App.closeDocument(_test_import_doc.Name)

_test_mesh = Mesh.Mesh(str(_stl_path))
assert _test_mesh.isSolid(), "The exported nose STL must be a closed solid"
assert _test_mesh.Volume > 0

# Exercise the one-line console entry point, including its string escaping.
_test_console = "exec(" + json.dumps(_python_path.read_text()) + ")"
exec(_test_console)
assert len(_orkad_shapes) == 11
assert all(solid.isValid() and len(solid.Solids) == 1 for solid in _orkad_shapes)
assert abs(_test_mesh.Volume - _orkad_noses[0].Shape.Volume) / _test_mesh.Volume < 0.002
_test_step_volume = sum(_test_step_volumes)
assert abs(_test_step_volume - sum(solid.Volume for solid in _orkad_shapes)) / _test_step_volume < 0.0001
print("PASS: STEP hierarchy, 11 valid solids, closed STL, console execution and volume agreement")
App.closeDocument(_orkad_doc.Name)
