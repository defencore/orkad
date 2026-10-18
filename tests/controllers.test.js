import test from 'node:test';
import assert from 'node:assert/strict';
import { ImportController } from '../src/import/controller.js';
import { CadClient } from '../src/cad/client.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
class WorkerStub {
  terminated = false;
  postMessage(data) {
    this.request = data;
  }
  terminate() {
    this.terminated = true;
  }
  result(data) {
    this.onmessage({ data: { id: this.request.id, ...data } });
  }
}
const result = () => ({ buffer: new ArrayBuffer(8), solids: 1 });

test('only the latest asynchronous import commits, even when an older read finishes last', async () => {
  const importer = new ImportController();
  const first = deferred(),
    second = deferred(),
    commits = [];
  const old = importer.run(
    () => first.promise,
    (value) => commits.push(value),
  );
  const current = importer.run(
    () => second.promise,
    (value) => commits.push(value),
  );
  second.resolve('new');
  assert.equal(await current, true);
  first.resolve('old');
  assert.equal(await old, false);
  assert.deepEqual(commits, ['new']);
});

test('cancelled import errors are ignored but the current error reaches the UI', async () => {
  const importer = new ImportController(),
    first = deferred();
  const old = importer.run(
    () => first.promise,
    () => assert.fail('Unexpected commit'),
  );
  importer.cancel();
  first.reject(new Error('Aborted'));
  assert.equal(await old, false);
  await assert.rejects(
    importer.run(
      () => Promise.reject(new Error('Read failed')),
      () => {},
    ),
    /Read failed/,
  );
});

test('CAD client clears busy state after constructor and serialization failures', async () => {
  let attempts = 0;
  const worker = new WorkerStub();
  const client = new CadClient(() => {
    if (++attempts === 1) throw new Error('Cannot start');
    return worker;
  });
  await assert.rejects(client.export('step', {}, undefined), /Cannot start/);
  const job = client.export('step', {}, undefined);
  worker.result(result());
  await job;
  worker.postMessage = () => {
    throw new Error('Cannot clone');
  };
  await assert.rejects(client.export('step', {}, undefined), /Cannot clone/);
  assert.equal(client.active, null);
  assert.equal(worker.terminated, true);
});

test('CAD client ignores stale messages, forwards progress, and rejects concurrent requests', async () => {
  const worker = new WorkerStub(),
    client = new CadClient(() => worker),
    progress = [];
  const job = client.export('step', {}, undefined, (text) => progress.push(text));
  worker.onmessage({ data: { id: -1, ...result() } });
  assert.notEqual(client.active, null);
  await assert.rejects(client.export('stl', {}, 'nose'), /already running/);
  worker.result({ progress: 'Building' });
  worker.result(result());
  assert.equal((await job).solids, 1);
  assert.deepEqual(progress, ['Building']);
  client.dispose();
});

test('CAD client can restart after timeout, worker errors, and malformed results', async () => {
  const workers = [],
    client = new CadClient(() => {
      const worker = new WorkerStub();
      workers.push(worker);
      return worker;
    }, 10);
  await assert.rejects(client.export('step', {}, undefined), /timed out/);
  assert.equal(workers[0].terminated, true);
  const failed = client.export('step', {}, undefined);
  workers[1].onerror();
  await assert.rejects(failed, /could not start/);
  const malformed = client.export('step', {}, undefined);
  workers[2].result({ buffer: 'bad', solids: 1 });
  await assert.rejects(malformed, /invalid export/);
  const successful = client.export('step', {}, undefined);
  workers[3].result(result());
  await successful;
  client.dispose();
});

test('disposing a CAD client rejects a pending request and terminates its worker', async () => {
  const worker = new WorkerStub(),
    client = new CadClient(() => worker);
  const job = client.export('step', {}, undefined);
  client.dispose();
  await assert.rejects(job, /cancelled/);
  assert.equal(worker.terminated, true);
});
