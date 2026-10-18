import fs from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseOrk } from '../src/parser.js';
import { makePayload, DEFAULT_SETTINGS } from '../src/model.js';

export function geometryFixtures() {
  const fixtures = [];
  const add = (name, node, settings = DEFAULT_SETTINGS) => {
    const xml = `<openrocket><rocket><name>${name}</name><subcomponents><stage><subcomponents>${node}</subcomponents></stage></subcomponents></rocket></openrocket>`;
    fixtures.push({ name, payload: makePayload(parseOrk(xml, DOMParser), settings) });
  };
  const nose = (shape, extra = '', parameter = '') =>
    `<nosecone><name>${shape} nose</name><length>0.19</length><aftradius>0.027</aftradius><thickness>0.002</thickness><shape>${shape}</shape>${parameter}${extra}</nosecone>`;
  const aft =
    '<aftshoulderlength>0.038</aftshoulderlength><aftshoulderradius>0.0255</aftshoulderradius><aftshoulderthickness>0.002</aftshoulderthickness>';
  for (const shape of ['conical', 'ogive', 'ellipsoid', 'power', 'parabolic', 'haack']) {
    for (const mode of ['source', 'hollow', 'solid']) {
      add(`${shape}-${mode}`, nose(shape, aft), { ...DEFAULT_SETTINGS, noseMode: mode, wallThickness: 2.4 });
    }
    add(`${shape}-flipped`, nose(shape, aft + '<isflipped>true</isflipped>'), {
      ...DEFAULT_SETTINGS,
      noseMode: 'hollow',
    });
    for (const reverse of [false, true]) {
      add(
        `${shape}-transition-${reverse ? 'shrinking' : 'expanding'}`,
        `<transition><length>0.1</length><foreradius>${reverse ? '.03' : '.01'}</foreradius><aftradius>${reverse ? '.01' : '.03'}</aftradius><thickness>.002</thickness><shape>${shape}</shape><shapeclipped>true</shapeclipped><foreshoulderlength>.015</foreshoulderlength><foreshoulderradius>.009</foreshoulderradius><foreshoulderthickness>.002</foreshoulderthickness><aftshoulderlength>.02</aftshoulderlength><aftshoulderradius>.009</aftshoulderradius><aftshoulderthickness>.002</aftshoulderthickness></transition>`,
      );
    }
  }
  add('power-zero', nose('power', aft, '<shapeparameter>0</shapeparameter>'));
  add('ogive-short', nose('ogive', aft).replace('0.19', '0.019'));
  add('nose-capped', nose('ogive', aft + '<aftshouldercapped>true</aftshouldercapped>'));
  add(
    'nose-full-cap',
    nose('ellipsoid', aft.replace('0.038', '0.001') + '<aftshouldercapped>true</aftshouldercapped>'),
  );
  add('nose-narrow-shoulder', nose('haack', aft.replace('0.0255', '0.003')), {
    ...DEFAULT_SETTINGS,
    noseMode: 'hollow',
    wallThickness: 4,
  });
  add(
    'nose-zero-shoulder',
    nose('ogive', aft.replace('<aftshoulderthickness>0.002', '<aftshoulderthickness>0')),
  );
  add('nose-thick-wall', nose('power', aft), { ...DEFAULT_SETTINGS, noseMode: 'hollow', wallThickness: 26 });
  add(
    'transition-fore-capped',
    '<transition><length>.1</length><foreradius>.02</foreradius><aftradius>.03</aftradius><thickness>.002</thickness><foreshoulderlength>.01</foreshoulderlength><foreshoulderradius>.018</foreshoulderradius><foreshoulderthickness>.002</foreshoulderthickness><foreshouldercapped>true</foreshouldercapped></transition>',
  );
  add(
    'solid-fore-shoulder',
    '<transition><length>.1</length><foreradius>.02</foreradius><aftradius>.03</aftradius><filled>true</filled><foreshoulderlength>.01</foreshoulderlength><foreshoulderradius>.018</foreshoulderradius></transition>',
  );
  add(
    'freeform-closed-outline',
    '<bodytube><length>.5</length><radius>.025</radius><thickness>.001</thickness><subcomponents><freeformfinset><fincount>3</fincount><thickness>.003</thickness><cant>3</cant><finpoints><point x="0" y="0"/><point x=".03" y=".04"/><point x=".08" y="0"/><point x="0" y="0"/></finpoints></freeformfinset></subcomponents></bodytube>',
  );
  for (const file of ['demo.xml', 'triad-heavy.xml'])
    fixtures.push({
      name: file,
      payload: makePayload(
        parseOrk(fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8'), DOMParser),
        DEFAULT_SETTINGS,
      ),
    });
  return fixtures;
}
