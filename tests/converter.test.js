import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { gzipSync, strToU8, zipSync } from 'fflate';
import { decodeOrk, parseOrk } from '../src/parser.js';
import { noseRadius, radiusAt, profileContour } from '../src/profiles.js';
import { DEFAULT_SETTINGS, makePayload } from '../src/model.js';
import { generateFreeCAD } from '../src/freecad.js';

const xml = fs.readFileSync(new URL('../public/demo.xml', import.meta.url), 'utf8');
const parse = (source) => parseOrk(source, DOMParser);
const minimal = (content) => `<openrocket version="1.10"><rocket><name>Test</name><subcomponents><stage><subcomponents>${content}</subcomponents></stage></subcomponents></rocket></openrocket>`;
const body = '<bodytube><name>Body</name><length>0.5</length><radius>0.025</radius><thickness>0.001</thickness></bodytube>';

test('plain XML, ZIP and GZIP designs decode identically', () => {
  for (const input of [strToU8(xml), gzipSync(strToU8(xml)), zipSync({ 'rocket.ork': strToU8(xml), 'textures/decal.png': new Uint8Array([1]) })]) assert.equal(decodeOrk(input), xml);
  assert.throws(() => decodeOrk(zipSync({ 'missing.xml': strToU8(xml) })), /rocket.ork/);
  assert.throws(() => decodeOrk(strToU8('<!DOCTYPE x><openrocket/>')), /document types/);
});

test('demo imports automatic nose radius, component tree and repeated fins', () => {
  const model = parse(xml);
  assert.equal(model.name, 'Aster 01');
  assert.equal(model.length, 900);
  assert.equal(model.diameter, 54);
  assert.equal(model.parts.length, 11);
  assert.equal(model.warnings.length, 0);
  assert.equal(model.parts.find((p) => p.type === 'nosecone').aftRadius, 27);
  const fins = model.parts.filter((p) => p.type === 'trapezoidfinset');
  assert.deepEqual(fins.map((p) => p.angle), [30, 150, 270]);
  assert.equal(fins[0].x, 730);
  assert.equal(fins[0].mountRadius, 27);
  assert.equal(model.parts.find((p) => p.name === 'Airframe').length, 450);
});

test('axial positioning uses parent, component length and signed offsets', () => {
  const source = minimal(`<bodytube><length>0.5</length><radius>0.025</radius><thickness>0.001</thickness><subcomponents>${['top','middle','bottom','absolute'].map((method) => `<bulkhead><name>${method}</name><outerradius>auto</outerradius><length>0.010</length><axialoffset method="${method}">-0.005</axialoffset></bulkhead>`).join('')}</subcomponents></bodytube>`);
  const model = parse(source);
  assert.deepEqual(model.parts.filter((p) => p.type === 'bulkhead').map((p) => p.x), [-5, 240, 485, -5]);
  assert.equal(model.parts.find((p) => p.type === 'bulkhead').radius, 24);
});

test('all six profile equations meet the tip and base and are monotone', () => {
  for (const [shape, p] of [['conical',0],['ogive',1],['ogive',0.35],['ellipsoid',0],['power',0.5],['parabolic',0.75],['haack',0],['haack',1/3]]) {
    let previous = 0;
    assert.equal(noseRadius(shape, 0, 27, 190, p), 0);
    assert.equal(noseRadius(shape, 190, 27, 190, p), 27);
    for (let i=1; i<=100; i++) { const r = noseRadius(shape, i*1.9, 27, 190, p); assert.ok(r >= previous-1e-9, `${shape} is monotone`); previous=r; }
  }
  assert.ok(Math.abs(noseRadius('ellipsoid',95,27,190,0)-27*Math.sqrt(0.75))<1e-9);
});

test('clipped and reversed transition profiles preserve endpoint radii', () => {
  const n = { type: 'transition', foreRadius: 10, aftRadius: 30, shape: 'haack', parameter: 0, clipped: true, length: 100 };
  assert.ok(Math.abs(radiusAt(n,0)-10)<1e-6);
  assert.ok(Math.abs(radiusAt(n,100)-30)<1e-6);
  const reverse = { ...n, foreRadius: 30, aftRadius: 10 };
  assert.ok(Math.abs(radiusAt(n,20)-radiusAt(reverse,80))<1e-6);
});

test('hollow nose contour closes the tip and includes the shoulder', () => {
  const model = parse(xml);
  const payload = makePayload(model,{...DEFAULT_SETTINGS,noseMode:'hollow',wallThickness:2});
  const nose = payload.parts.find((p)=>p.type==='nosecone');
  const contour = profileContour(nose.geometry);
  assert.deepEqual(contour[0],contour.at(-1));
  assert.equal(Math.max(...contour.map((p)=>p[1])),228);
  assert.ok(contour.some(([r,z])=>r===0 && z>0 && z<190));
  assert.ok(contour.some(([r,z])=>r===23.5 && z===228));
  assert.throws(()=>makePayload(model,{...DEFAULT_SETTINGS,noseMode:'hollow',wallThickness:27}),/thinner/);
});

test('unsupported assemblies omit descendants and produce explicit notices', () => {
  const model = parse(minimal(`${body}<unsupportedassembly><name>Boosters</name><subcomponents>${body}</subcomponents></unsupportedassembly>`));
  assert.equal(model.parts.length,1);
  assert.ok(model.warnings.some((w)=>w.includes('parent assembly')));
});

