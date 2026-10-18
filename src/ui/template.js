import { icon } from './icons.js';

export function renderWorkspace(container) {
  container.innerHTML = /* HTML */ `
    <header class="header">
      <a class="brand" href="./" aria-label="ORKAD home"
        ><img src="${import.meta.env.BASE_URL}favicon.svg" alt="" /><span
          >ORKAD<span class="brand-dot">.</span></span
        ></a
      >
      <span class="header-divider"></span><span class="header-caption">OPENROCKET <span>→</span> CAD</span>
      <nav>
        <span class="local-badge"><span></span> Local file processing</span
        ><button class="text-button" id="help">Quick guide ${icon('external')}</button
        ><a
          class="github-link"
          href="https://github.com/defencore/orkad"
          target="_blank"
          rel="noreferrer"
          aria-label="View source on GitHub"
          >GitHub ${icon('external')}</a
        >
      </nav>
    </header>
    <main>
      <div class="workspace-heading">
        <div>
          <div class="eyebrow">ENGINEERING WORKSPACE</div>
          <h1>OpenRocket CAD Workbench</h1>
          <p>Inspect geometry · Prepare solids · Export CAD assemblies</p>
        </div>
        <div class="flow">
          <span class="file-pill">.ork</span><span>→</span><span class="file-pill">3D</span><span>→</span
          ><span class="file-pill">STEP / FreeCAD</span>
        </div>
      </div>
      <div class="workspace">
        <aside class="left-panel panel">
          <div class="panel-heading"><span>Project</span><span class="micro">OPENROCKET FILE</span></div>
          <button class="dropzone" id="dropzone">
            <span class="upload-icon">${icon('upload')}</span><strong>Open a rocket design</strong
            ><span>Drop an .ork file here or <u>browse files</u></span
            ><small>OpenRocket · ZIP, GZIP or XML · up to 20 MB</small>
          </button>
          <input type="file" id="file-input" accept=".ork,.xml" hidden />
          <div class="demo-line">
            Demonstrator <button id="load-demo">TRIAD Heavy / H9 ${icon('arrow')}</button>
          </div>
          <div class="project-file" id="project-file" hidden>
            ${icon('file')}
            <div><strong id="source-name"></strong><small id="source-info"></small></div>
            <span class="loaded-dot"></span>
          </div>
          <div class="tree-heading">
            <span>COMPONENT TREE</span><span class="count" id="part-count">—</span>
          </div>
          <div id="component-tree" class="component-tree">
            <p class="empty-tree">Your project structure will appear here.</p>
          </div>
          <div class="privacy-note">
            ${icon('lock')}<span>Your design stays on this device.<br />All dimensions in millimetres.</span>
          </div>
        </aside>
        <section class="viewer-panel" aria-label="3D preview">
          <div class="viewer-toolbar">
            <div class="viewer-label"><span class="status-dot"></span>MODEL VIEW</div>
            <div class="segmented" id="display-modes">
              <button data-mode="solid" class="active" aria-pressed="true">Solid</button
              ><button data-mode="xray" aria-pressed="false">X-ray</button
              ><button data-mode="wire" aria-pressed="false">Wire</button>
            </div>
          </div>
          <div id="viewer" class="viewer">
            <div class="viewer-empty" id="viewer-empty">
              <span class="empty-orbit">${icon('cone')}</span>
              <h2>OpenRocket geometry inspector</h2>
              <p>
                Open an .ork design or explore the heavy-lift demonstrator.<br />Three cores. 27 engine
                nozzles. 139 solid components.
              </p>
              <button class="primary" id="empty-demo">Load heavy-lift demonstrator ${icon('arrow')}</button>
            </div>
            <div class="model-label" id="model-label" hidden>
              <strong id="model-name"></strong><span>ASSEMBLED VIEW · MILLIMETRES</span>
            </div>
            <div class="view-actions">
              <button title="Fit model" aria-label="Fit model" id="fit">${icon('fit')}</button
              ><button title="Isometric view" aria-label="Isometric view" id="iso">${icon('cube')}</button
              ><button title="Front view" aria-label="Front view" id="front">F</button
              ><button title="Side view" aria-label="Side view" id="side">R</button>
            </div>
            <div class="axis-widget" aria-hidden="true">
              <i class="axis-y">Z</i><i class="axis-x">X</i><i class="axis-z">Y</i><span></span>
            </div>
            <div id="viewer-error" class="viewer-error" hidden></div>
            <div class="viewer-help">
              <span>DRAG <b>Orbit</b></span
              ><span>SCROLL <b>Zoom</b></span
              ><span>RIGHT DRAG <b>Pan</b></span>
            </div>
          </div>
          <div class="viewer-bottom">
            <label class="section-toggle"
              ><input type="checkbox" id="section" /><span></span>Section view</label
            ><label class="explode-control" for="explode"
              >Explode <input id="explode" type="range" min="0" max="100" value="0" /><output
                id="explode-value"
                >0%</output
              ></label
            >
          </div>
          <div class="model-stats">
            <div>
              <span>OVERALL LENGTH</span><strong id="stat-length">— <small>mm</small></strong>
            </div>
            <div>
              <span>BODY DIAMETER</span><strong id="stat-diameter">— <small>mm</small></strong>
            </div>
            <div><span>SOLID PARTS</span><strong id="stat-parts">—</strong></div>
          </div>
        </section>
        <aside class="right-panel panel">
          <div class="panel-heading">
            <span>Properties and export</span><span class="micro">CAD OUTPUT</span>
          </div>
          <div class="selection-card">
            <div class="tree-heading"><span>SELECTED COMPONENT</span>${icon('cube')}</div>
            <div id="selection-details">
              <p class="field-help">Select a component in the tree or 3D view to inspect its dimensions.</p>
            </div>
          </div>
          <div class="export-settings">
            <div class="section-title">Nose cone construction ${icon('cone')}</div>
            <label for="nose-mode">Construction</label
            ><select id="nose-mode">
              <option value="source">Use OpenRocket settings</option>
              <option value="hollow">Hollow for printing</option>
              <option value="solid">Solid nose cone</option>
            </select>
            <div class="wall-field" id="wall-field" hidden>
              <label for="wall">Radial wall thickness <span>mm</span></label
              ><input id="wall" type="number" min="0.2" max="100" step="0.1" value="2.0" />
            </div>
            <p id="nose-description" class="field-help">
              Preserves the source wall, shoulder and cap settings.
            </p>
            <label for="resolution">Profile resolution</label
            ><select id="resolution">
              <option value="48">Standard · 48 samples</option>
              <option value="96" selected>Fine · 96 samples</option>
              <option value="192">Extra fine · 192 samples</option>
            </select>
            <p class="field-help">Smooth CAD curves fitted to the source profile.</p>
          </div>
          <div class="export-actions">
            <button class="primary export-button" id="export-step" disabled>
              ${icon('cube')}<span
                >Download STEP assembly<small>Named parts & component hierarchy</small></span
              >${icon('download')}</button
            ><button class="secondary export-button" id="freecad" disabled>
              ${icon('code')}<span>Create in FreeCAD<small>Copy Python into the console</small></span
              >${icon('chevron')}</button
            ><button class="secondary export-button" id="export-stl" disabled>
              ${icon('cone')}<span
                >Download nose cone STL<small>Closed solid, ready for your slicer</small></span
              >${icon('download')}
            </button>
            <p class="export-note">
              Exports use the complete assembled model.<br />View settings only affect the preview.
            </p>
          </div>
        </aside>
      </div>
      <div class="report-bar">
        <button id="report">
          <span class="report-indicator">${icon('info')}</span
          ><span id="report-summary">Ready when you are. Open a design to get started.</span
          >${icon('chevron')}</button
        ><span class="report-engine">GEOMETRY ENGINE: OPENCASCADE <span>·</span> BROWSER NATIVE</span>
      </div>
    </main>
    <footer>
      <span>OpenRocket → BREP solids · Units: mm · STEP assembly</span
      ><span>ORKAD <span class="footer-version">/ 1.0</span></span>
    </footer>
    <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
    <dialog id="modal">
      <div class="modal-heading">
        <div>
          <div class="eyebrow" id="modal-eyebrow"></div>
          <h2 id="modal-title"></h2>
        </div>
        <button id="close-modal" class="icon-button" aria-label="Close dialog">${icon('close')}</button>
      </div>
      <div id="modal-body"></div>
    </dialog>
  `;
}
