# ORKAD

A browser-based OpenRocket to CAD converter for **orkad.defencore.com**. Import an `.ork` design, inspect it with Three.js, and export a named STEP assembly, a printable nose cone STL, or a paste-ready FreeCAD Python command.

The application is static. Files are processed on the device. No backend, API key, account, CDN, or file upload is required. The CAD engine is loaded from the same site only when an export starts.

## Use

1. Open an OpenRocket `.ork` file, or choose **TRIAD Heavy / H9** to open the heavy-lift demonstrator.
2. Orbit the model, select components, and inspect the cavity with **X-ray** or **Section view**. Review the import report.
3. Choose the nose construction: original settings, a radial wall thickness for printing, or a solid nose.
4. Download the **STEP assembly**, open **Create in FreeCAD**, or download the **nose cone STL**. With multiple nose cones, select the one to export in the tree.

In FreeCAD, use **View → Panels → Python console**, paste the complete `exec(...)` command, and press Enter. The generated script creates a new document with nested `App::Part` containers and validated `Part::Feature` solids. Save the document as `.FCStd` to preserve the project, or run:

```python
orkad_export_step()
orkad_export_nose_stl()
```

Both commands open a save dialog. Export helpers are bound to their original document, so a saved helper reference remains valid when another project is generated. They also accept an explicit path. For projects with multiple noses, `orkad_export_nose_stl(path, index=0)` selects the nose by its zero-based index. The downloadable `.py` file contains the same code in readable form. It requires only FreeCAD's bundled Python modules. FreeCAD 0.21+ is the intended target; native geometry and export validation was performed with FreeCAD 1.1.4.

## Geometry

- `.ork` ZIP archives containing `rocket.ork`, older GZIP designs, and uncompressed XML.
- Serial stages, circularly instanced parallel boosters and pods, nested assembly containers, axial offsets (`top`, `middle`, `bottom`, `after`, `absolute`), radial offsets, repeated fins, and repeated rings/lugs.
- Conical, ogive, ellipsoid, power-series, parabolic and Haack noses and transitions, including clipped transition profiles and flipped noses.
- Body tubes, inner tubes, couplers, centering rings, bulkheads, engine blocks and launch lugs.
- Trapezoidal, elliptical and freeform fins, including rotation and cant.
- Source appearance colors, source material metadata, nose shoulders and caps.

Curved meridians are fitted as B-splines to 48, 96 or 192 sample points. Both the browser and FreeCAD build closed faces and revolve them into BREP solids; STEP exports contain CAD surfaces rather than triangle meshes. The fit tolerance is 0.00001 mm **at the samples**; the analytic profile between samples is still approximated. The preview uses the same sampled contours.

Hollow nose thickness is measured **radially**, matching OpenRocket's wall definition; it is not a constant normal offset. The tip closes on the axis. A zero-exponent power nose has a flat end; its hollow form uses an axial end wall and reports that construction explicitly. A thicker internal lip joins a narrow shoulder to the main wall when required. Existing shoulder caps are preserved. A source shoulder with zero wall thickness is omitted in source mode and receives the selected wall in **Hollow for printing**. The complete nose and its shoulder form one solid.

STL export tessellates the BREP at 0.03 mm linear and 0.12 radian angular deflection, removes collapsed axis triangles, welds sub-micron seam noise, and rejects non-manifold output. Imported design dimensions, shoulder fit and print settings should still be inspected in a slicer.

### Explicit limitations

Unsupported geometry stays in the tree and appears in the import report. Tube fins, legacy clustered inner tubes, recovery systems and mass objects are omitted. Parallel boosters and pods support nested circular instances, inherited radial positions and assembly hierarchy. Fin tabs, fillets, decals and flight simulation data are not converted. Rounded and airfoil fin sections are approximated as flat plates. Fins attached to curved transitions use the mounting radius at their leading edge, without a curved root cutout. Automatic ring holes use the largest axially overlapping sibling inner tube and produce a notice. Automatic radii stay within their own booster axis. If no adjoining or enclosing component resolves a radius, an explicitly stored OpenRocket value is used with a notice; otherwise the import is rejected. Repeated ordinary components with children must be represented as pod assemblies. Review import notices before manufacture.

The FreeCAD project contains editable BREP objects with informational source properties. It is not a parametric Part Design feature history. Changing a source property does not regenerate geometry; regenerate the script from the browser to change conversion settings. View visibility, exploded positions and section cuts do not change the exported assembly.

Import limits: 20 MB input, 12 MB rocket XML, 1,500 source and expanded components, 2,000 solid instances, 32 nesting levels and 64 instances per source component.

## Development

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

The preview is available at `http://localhost:8080`.

