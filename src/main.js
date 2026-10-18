import './style.css';
import { decodeOrk, parseOrk, MAX_FILE_SIZE } from './parser.js';
import { DEFAULT_SETTINGS, makePayload, fileStem } from './model.js';
import { $, el, toast, download } from './ui/dom.js';
import { ComponentTree } from './ui/component-tree.js';
import { validateSettings } from './cad/validate.js';
import { renderWorkspace } from './ui/template.js';
import { bindDialogs } from './ui/dialogs.js';
import { CadClient } from './cad/client.js';
import { ImportController } from './import/controller.js';
import { RocketViewer } from './viewer.js';

let model,
  payload,
  selectedId,
  sourceName,
  busy = false;
const events = new AbortController();
let disposed = false;
const settings = { ...DEFAULT_SETTINGS };
const hidden = new Set();
const collapsed = new Set();

renderWorkspace($('#app'));
const viewer = new RocketViewer($('#viewer'), selectNode, (message) => {
  $('#viewer-error').textContent = message;
  $('#viewer-error').hidden = false;
});
const tree = new ComponentTree($('#component-tree'), {
  hidden,
  collapsed,
  onSelect: selectNode,
  onVisibility: () => viewer.applyDisplay(),
  getSelectedId: () => selectedId,
});
bindDialogs(() => ({ model, payload, sourceName }));
function updateButtons() {
  $('#export-step').disabled = !payload || busy;
  $('#freecad').disabled = !payload || busy;
  $('#export-stl').disabled = !payload?.parts.some((p) => p.type === 'nosecone') || busy;
  for (const input of ['#nose-mode', '#wall', '#resolution']) $(input).disabled = busy;
}
function loadBytes(bytes, name) {
  if (busy) {
    toast('Wait for the current CAD export to finish.');
    return;
  }
  try {
    const nextModel = parseOrk(decodeOrk(bytes));
    const nextPayload = makePayload(nextModel, settings);
    viewer.load(nextPayload);
    model = nextModel;
    payload = nextPayload;
    sourceName = name;
    hidden.clear();
    collapsed.clear();
    model.nodes
      .filter((n) => n.children.length && !['rocket', 'stage', 'axialstage'].includes(n.type))
      .forEach((n) => collapsed.add(n.id));
    selectedId = null;
    viewer.hidden = hidden;
    viewer.selected = null;
    $('#explode').value = 0;
    $('#explode-value').textContent = '0%';
    viewer.explode = 0;
    $('#viewer-empty').hidden = true;
    $('#model-label').hidden = false;
    $('#model-name').textContent = model.name;
    $('#source-name').textContent = name;
    $('#source-info').textContent = `${model.creator} · format ${model.version}`;
    $('#project-file').hidden = false;
    $('#part-count').textContent = model.nodes.length - 1;
    $('#stat-length').replaceChildren(
      document.createTextNode(model.length.toFixed(1) + ' '),
      el('small', '', 'mm'),
    );
    $('#stat-diameter').replaceChildren(
      document.createTextNode(model.diameter.toFixed(1) + ' '),
      el('small', '', 'mm'),
    );
    $('#stat-parts').textContent = model.parts.length;
    $('#report-summary').textContent = model.warnings.length
      ? `${model.parts.length} solid parts prepared · ${model.warnings.length} import notice${model.warnings.length === 1 ? '' : 's'} — review before export`
      : `${model.parts.length} solid parts prepared · No import warnings`;
    $('.report-bar').classList.toggle('has-warnings', !!model.warnings.length);
    tree.setModel(model);
    tree.render();
    viewer.applyDisplay();
    selectNode(model.nodes.find((n) => n.type === 'nosecone')?.id || model.parts[0].sourceNodeId);
    updateButtons();
    toast(`${model.name} is ready to inspect.`);
  } catch (error) {
    toast(error.message || 'The design could not be opened.', true);
  }
}
const imports = new ImportController();
async function readDesign(read, name) {
  if (busy) {
    toast('Wait for the current CAD export to finish.');
    return;
  }
  try {
    await imports.run(read, (bytes) => {
      if (!busy) loadBytes(bytes, name);
    });
  } catch (error) {
    toast(error.message || 'The design could not be opened.', true);
  }
}
async function loadFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    imports.cancel();
    toast('Choose an OpenRocket file smaller than 20 MB.', true);
    return;
  }
  await readDesign(() => file.arrayBuffer(), file.name);
  $('#file-input').value = '';
}
function loadDemo() {
  return readDesign(async (signal) => {
    const response = await fetch(`${import.meta.env.BASE_URL}triad-heavy.ork`, { signal });
    if (!response.ok) throw new Error('The example design could not be loaded.');
    return response.arrayBuffer();
  }, 'triad-heavy.ork');
}
$('#dropzone').onclick = () => $('#file-input').click();
$('#file-input').onchange = (event) => loadFile(event.target.files[0]);
$('#load-demo').onclick = loadDemo;
$('#empty-demo').onclick = loadDemo;
let dragDepth = 0;
document.addEventListener(
  'dragenter',
  (event) => {
    event.preventDefault();
    dragDepth++;
    $('#dropzone').classList.add('dragover');
  },
  { signal: events.signal },
);
document.addEventListener('dragover', (event) => event.preventDefault(), { signal: events.signal });
document.addEventListener(
  'dragleave',
  () => {
    if (--dragDepth <= 0) $('#dropzone').classList.remove('dragover');
  },
  { signal: events.signal },
);
document.addEventListener(
  'drop',
  (event) => {
    event.preventDefault();
    dragDepth = 0;
    $('#dropzone').classList.remove('dragover');
    loadFile(event.dataTransfer.files[0]);
  },
  { signal: events.signal },
);
function selectNode(id) {
  if (!model) return;
  const node = model.nodes.find((n) => n.id === id);
  if (!node) return;
  selectedId = id;
  tree.select(id);
  viewer.select(tree.descendantIds(node));
  const detail = $('#selection-details');
  detail.replaceChildren();
  detail.append(
    el('h3', '', node.name),
    el('span', 'type-label', node.type.replace(/([a-z])(tube|cone|ring|finset)/g, '$1 $2')),
  );
  const values = [['Length', `${node.length.toFixed(2)} mm`]];
  if (node.radius) values.push(['Outer diameter', `${(node.radius * 2).toFixed(2)} mm`]);
  if (node.aftRadius) values.push(['Base diameter', `${(node.aftRadius * 2).toFixed(2)} mm`]);
  if (node.type === 'nosecone')
    values.push(
      ['Profile', node.shape],
      [
        'Wall',
        settings.noseMode === 'solid' || (node.filled && settings.noseMode === 'source')
          ? 'Solid'
          : `${(settings.noseMode === 'hollow' ? settings.wallThickness : node.thickness).toFixed(2)} mm`,
      ],
    );
  else if (node.thickness && !node.children.length)
    values.push(['Thickness', `${node.thickness.toFixed(2)} mm`]);
  if (node.children.length)
    values.push([
      'Solid components',
      String(model.parts.filter((p) => tree.descendantIds(node).includes(p.sourceNodeId)).length),
    ]);
  if (node.count > 1) values.push(['Instances', String(node.count)]);
  if (node.x !== undefined) values.push(['Axial position', `${node.x.toFixed(2)} mm`]);
  if (!node.supported) detail.append(el('p', 'notice', 'Geometry omitted. See the import report.'));
  const dl = el('dl');
  for (const [label, value] of values) dl.append(el('dt', '', label), el('dd', '', value));
  detail.append(dl);
  const nose =
    model.parts.find((p) => p.sourceNodeId === id && p.type === 'nosecone') ||
    model.parts.find((p) => p.type === 'nosecone');
  if (nose) $('#export-stl span small').textContent = `Export ${nose.name}`;
}
function rebuildSettings() {
  const proposed = {
    noseMode: $('#nose-mode').value,
    wallThickness: Number($('#wall').value),
    samples: Number($('#resolution').value),
  };
  try {
    validateSettings(proposed);
    const nextPayload = model ? makePayload(model, proposed) : null;
    if (nextPayload) viewer.load(nextPayload, false);
    Object.assign(settings, proposed);
    payload = nextPayload;
    $('#wall-field').hidden = settings.noseMode !== 'hollow';
    $('#nose-description').textContent = {
      source: 'Preserves the source wall, shoulder and cap settings.',
      hollow: 'Closed material shell with a sealed tip and source shoulder. Thickness is measured radially.',
      solid: 'A fully solid nose cone, including its source shoulder.',
    }[settings.noseMode];
    if (payload) selectNode(selectedId);
  } catch (error) {
    toast(error.message, true);
    $('#nose-mode').value = settings.noseMode;
    $('#wall').value = settings.wallThickness;
    $('#resolution').value = settings.samples;
  }
  updateButtons();
}
$('#nose-mode').onchange = rebuildSettings;
$('#wall').onchange = rebuildSettings;
$('#resolution').onchange = rebuildSettings;
$('#display-modes').onclick = (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  viewer.mode = target.dataset.mode;
  viewer.applyDisplay();
  $('#display-modes')
    .querySelectorAll('button')
    .forEach((b) => {
      const active = b === target;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active);
    });
};
$('#fit').onclick = () => viewer.fit();
$('#iso').onclick = () => viewer.fit('iso');
$('#front').onclick = () => viewer.fit('front');
$('#side').onclick = () => viewer.fit('side');
$('#section').onchange = (event) => {
  viewer.section = event.target.checked;
  viewer.applyDisplay();
};
$('#explode').oninput = (event) => {
  $('#explode-value').textContent = `${event.target.value}%`;
  viewer.explode = event.target.value / 100;
  viewer.applyDisplay();
};

