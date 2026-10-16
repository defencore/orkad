# Third-party notices

ORKAD bundles the following open-source dependencies:

| Dependency | License | Source |
| --- | --- | --- |
| Three.js | MIT | https://github.com/mrdoob/three.js |
| fflate | MIT | https://github.com/101arrowz/fflate |
| Replicad | MIT | https://github.com/sgenoud/replicad |
| replicad-opencascadejs bindings | MIT | https://github.com/sgenoud/replicad/tree/main/packages/replicad-opencascadejs |
| OpenCascade.js bindings | LGPL-2.1 | https://github.com/donalffons/opencascade.js |
| Open CASCADE Technology | LGPL-2.1 with Open CASCADE exception | https://github.com/Open-Cascade-SAS/OCCT |
| opentype.js | MIT | https://github.com/opentypejs/opentype.js |
| flatbush | ISC | https://github.com/mourner/flatbush |

The OpenCascade WebAssembly engine is distributed as a separate, replaceable `.wasm` asset. Corresponding source, binding configuration and build instructions are available from the linked Replicad and OpenCascade.js repositories. No changes have been made to the engine binary.

The bundled license texts are available in the deployed site's `licenses/` directory. OpenRocket is used as a format reference and is not bundled. The included Aster 01 example was created for this project.
