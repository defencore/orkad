import { $, el, toast, download } from './dom.js';
import { icon } from './icons.js';
import { generateFreeCAD } from '../freecad.js';
import { fileStem } from '../model.js';

export function bindDialogs(getState) {
  function openModal(title, eyebrow, build) {
    $('#modal-title').textContent = title;
    $('#modal-eyebrow').textContent = eyebrow;
    $('#modal-body').replaceChildren();
    build($('#modal-body'));
    $('#modal').showModal();
  }
  $('#close-modal').onclick = () => $('#modal').close();
  $('#modal').onclick = (event) => {
    if (event.target === $('#modal')) {
      const r = $('#modal').getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        $('#modal').close();
    }
  };
  function showGuide() {
    openModal('From .ork to your workshop', 'QUICK GUIDE', (body) => {
      const steps = [
        [
          'Open your design',
          'Drop an OpenRocket .ork file into the import panel. Inspect any notices in the import report.',
        ],
        [
          'Inspect every component',
          'Drag the model to orbit. Use X-ray, section view and the component tree to check the nose cavity, shoulders and internal parts.',
        ],
        [
          'Choose the nose construction',
          'Keep the original OpenRocket wall settings, make the nose solid, or choose a radial wall thickness for printing. Existing shoulder caps are preserved.',
        ],
        [
          'Take it into CAD',
          'Download a named STEP assembly directly, or copy the console command into FreeCAD using View → Panels → Python console. You can also download a readable .py file.',
        ],
        [
          'Print the nose',
          'Download the nose STL, or select its solid in FreeCAD and export STEP/STL. Check wall thickness, fit, print orientation and slicing before fabrication.',
        ],
      ];
      const list = el('ol', 'guide-steps');
      steps.forEach(([title, description]) => {
        const li = el('li');
        li.append(el('h3', '', title), el('p', '', description));
        list.append(li);
      });
      body.append(list);
      body.append(
        el(
          'p',
          'notice',
          'Supported geometry: serial stages, parallel boosters, instanced pods, nose cones, transitions, body and inner tubes, couplers, rings, bulkheads, engine blocks, launch lugs, and trapezoidal, elliptical or freeform fins. Tube fins, legacy inner-tube motor clusters, recovery systems, tabs, fillets and decals are omitted or reported. Aerodynamic fin sections use flat plates. This tool does not run flight simulations.',
        ),
      );
    });
  }
  $('#help').onclick = showGuide;
  $('#report').onclick = () => {
    const { model } = getState();
    return openModal('Import report', 'DESIGN CHECK', (body) => {
      if (!model) {
        body.append(el('p', '', 'Open a design to inspect its conversion report.'));
        return;
      }
      body.append(
        el(
          'p',
          'report-intro',
          `${model.name} · ${model.parts.length} solid parts prepared from ${model.nodes.length - 1} components.`,
        ),
      );
      if (!model.warnings.length)
        body.append(
          el('p', 'success-notice', 'No import warnings. All supported geometry has been prepared.'),
        );
      else {
        const list = el('ul', 'warning-list');
        model.warnings.forEach((w) => list.append(el('li', '', w)));
        body.append(list);
      }
      body.append(
        el(
          'p',
          'notice',
          'Curved profiles use sampled B-spline approximations (0.00001 mm fit tolerance at the samples). Profile sampling adds approximation error between samples. STEP and STL exports validate BREP geometry before saving. Source material and length properties in FreeCAD are informational.',
        ),
      );
      body.append(
        el(
          'p',
          'field-help',
          'Preview visibility, section cuts and exploded positions do not change exports. All dimensions are in millimetres.',
        ),
      );
    });
  };
  $('#freecad').onclick = () => {
    const { payload, sourceName } = getState();
    if (!payload) return;
    const generated = generateFreeCAD(payload);
    openModal('A structured project in FreeCAD', 'PYTHON CONSOLE', (body) => {
      body.append(
        el(
          'p',
          'modal-intro',
          'In FreeCAD, open View → Panels → Python console. Paste the command below and press Enter. A new document will contain your component tree and validated solids.',
        ),
      );
      const label = el('label', 'code-label', 'PASTE-READY CONSOLE COMMAND');
      label.htmlFor = 'python-code';
      body.append(label);
      const textarea = el('textarea', 'code-box');
      textarea.id = 'python-code';
      textarea.value = generated.console;
      textarea.readOnly = true;
      textarea.spellcheck = false;
      textarea.setAttribute('aria-label', 'FreeCAD console command');
      body.append(textarea);
      const actions = el('div', 'modal-actions');
      const copy = el('button', 'primary', 'Copy console command');
      copy.insertAdjacentHTML('afterbegin', icon('copy'));
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(generated.console);
          copy.textContent = 'Copied to clipboard';
          toast('Paste the command into the FreeCAD Python console.');
        } catch {
          textarea.focus();
          textarea.select();
          toast('Clipboard unavailable. The command is selected; copy it manually.', true);
        }
      };
      const save = el('button', 'secondary', 'Download Python');
      save.insertAdjacentHTML('afterbegin', icon('download'));
      save.onclick = () => download(generated.script, `${fileStem(sourceName)}_freecad.py`, 'text/x-python');
      actions.append(copy, save);
      body.append(actions);
      body.append(
        el(
          'p',
          'notice',
          'The script creates a new document without modifying open projects. Save it as FCStd, or call orkad_export_step() or orkad_export_nose_stl() to choose an export destination. FreeCAD 0.21 or newer is recommended.',
        ),
      );
    });
  };
}