test('source filled thickness is parsed as a solid', () => {
  const model = parse(minimal(body.replace('<thickness>0.001</thickness>', '<thickness>filled</thickness>')));
  assert.equal(model.parts[0].filled,true);
});

test('malformed dimensions and unrecognised axial methods are rejected', () => {
  assert.throws(()=>parse(minimal(body.replace('0.5','NaN'))),/Invalid length/);
  assert.throws(()=>parse(minimal(body.replace('</length>','</length><axialoffset method="unknown">0</axialoffset>'))),/unknown axial/);
  assert.throws(()=>parse('<not-openrocket/>'),/valid OpenRocket/);
});

test('FreeCAD console command preserves Unicode names and safely embeds data', () => {
  const model=parse(xml.replace('Aster 01','Test &quot; name \\ Україна'));
  const payload=makePayload(model,DEFAULT_SETTINGS);
  const generated=generateFreeCAD(payload);
  assert.equal(JSON.parse(generated.console.slice(5,-1)),generated.script);
  const base64=generated.script.match(/b64decode\("([^"]+)"\)/)[1];
  const decoded=JSON.parse(Buffer.from(base64,'base64').toString('utf8'));
  assert.equal(decoded.name,model.name);
  assert.ok(generated.script.includes('len(shape.Solids) != 1'));
  assert.ok(generated.script.includes('Import.export([_orkad_root]'));
});

test('automatic body radius resolves from a preceding explicit nose base',()=>{
  const model=parse(minimal('<nosecone><length>0.1</length><thickness>0.002</thickness><aftradius>0.0125</aftradius></nosecone>'+body.replace('0.025','auto 0.0125')));
  assert.equal(model.parts.find(p=>p.type==='bodytube').radius,12.5);
  assert.ok(!model.warnings.some(w=>w.includes('could not be resolved')));
});

test('zero-thickness shoulders are omitted in source mode and gain a printable wall in hollow mode',()=>{
  const model=parse(xml.replace('<aftshoulderthickness>0.002</aftshoulderthickness>','<aftshoulderthickness>0</aftshoulderthickness>'));
  const source=makePayload(model,DEFAULT_SETTINGS).parts[0].geometry;
  const hollow=makePayload(model,{...DEFAULT_SETTINGS,noseMode:'hollow'}).parts[0].geometry;
  assert.equal(Math.max(...profileContour(source).map(p=>p[1])),190);
  assert.equal(Math.max(...profileContour(hollow).map(p=>p[1])),228);
  assert.ok(model.warnings.some(w=>w.includes('zero-thickness')));
});

test('heavy-lift example expands two side cores and 27 separate engine nozzles',()=>{
  const model=parse(fs.readFileSync(new URL('../public/triad-heavy.xml',import.meta.url),'utf8'));
  assert.equal(model.name,'TRIAD Heavy / H9');
  assert.equal(model.parts.length,139);
  assert.equal(model.warnings.length,0);
  assert.equal(model.parts.filter(p=>p.name.endsWith('/ nozzle') && p.name!=='Upper stage vacuum nozzle').length,27);
  const noses=model.parts.filter(p=>p.type==='nosecone');
  assert.deepEqual(noses.map(p=>Math.round(p.y)),[0,144,-144]);
  assert.ok(noses[1].x>0);
  assert.equal(new Set(model.nodes.map(n=>n.id)).size,model.nodes.length);
  const ids=new Set(model.nodes.map(n=>n.id));
  assert.ok(model.nodes.every(n=>n.parentId===null||ids.has(n.parentId)));
  assert.ok(model.parts.every(p=>ids.has(p.sourceNodeId)));
  assert.equal(new Set(model.parts.map(p=>p.id)).size,139);
});

test('nested pod offsets and rotations are inherited by every descendant solid',()=>{
  const xml=minimal(`<podset><name>Outer</name><instancecount>2</instancecount><angleoffset method="relative">90</angleoffset><radiusoffset method="free">0.1</radiusoffset><axialoffset method="top">0</axialoffset><subcomponents><podset><name>Inner</name><instancecount>1</instancecount><angleoffset method="fixed">0</angleoffset><radiusoffset method="free">0.02</radiusoffset><axialoffset method="top">0</axialoffset><subcomponents>${body}</subcomponents></podset></subcomponents></podset>`);
  const model=parse(xml);
  assert.equal(model.parts.length,2);
  assert.ok(Math.abs(model.parts[0].z-120)<1e-8);
  assert.ok(Math.abs(model.parts[1].z+120)<1e-8);
  assert.ok(model.parts.every(p=>Math.abs(p.y)<1e-8));
});

test('relative pod positions include both body radii and surface mode ignores the offset',()=>{
  for(const [method,expected] of [['relative',40],['surface',35]]){
    const source=minimal(`<bodytube><length>0.5</length><radius>0.025</radius><thickness>0.001</thickness><subcomponents><podset><instancecount>1</instancecount><radiusoffset method="${method}">0.005</radiusoffset><axialoffset method="top">0</axialoffset><subcomponents><bodytube><length>0.2</length><radius>0.010</radius><thickness>0.001</thickness></bodytube></subcomponents></podset></subcomponents></bodytube>`);
    const model=parse(source);
    assert.equal(model.parts[1].y,expected);
  }
});