const cad = new CadClient(() => new Worker(new URL('./cad.worker.js', import.meta.url), { type: 'module' }));
async function exportCad(kind) {
  if (!payload || busy) return;
  const nose =
    payload.parts.find((part) => part.sourceNodeId === selectedId && part.type === 'nosecone') ||
    payload.parts.find((part) => part.type === 'nosecone');
  if (kind === 'stl' && !nose) return;
  imports.cancel();
  busy = true;
  updateButtons();
  try {
    const result = await cad.export(kind, payload, nose?.id, (message) => toast(message, false, true));
    download(
      result.buffer,
      `${fileStem(sourceName)}${kind === 'stl' ? `_${fileStem(nose.name)}` : ''}.${kind}`,
      kind === 'step' ? 'application/STEP' : 'model/stl',
    );
    toast(
      `${kind === 'step' ? 'STEP assembly' : 'Nose cone STL'} exported · ${result.solids} validated solid${result.solids === 1 ? '' : 's'}.`,
    );
  } catch (error) {
    if (!disposed) toast(error.message, true);
  } finally {
    busy = false;
    if (!disposed) updateButtons();
  }
}
$('#export-step').onclick = () => exportCad('step');
$('#export-stl').onclick = () => exportCad('stl');
const dispose = () => {
  disposed = true;
  events.abort();
  imports.cancel();
  cad.dispose();
  viewer.dispose();
};
window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose();
  },
  { signal: events.signal },
);
if (import.meta.hot) import.meta.hot.dispose(dispose);