```sh
npm run check
npm run preview
```

The production output is `dist/`. The production preview uses port 8081. Assets, including the 10.8 MB OpenCascade WebAssembly module, are bundled locally and support GitHub Pages. WebGL is required for the 3D viewer. STEP/STL generation runs in a separate worker. Clipboard copying requires HTTPS or localhost; manual selection and Python download remain available.

Browser tests use an installed Chrome:

```sh
npm run test:e2e
ORKAD_TEST_URL=http://localhost:8081 npm run test:e2e
```

They exercise import, view controls, construction settings, generated Python, structured STEP and STL downloads, invalid input recovery, asynchronous import races, worker failure recovery and the mobile layout. `npm run check` runs ESLint over all JavaScript, strict JavaScript type checks for the archive, controller, geometry and STL boundaries, formatting checks, unit tests, real OpenCascade geometry tests and the production build. For an optional native CAD round trip, first run the browser tests and `npm run test:cad:prepare`, then use FreeCAD's Python interpreter:

```sh
PYTHONPATH=/path/to/FreeCAD/lib /path/to/FreeCAD/bin/python scripts/verify-freecad.py
```

This checks 48 native geometry configurations against independent WebAssembly kernel volumes, the browser STEP hierarchy, closed STL topology, paste-ready Python, multiple project isolation and export helpers after document closure.

## GitHub Pages deployment

The repository includes `.github/workflows/pages.yml` and `public/CNAME` containing `orkad.defencore.com`.

1. In **GitHub → defencore/orkad → Settings → Pages**, choose **GitHub Actions** as the build source.
2. Push to `main`, or run **Deploy GitHub Pages** manually. The workflow runs the static checks, unit and CAD kernel tests, builds the app, runs browser regression tests and deploys `dist/` only after they pass.
3. Add the custom domain **orkad.defencore.com** in Pages settings. Configure its DNS `CNAME` to **defencore.github.io**. With a proxying DNS provider, leave the record DNS-only while GitHub verifies it and provisions the certificate.
4. Enable **Enforce HTTPS** after the certificate becomes available.

Vite uses relative asset URLs, so the same build also works at the repository's default Pages path. The custom-domain file is copied into the deployment output.

## Source layout

| Module                                                                  | Responsibility                                                                                                                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/parser.js`, `src/import/`                                          | Bounded archive decoding, XML validation, components, axial layout, radius resolution, instance expansion and cancellable imports |
| `src/profile-equations.js`, `src/radial-geometry.js`, `src/profiles.js` | Analytic equations and shared closed meridians, including hollow reversed profiles and shoulders                                  |
| `src/model.js`, `src/cad/validate.js`, `src/config.js`                  | Conversion settings, payload validation and shared numerical limits                                                               |
| `src/viewer.js`, `src/viewer-mesh.js`                                   | Atomic Three.js model replacement, picking, orbit controls and resource cleanup                                                   |
| `src/cad.worker.js`, `src/cad/shape.js`, `src/cad/step.js`              | Worker orchestration, validated solids and named STEP hierarchy                                                                   |
| `src/cad/client.js`, `src/stl.js`                                       | Recoverable CAD requests, timeouts and closed, consistently oriented STL validation                                               |
| `src/freecad.js`, `src/cad/freecad-template.js`                         | Safely embedded data and isolated FreeCAD projects with bound export helpers                                                      |
| `src/main.js`, `src/ui/`                                                | Workspace controller, English interface, component tree and dialogs                                                               |
| `tests/`, `scripts/verify-freecad.py`                                   | Import and recovery regressions, CAD geometry matrix, browser flows and native round trips                                        |

The default example, **TRIAD Heavy / H9**, is an original three-core heavy-lift demonstrator with **139 solids**, two side boosters, 27 engine nozzles, internal tanks, diaphragms, frames, a payload envelope, recovery surfaces and stowed landing panels. Its 162-node tree, repeated booster instances and engine clusters are preserved in STEP and FreeCAD. It is inspired by the layout of three-core launch vehicles and is not an exact Falcon Heavy replica. Aster 01 remains available as a small test fixture. Import behavior and geometry were also checked locally against OpenRocket's simple, printable-nose and multi-stage examples.

## References and dependencies

The import schema and profile equations follow the [OpenRocket file specification](https://openrocket.readthedocs.io/en/latest/dev_guide/file_specification.html) and the [OpenRocket component implementation](https://github.com/openrocket/openrocket/tree/unstable/core/src/main/java/info/openrocket/core/rocketcomponent). CAD operations use [Replicad](https://replicad.xyz/) and its [OpenCascade WebAssembly build](https://github.com/sgenoud/replicad). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency licenses.
