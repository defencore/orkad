import './style.css';
import { decodeOrk, parseOrk, MAX_FILE_SIZE } from './parser.js';
import { DEFAULT_SETTINGS, makePayload, fileStem } from './model.js';
import { generateFreeCAD } from './freecad.js';
import { RocketViewer } from './viewer.js';

const icons = {
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  download: '<path d="M12 4v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  cube: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8m9 4v9"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10 5a12 12 0 0 1 12 7s-1 2-3 4M6 6a19 19 0 0 0-4 6s4 7 10 7c2 0 4-1 5-2"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path d="m8 8 8 8m0-8-8 8"/>',
  rotate: '<path d="M4 8a9 9 0 1 1 0 9m0-9V3m0 5h5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  file: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  cone: '<path d="M12 3 3 19c0 3 18 3 18 0L12 3Z"/><path d="M3 19c0-3 18-3 18 0"/>',
  ring: '<ellipse cx="12" cy="12" rx="9" ry="5"/><ellipse cx="12" cy="12" rx="4" ry="2"/>',
  fin: '<path d="m3 21 4-17 10 7 4 10H3Z"/>',
  folder: '<path d="M3 6h7l2 3h9v12H3V6Z"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.cube}</svg>`;
const $ = (selector) => document.querySelector(selector);
const el = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
let model, payload, selectedId, sourceName, worker, busy = false, requestId = 0, activeRequest;
const settings = { ...DEFAULT_SETTINGS };
const hidden = new Set();
const collapsed = new Set();

$('#app').innerHTML = `
  <header class="header">
    <a class="brand" href="./" aria-label="ORKAD home"><img src="${import.meta.env.BASE_URL}favicon.svg" alt=""/><span>ORKAD<span class="brand-dot">.</span></span></a>
    <span class="header-divider"></span><span class="header-caption">OPENROCKET <span>→</span> CAD</span>
    <nav><span class="local-badge"><span></span> Local file processing</span><button class="text-button" id="help">Quick guide ${icon('external')}</button><a class="github-link" href="https://github.com/defencore/orkad" target="_blank" rel="noreferrer" aria-label="View source on GitHub">GitHub ${icon('external')}</a></nav>
  </header>
  <main>
    <div class="workspace-heading"><div><div class="eyebrow">ENGINEERING WORKSPACE</div><h1>OpenRocket CAD Workbench</h1><p>Inspect geometry · Prepare solids · Export CAD assemblies</p></div><div class="flow"><span class="file-pill">.ork</span><span>→</span><span class="file-pill">3D</span><span>→</span><span class="file-pill">STEP / FreeCAD</span></div></div>
    <div class="workspace">
      <aside class="left-panel panel">
        <div class="panel-heading"><span>Project</span><span class="micro">OPENROCKET FILE</span></div>
        <button class="dropzone" id="dropzone"><span class="upload-icon">${icon('upload')}</span><strong>Open a rocket design</strong><span>Drop an .ork file here or <u>browse files</u></span><small>OpenRocket · ZIP, GZIP or XML · up to 20 MB</small></button>
        <input type="file" id="file-input" accept=".ork,.xml" hidden />
        <div class="demo-line">Demonstrator <button id="load-demo">TRIAD Heavy / H9 ${icon('arrow')}</button></div>
        <div class="project-file" id="project-file" hidden>${icon('file')}<div><strong id="source-name"></strong><small id="source-info"></small></div><span class="loaded-dot"></span></div>
        <div class="tree-heading"><span>COMPONENT TREE</span><span class="count" id="part-count">—</span></div>
        <div id="component-tree" class="component-tree"><p class="empty-tree">Your project structure will appear here.</p></div>
        <div class="privacy-note">${icon('lock')}<span>Your design stays on this device.<br>All dimensions in millimetres.</span></div>
      </aside>
      <section class="viewer-panel" aria-label="3D preview">
        <div class="viewer-toolbar"><div class="viewer-label"><span class="status-dot"></span>MODEL VIEW</div><div class="segmented" id="display-modes"><button data-mode="solid" class="active" aria-pressed="true">Solid</button><button data-mode="xray" aria-pressed="false">X-ray</button><button data-mode="wire" aria-pressed="false">Wire</button></div></div>
        <div id="viewer" class="viewer"><div class="viewer-empty" id="viewer-empty"><span class="empty-orbit">${icon('cone')}</span><h2>OpenRocket geometry inspector</h2><p>Open an .ork design or explore the heavy-lift demonstrator.<br>Three cores. 27 engine nozzles. 139 solid components.</p><button class="primary" id="empty-demo">Load heavy-lift demonstrator ${icon('arrow')}</button></div><div class="model-label" id="model-label" hidden><strong id="model-name"></strong><span>ASSEMBLED VIEW · MILLIMETRES</span></div><div class="view-actions"><button title="Fit model" aria-label="Fit model" id="fit">${icon('fit')}</button><button title="Isometric view" aria-label="Isometric view" id="iso">${icon('cube')}</button><button title="Front view" aria-label="Front view" id="front">F</button><button title="Side view" aria-label="Side view" id="side">R</button></div><div class="axis-widget" aria-hidden="true"><i class="axis-y">Z</i><i class="axis-x">X</i><i class="axis-z">Y</i><span></span></div><div id="viewer-error" class="viewer-error" hidden></div><div class="viewer-help"><span>DRAG <b>Orbit</b></span><span>SCROLL <b>Zoom</b></span><span>RIGHT DRAG <b>Pan</b></span></div></div>
        <div class="viewer-bottom"><label class="section-toggle"><input type="checkbox" id="section"/><span></span>Section view</label><label class="explode-control" for="explode">Explode <input id="explode" type="range" min="0" max="100" value="0"/><output id="explode-value">0%</output></label></div>
        <div class="model-stats"><div><span>OVERALL LENGTH</span><strong id="stat-length">— <small>mm</small></strong></div><div><span>BODY DIAMETER</span><strong id="stat-diameter">— <small>mm</small></strong></div><div><span>SOLID PARTS</span><strong id="stat-parts">—</strong></div></div>
      </section>
      <aside class="right-panel panel">
        <div class="panel-heading"><span>Properties and export</span><span class="micro">CAD OUTPUT</span></div>
        <div class="export-settings"><div class="section-title">Nose cone construction ${icon('cone')}</div><label for="nose-mode">Construction</label><select id="nose-mode"><option value="source">Use OpenRocket settings</option><option value="hollow">Hollow for printing</option><option value="solid">Solid nose cone</option></select><div class="wall-field" id="wall-field" hidden><label for="wall">Radial wall thickness <span>mm</span></label><input id="wall" type="number" min="0.2" max="100" step="0.1" value="2.0"/></div><p id="nose-description" class="field-help">Preserves the source wall, shoulder and cap settings.</p><label for="resolution">Profile resolution</label><select id="resolution"><option value="48">Standard · 48 samples</option><option value="96" selected>Fine · 96 samples</option><option value="192">Extra fine · 192 samples</option></select><p class="field-help">Smooth CAD curves fitted to the source profile.</p></div>
        <div class="export-actions"><button class="primary export-button" id="export-step" disabled>${icon('cube')}<span>Download STEP assembly<small>Named parts & component hierarchy</small></span>${icon('download')}</button><button class="secondary export-button" id="freecad" disabled>${icon('code')}<span>Create in FreeCAD<small>Copy Python into the console</small></span>${icon('chevron')}</button><button class="secondary export-button" id="export-stl" disabled>${icon('cone')}<span>Download nose cone STL<small>Closed solid, ready for your slicer</small></span>${icon('download')}</button><p class="export-note">Exports use the complete assembled model.<br>View settings only affect the preview.</p></div>
        <div class="selection-card"><div class="tree-heading"><span>SELECTED COMPONENT</span>${icon('cube')}</div><div id="selection-details"><p class="field-help">Select a component in the tree or 3D view to inspect its dimensions.</p></div></div>
      </aside>
    </div>
    <div class="report-bar"><button id="report"><span class="report-indicator">${icon('info')}</span><span id="report-summary">Ready when you are. Open a design to get started.</span>${icon('chevron')}</button><span class="report-engine">GEOMETRY ENGINE: OPENCASCADE <span>·</span> BROWSER NATIVE</span></div>
  </main>
  <footer><span>OpenRocket → BREP solids · Units: mm · STEP assembly</span><span>ORKAD <span class="footer-version">/ 1.0</span></span></footer>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="modal"><div class="modal-heading"><div><div class="eyebrow" id="modal-eyebrow"></div><h2 id="modal-title"></h2></div><button id="close-modal" class="icon-button" aria-label="Close dialog">${icon('close')}</button></div><div id="modal-body"></div></dialog>
`;
const inspectorPanel = $('.right-panel');
inspectorPanel.insertBefore($('.selection-card'), $('.export-settings'));
const viewer = new RocketViewer($('#viewer'), selectNode, (message) => { $('#viewer-error').textContent = message; $('#viewer-error').hidden = false; });
let toastTimer;
function toast(message, error = false, permanent = false) {
  clearTimeout(toastTimer);
  const box = $('#toast');
  box.textContent = message;
  box.classList.toggle('error', error);
  box.hidden = false;
  if (!permanent) toastTimer = setTimeout(() => { box.hidden = true; }, error ? 7000 : 4000);
}
function updateButtons() {
  $('#export-step').disabled = !payload || busy;
  $('#freecad').disabled = !payload || busy;
  $('#export-stl').disabled = !payload?.parts.some((p) => p.type === 'nosecone') || busy;
  for (const input of ['#nose-mode', '#wall', '#resolution']) $(input).disabled = busy;
}
function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function loadBytes(bytes, name) {
  if (busy) { toast('Wait for the current CAD export to finish.'); return; }
  try {
    const nextModel = parseOrk(decodeOrk(bytes));
    const nextPayload = makePayload(nextModel, settings);
    model = nextModel; payload = nextPayload; sourceName = name;
    hidden.clear(); collapsed.clear();
    model.nodes.filter((n) => n.children.length && !['rocket', 'stage', 'axialstage'].includes(n.type)).forEach((n) => collapsed.add(n.id));
    selectedId = null; viewer.hidden = hidden; viewer.selected = null;
    $('#explode').value = 0; $('#explode-value').textContent = '0%'; viewer.explode = 0;
    $('#viewer-empty').hidden = true; $('#model-label').hidden = false;
    $('#model-name').textContent = model.name;
    $('#source-name').textContent = name; $('#source-info').textContent = `${model.creator} · format ${model.version}`;
    $('#project-file').hidden = false;
    $('#part-count').textContent = model.nodes.length - 1;
    $('#stat-length').replaceChildren(document.createTextNode(model.length.toFixed(1) + ' '), el('small', '', 'mm'));
    $('#stat-diameter').replaceChildren(document.createTextNode(model.diameter.toFixed(1) + ' '), el('small', '', 'mm'));
    $('#stat-parts').textContent = model.parts.length;
    $('#report-summary').textContent = model.warnings.length ? `${model.parts.length} solid parts prepared · ${model.warnings.length} import notice${model.warnings.length === 1 ? '' : 's'} — review before export` : `${model.parts.length} solid parts prepared · No import warnings`;
    $('.report-bar').classList.toggle('has-warnings', !!model.warnings.length);
    renderTree(); viewer.load(payload);
    selectNode(model.nodes.find((n) => n.type === 'nosecone')?.id || model.parts[0].sourceNodeId);
    updateButtons();
    toast(`${model.name} is ready to inspect.`);
  } catch (error) { toast(error.message || 'The design could not be opened.', true); }
}
async function loadFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) { toast('Choose an OpenRocket file smaller than 20 MB.', true); return; }
  await loadBytes(await file.arrayBuffer(), file.name);
  $('#file-input').value = '';
}
async function loadDemo() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}triad-heavy.ork`);
    if (!response.ok) throw new Error('The example design could not be loaded.');
    await loadBytes(await response.arrayBuffer(), 'triad-heavy.ork');
  } catch (error) { toast(error.message, true); }
}
$('#dropzone').onclick = () => $('#file-input').click();
$('#file-input').onchange = (event) => loadFile(event.target.files[0]);
$('#load-demo').onclick = loadDemo;
$('#empty-demo').onclick = loadDemo;
let dragDepth = 0;
document.addEventListener('dragenter', (event) => { event.preventDefault(); dragDepth++; $('#dropzone').classList.add('dragover'); });
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) $('#dropzone').classList.remove('dragover'); });
document.addEventListener('drop', (event) => { event.preventDefault(); dragDepth = 0; $('#dropzone').classList.remove('dragover'); loadFile(event.dataTransfer.files[0]); });
function componentIcon(type) { return type === 'nosecone' ? 'cone' : type.includes('finset') ? 'fin' : type.includes('ring') || type === 'bulkhead' ? 'ring' : ['rocket', 'stage', 'axialstage', 'parallelstage', 'podset', 'assembly'].includes(type) ? 'folder' : 'cube'; }
function descendantIds(node) {
  return [node.id, ...node.children.flatMap(descendantIds)];
}
function renderTree() {
  const tree = $('#component-tree'); tree.replaceChildren();
  function row(node, depth) {
    if (node.type === 'rocket') { node.children.forEach((c) => row(c, 0)); return; }
    const wrapper = el('div', 'tree-item');
    const line = el('div', `tree-row${node.supported ? '' : ' unsupported'}`); line.style.setProperty('--depth', depth); line.dataset.id = node.id;
    if (node.children.length) {
      const toggle = el('button', 'tree-expand'); toggle.innerHTML = icon('chevron');
      toggle.classList.toggle('expanded', !collapsed.has(node.id));
      toggle.title = `${collapsed.has(node.id) ? 'Expand' : 'Collapse'} ${node.name}`;
      toggle.setAttribute('aria-label', toggle.title);
      toggle.setAttribute('aria-expanded', !collapsed.has(node.id));
      toggle.onclick = () => { collapsed.has(node.id) ? collapsed.delete(node.id) : collapsed.add(node.id); renderTree(); highlightSelection(); };
      line.append(toggle);
    } else line.append(el('span', 'tree-spacer'));
    const button = el('button', 'tree-select');
    button.innerHTML = icon(componentIcon(node.type));
    button.append(el('span', '', node.name));
    button.title = node.name; button.onclick = () => selectNode(node.id);
    line.append(button);
    const affectedIds = descendantIds(node).filter((id) => model.parts.some((p) => p.sourceNodeId === id));
    if (affectedIds.length) {
      const allHidden = affectedIds.every((id) => hidden.has(id));
      const eye = el('button', 'visibility-button'); eye.innerHTML = icon(allHidden ? 'eyeOff' : 'eye'); eye.title = `${allHidden ? 'Show' : 'Hide'} ${node.name}`; eye.setAttribute('aria-label', eye.title);
      eye.onclick = () => { affectedIds.forEach((id) => allHidden ? hidden.delete(id) : hidden.add(id)); viewer.applyDisplay(); renderTree(); highlightSelection(); }; line.append(eye);
    } else if (!node.supported) line.append(el('span', 'omitted-dot', '·'));
    wrapper.append(line); tree.append(wrapper);
    if (!collapsed.has(node.id)) node.children.forEach((c) => row(c, depth + 1));
  }
  row(model.root, 0);
}
function highlightSelection() { document.querySelectorAll('.tree-row').forEach((row) => row.classList.toggle('selected', row.dataset.id === selectedId)); }
function selectNode(id) {
  if (!model) return;
  selectedId = id; highlightSelection();
  const node = model.nodes.find((n) => n.id === id);
  viewer.select(descendantIds(node));
  const detail = $('#selection-details'); detail.replaceChildren();
  detail.append(el('h3', '', node.name), el('span', 'type-label', node.type.replace(/([a-z])(tube|cone|ring|finset)/g, '$1 $2')));
  const values = [['Length', `${node.length.toFixed(2)} mm`]];
  if (node.radius) values.push(['Outer diameter', `${(node.radius * 2).toFixed(2)} mm`]);
  if (node.aftRadius) values.push(['Base diameter', `${(node.aftRadius * 2).toFixed(2)} mm`]);
  if (node.type === 'nosecone') values.push(['Profile', node.shape], ['Wall', settings.noseMode === 'solid' || node.filled && settings.noseMode === 'source' ? 'Solid' : `${(settings.noseMode === 'hollow' ? settings.wallThickness : node.thickness).toFixed(2)} mm`]);
  else if (node.thickness && !node.children.length) values.push(['Thickness', `${node.thickness.toFixed(2)} mm`]);
  if (node.children.length) values.push(['Solid components', String(model.parts.filter((p) => descendantIds(node).includes(p.sourceNodeId)).length)]);
  if (node.count > 1) values.push(['Instances', String(node.count)]);
  if (node.x !== undefined) values.push(['Axial position', `${node.x.toFixed(2)} mm`]);
  if (!node.supported) detail.append(el('p', 'notice', 'Geometry omitted. See the import report.'));
  const dl = el('dl');
  for (const [label, value] of values) dl.append(el('dt', '', label), el('dd', '', value));
  detail.append(dl);
  const nose = model.parts.find((p) => p.sourceNodeId === id && p.type === 'nosecone') || model.parts.find((p) => p.type === 'nosecone');
  if (nose) $('#export-stl span small').textContent = `Export ${nose.name}`;
}
function rebuildSettings() {
  const proposed = { noseMode: $('#nose-mode').value, wallThickness: Number($('#wall').value), samples: Number($('#resolution').value) };
  try {
    const nextPayload = model ? makePayload(model, proposed) : null;
    Object.assign(settings, proposed); payload = nextPayload;
    $('#wall-field').hidden = settings.noseMode !== 'hollow';
    $('#nose-description').textContent = { source: 'Preserves the source wall, shoulder and cap settings.', hollow: 'Closed material shell with a sealed tip and source shoulder. Thickness is measured radially.', solid: 'A fully solid nose cone, including its source shoulder.' }[settings.noseMode];
    if (payload) { viewer.load(payload, false); selectNode(selectedId); }
  } catch (error) {
    toast(error.message, true);
    $('#nose-mode').value = settings.noseMode; $('#wall').value = settings.wallThickness; $('#resolution').value = settings.samples;
  }
  updateButtons();
}
$('#nose-mode').onchange = rebuildSettings; $('#wall').onchange = rebuildSettings; $('#resolution').onchange = rebuildSettings;
$('#display-modes').onclick = (event) => {
  const target = event.target.closest('button'); if (!target) return;
  viewer.mode = target.dataset.mode; viewer.applyDisplay();
  $('#display-modes').querySelectorAll('button').forEach((b) => { const active = b === target; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); });
};
$('#fit').onclick = () => viewer.fit(); $('#iso').onclick = () => viewer.fit('iso'); $('#front').onclick = () => viewer.fit('front'); $('#side').onclick = () => viewer.fit('side');
$('#section').onchange = (event) => { viewer.section = event.target.checked; viewer.applyDisplay(); };
$('#explode').oninput = (event) => { $('#explode-value').textContent = `${event.target.value}%`; viewer.explode = event.target.value / 100; viewer.applyDisplay(); };
function openModal(title, eyebrow, build) {
  $('#modal-title').textContent = title; $('#modal-eyebrow').textContent = eyebrow; $('#modal-body').replaceChildren(); build($('#modal-body')); $('#modal').showModal();
}
$('#close-modal').onclick = () => $('#modal').close();
$('#modal').onclick = (event) => { if (event.target === $('#modal')) { const r = $('#modal').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#modal').close(); } };
function showGuide() {
  openModal('From .ork to your workshop', 'QUICK GUIDE', (body) => {
    const steps = [['Open your design', 'Drop an OpenRocket .ork file into the import panel. Inspect any notices in the import report.'], ['Inspect every component', 'Drag the model to orbit. Use X-ray, section view and the component tree to check the nose cavity, shoulders and internal parts.'], ['Choose the nose construction', 'Keep the original OpenRocket wall settings, make the nose solid, or choose a radial wall thickness for printing. Existing shoulder caps are preserved.'], ['Take it into CAD', 'Download a named STEP assembly directly, or copy the console command into FreeCAD using View → Panels → Python console. You can also download a readable .py file.'], ['Print the nose', 'Download the nose STL, or select its solid in FreeCAD and export STEP/STL. Check wall thickness, fit, print orientation and slicing before fabrication.']];
    const list = el('ol', 'guide-steps'); steps.forEach(([title, description]) => { const li = el('li'); li.append(el('h3', '', title), el('p', '', description)); list.append(li); }); body.append(list);
    body.append(el('p', 'notice', 'Supported geometry: serial stages, parallel boosters, instanced pods, nose cones, transitions, body and inner tubes, couplers, rings, bulkheads, engine blocks, launch lugs, and trapezoidal, elliptical or freeform fins. Tube fins, legacy inner-tube motor clusters, recovery systems, tabs, fillets and decals are omitted or reported. Aerodynamic fin sections use flat plates. This tool does not run flight simulations.'));
  });
}
$('#help').onclick = showGuide;
$('#report').onclick = () => openModal('Import report', 'DESIGN CHECK', (body) => {
  if (!model) { body.append(el('p', '', 'Open a design to inspect its conversion report.')); return; }
  body.append(el('p', 'report-intro', `${model.name} · ${model.parts.length} solid parts prepared from ${model.nodes.length - 1} components.`));
  if (!model.warnings.length) body.append(el('p', 'success-notice', 'No import warnings. All supported geometry has been prepared.'));
  else { const list = el('ul', 'warning-list'); model.warnings.forEach((w) => list.append(el('li', '', w))); body.append(list); }
  body.append(el('p', 'notice', 'Curved profiles use sampled B-spline approximations (0.00001 mm fit tolerance at the samples). Profile sampling adds approximation error between samples. STEP and STL exports validate BREP geometry before saving. Source material and length properties in FreeCAD are informational.'));
  body.append(el('p', 'field-help', 'Preview visibility, section cuts and exploded positions do not change exports. All dimensions are in millimetres.'));
});
$('#freecad').onclick = () => {
  if (!payload) return;
  const generated = generateFreeCAD(payload);
  openModal('A structured project in FreeCAD', 'PYTHON CONSOLE', (body) => {
    body.append(el('p', 'modal-intro', 'In FreeCAD, open View → Panels → Python console. Paste the command below and press Enter. A new document will contain your component tree and validated solids.'));
    const label = el('label', 'code-label', 'PASTE-READY CONSOLE COMMAND'); label.htmlFor = 'python-code'; body.append(label);
    const textarea = el('textarea', 'code-box'); textarea.id = 'python-code'; textarea.value = generated.console; textarea.readOnly = true; textarea.spellcheck = false; textarea.setAttribute('aria-label', 'FreeCAD console command'); body.append(textarea);
    const actions = el('div', 'modal-actions');
    const copy = el('button', 'primary', 'Copy console command'); copy.insertAdjacentHTML('afterbegin', icon('copy')); copy.onclick = async () => {
      try { await navigator.clipboard.writeText(generated.console); copy.textContent = 'Copied to clipboard'; toast('Paste the command into the FreeCAD Python console.'); }
      catch { textarea.focus(); textarea.select(); toast('Clipboard unavailable. The command is selected; copy it manually.', true); }
    };
    const save = el('button', 'secondary', 'Download Python'); save.insertAdjacentHTML('afterbegin', icon('download')); save.onclick = () => download(generated.script, `${fileStem(sourceName)}_freecad.py`, 'text/x-python'); actions.append(copy, save); body.append(actions);
    body.append(el('p', 'notice', 'The script creates a new document without modifying open projects. Save it as FCStd, or call orkad_export_step() or orkad_export_nose_stl() to choose an export destination. FreeCAD 0.21 or newer is recommended.'));
  });
};
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./cad.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (!activeRequest || data.id !== activeRequest.id) return;
      if (data.progress) { toast(data.progress, false, true); return; }
      clearTimeout(activeRequest.timer);
      const request = activeRequest; activeRequest = null; busy = false; updateButtons();
      if (data.error) { toast(data.error, true); return; }
      download(data.buffer, request.filename, request.kind === 'step' ? 'application/STEP' : 'model/stl');
      toast(`${request.kind === 'step' ? 'STEP assembly' : 'Nose cone STL'} exported · ${data.solids} validated solid${data.solids === 1 ? '' : 's'}.`);
    };
    worker.onerror = () => { if (activeRequest) clearTimeout(activeRequest.timer); activeRequest = null; busy = false; worker?.terminate(); worker = null; updateButtons(); toast('The CAD engine could not start. Try again, or use the FreeCAD script.', true); };
  }
  return worker;
}
function exportCad(kind) {
  if (!payload || busy) return;
  const nose = payload.parts.find((p) => p.sourceNodeId === selectedId && p.type === 'nosecone') || payload.parts.find((p) => p.type === 'nosecone');
  busy = true; updateButtons();
  const id = ++requestId;
  activeRequest = { id, kind, filename: `${fileStem(sourceName)}${kind === 'stl' ? `_${fileStem(nose.name)}` : ''}.${kind}`, timer: setTimeout(() => {
    worker?.terminate(); worker = null; activeRequest = null; busy = false; updateButtons(); toast('CAD export timed out. Try a lower profile resolution or use the FreeCAD script.', true);
  }, 180000) };
  getWorker().postMessage({ id, kind, payload, partId: nose?.id });
}
$('#export-step').onclick = () => exportCad('step'); $('#export-stl').onclick = () => exportCad('stl');
