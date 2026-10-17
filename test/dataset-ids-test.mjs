import api from '../mapshaper.js';
import assert from 'assert';
import { unpackSessionData } from '../src/pack/mapshaper-unpack';
import { Catalog } from '../src/dataset/mapshaper-catalog';
import { copyDataset } from '../src/dataset/mapshaper-dataset-utils';
import {
  createDatasetId,
  rekeyIncomingDatasets
} from '../src/dataset/mapshaper-dataset-ids';

async function runInMemory(cmdStr, inputs) {
  var job = new api.internal.Job();
  var commands = api.internal.parseCommands(cmdStr);
  if (inputs) {
    commands.forEach(function(cmd) {
      if (cmd.name == 'i') cmd.options.input = inputs;
    });
  }
  await api.internal.runParsedCommands(commands, job);
  return job.catalog;
}

describe('mapshaper-dataset-ids.mjs', function () {

  it('createDatasetId() returns distinct 10-character strings', function () {
    var a = createDatasetId();
    var b = createDatasetId();
    assert.equal(typeof a, 'string');
    assert.equal(a.length, 10);
    assert.notEqual(a, b);
  })

  it('imported datasets are given distinct IDs', async function () {
    var catalog = await runInMemory('-i a.json -i b.json', {
      'a.json': [{foo: 1}],
      'b.json': [{foo: 2}]
    });
    var ids = catalog.getDatasets().map(function(d) { return d.id; });
    assert.equal(ids.length, 2);
    assert(ids[0] && ids[1]);
    assert.notEqual(ids[0], ids[1]);
  })

  it('datasets created by commands are given IDs', async function () {
    var catalog = await runInMemory('-rectangle bbox=0,0,1,1 -graticule');
    var datasets = catalog.getDatasets();
    assert.equal(datasets.length, 2);
    datasets.forEach(function(d) { assert(d.id); });
    assert.notEqual(datasets[0].id, datasets[1].id);
  })

  it('a dataset split with +apart gets new IDs, not copies of its source ID', async function () {
    var catalog = await runInMemory(
      '-i test/data/geojson/two_states.json -split + apart');
    var ids = catalog.getDatasets().map(function(d) { return d.id; });
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
  })

  it('copyDataset() does not copy the ID', function () {
    var copy = copyDataset({id: 'abc', layers: [], arcs: null, info: {}});
    assert(!('id' in copy));
  })

  it('IDs survive a .msx round trip', async function () {
    var out = await api.applyCommands('-i a.json -i b.json -o out.msx', {
      'a.json': [{foo: 1}],
      'b.json': [{foo: 2}]
    });
    var obj = await unpackSessionData(out['out.msx']);
    var ids = obj.datasets.map(function(d) { return d.id; });
    assert(ids[0] && ids[1]);
    var out2 = await api.applyCommands('-i in.msx -o out.msx', {'in.msx': out['out.msx']});
    var obj2 = await unpackSessionData(out2['out.msx']);
    assert.deepEqual(obj2.datasets.map(function(d) { return d.id; }), ids);
  })

  it('datasets from snapshots without IDs are given IDs on load', async function () {
    var catalog = await runInMemory('-i test/data/msx/mapshaper_snapshot.msx');
    var datasets = catalog.getDatasets();
    assert(datasets.length > 0);
    datasets.forEach(function(d) { assert(d.id); });
  })

  describe('rekeyIncomingDatasets()', function () {
    it('re-keys colliding IDs and the references to them', function () {
      var existing = [{id: 'frame1', info: {}}];
      var frame = {id: 'frame1', info: {}};
      var member = {id: 'm1', info: {frame: 'frame1'}};
      var changed = rekeyIncomingDatasets([frame, member], existing);
      assert.notEqual(frame.id, 'frame1');
      assert.equal(member.info.frame, frame.id);
      assert.equal(member.id, 'm1');
      assert.deepEqual(Object.keys(changed), ['frame1']);
    })

    it('incoming datasets that share an ID keep sharing one', function () {
      var existing = [{id: 'x', info: {}}];
      var a = {id: 'x', info: {}};
      var b = {id: 'x', info: {}};
      rekeyIncomingDatasets([a, b], existing);
      assert.notEqual(a.id, 'x');
      assert.equal(a.id, b.id);
    })

    it('leaves non-colliding IDs and existing references alone', function () {
      var existingMember = {id: 'm0', info: {frame: 'f'}};
      var existing = [{id: 'f', info: {}}, existingMember];
      var a = {id: 'a', info: {frame: 'f'}};
      rekeyIncomingDatasets([a], existing);
      assert.equal(a.id, 'a');
      assert.equal(a.info.frame, 'f');
      assert.equal(existingMember.info.frame, 'f');
    })
  })

  it('Catalog#addDatasets() re-keys a snapshot loaded twice', async function () {
    var out = await api.applyCommands('-i a.json -o out.msx', {'a.json': [{foo: 1}]});
    var catalog = new Catalog();
    catalog.addDatasets((await unpackSessionData(out['out.msx'])).datasets);
    catalog.addDatasets((await unpackSessionData(out['out.msx'])).datasets);
    var ids = catalog.getDatasets().map(function(d) { return d.id; });
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
  })
})
