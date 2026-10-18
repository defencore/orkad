import { el } from './dom.js';
import { icon } from './icons.js';
import { GROUP_TYPES } from '../config.js';

function componentIcon(type) {
  if (type === 'nosecone') return 'cone';
  if (type.includes('finset')) return 'fin';
  if (type.includes('ring') || type === 'bulkhead') return 'ring';
  return GROUP_TYPES.has(type) ? 'folder' : 'cube';
}

export class ComponentTree {
  constructor(container, options) {
    this.container = container;
    this.options = options;
  }

  setModel(model) {
    this.model = model;
    this.nodes = new Map(model.nodes.map((node) => [node.id, node]));
    this.descendants = new Map();
    this.solidDescendants = new Map();
    const solids = new Set(model.parts.map((part) => part.sourceNodeId));
    const visit = (node) => {
      const ids = [node.id, ...node.children.flatMap(visit)];
      this.descendants.set(node.id, ids);
      this.solidDescendants.set(
        node.id,
        ids.filter((id) => solids.has(id)),
      );
      return ids;
    };
    visit(model.root);
  }

  descendantIds(node) {
    return this.descendants.get(node.id);
  }

  select(id) {
    let parent = this.nodes.get(this.nodes.get(id)?.parentId);
    let changed = false;
    while (parent) {
      changed = this.options.collapsed.delete(parent.id) || changed;
      parent = this.nodes.get(parent.parentId);
    }
    if (changed) this.render();
    this.container
      .querySelectorAll('.tree-row')
      .forEach((row) => row.classList.toggle('selected', row.dataset.id === id));
  }

  render() {
    const tree = this.container;
    const { hidden, collapsed, onSelect: selectNode, onVisibility, getSelectedId } = this.options;
    const model = this.model;
    tree.replaceChildren();
    const row = (node, depth) => {
      if (node.type === 'rocket') {
        node.children.forEach((c) => row(c, 0));
        return;
      }
      const wrapper = el('div', 'tree-item');
      const line = el('div', `tree-row${node.supported ? '' : ' unsupported'}`);
      line.style.setProperty('--depth', depth);
      line.dataset.id = node.id;
      line.classList.toggle('selected', node.id === getSelectedId());
      if (node.children.length) {
        const toggle = el('button', 'tree-expand');
        toggle.innerHTML = icon('chevron');
        toggle.classList.toggle('expanded', !collapsed.has(node.id));
        toggle.title = `${collapsed.has(node.id) ? 'Expand' : 'Collapse'} ${node.name}`;
        toggle.setAttribute('aria-label', toggle.title);
        toggle.setAttribute('aria-expanded', !collapsed.has(node.id));
        toggle.onclick = () => {
          collapsed.has(node.id) ? collapsed.delete(node.id) : collapsed.add(node.id);
          this.render();
        };
        line.append(toggle);
      } else line.append(el('span', 'tree-spacer'));
      const button = el('button', 'tree-select');
      button.innerHTML = icon(componentIcon(node.type));
      button.append(el('span', '', node.name));
      button.title = node.name;
      button.onclick = () => selectNode(node.id);
      line.append(button);
      const affectedIds = this.solidDescendants.get(node.id);
      if (affectedIds.length) {
        const allHidden = affectedIds.every((id) => hidden.has(id));
        const eye = el('button', 'visibility-button');
        eye.innerHTML = icon(allHidden ? 'eyeOff' : 'eye');
        eye.title = `${allHidden ? 'Show' : 'Hide'} ${node.name}`;
        eye.setAttribute('aria-label', eye.title);
        eye.onclick = () => {
          affectedIds.forEach((id) => (allHidden ? hidden.delete(id) : hidden.add(id)));
          onVisibility();
          this.render();
        };
        line.append(eye);
      } else if (!node.supported) line.append(el('span', 'omitted-dot', '·'));
      wrapper.append(line);
      tree.append(wrapper);
      if (!collapsed.has(node.id)) node.children.forEach((c) => row(c, depth + 1));
    };
    row(model.root, 0);
  }
}
