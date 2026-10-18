import assert from 'assert';
import api from '../mapshaper.js';
import {
  getFrameRef,
  getSharedFrameRef,
  setFrameRef
} from '../src/dataset/mapshaper-frame-membership';
import { inheritFrameRef } from '../src/furniture/mapshaper-frame-resolver';
import { mergeDatasets, mergeDatasetInfo as mergeInfoForMerging } from '../src/dataset/mapshaper-merging';
import { mergeDatasetInfo } from '../src/dataset/mapshaper-dataset-utils';
import {
  clearActiveUndoTransaction,
  setActiveUndoTransaction
} from '../src/undo/mapshaper-undo-tracking';

var I = api.internal;

// Import, add a frame named f1, then make datasets members of it (a truthy
// entry in @refs, by dataset index) before running the commands under test.
// References to frames that don't exist are cleared after each command, so
// f1 is a real frame. (Without @refs, no frame is added.)
async function runWithMembership(importCmd, refs, cmdStr) {
  var job = new I.Job();
  var datasets, targets;
  await I.runParsedCommands(I.parseCommands(importCmd), job);
  datasets = job.catalog.getDatasets().concat();
  targets = job.catalog.getDefaultTargets();
  if (refs.some(Boolean)) {
    await I.runParsedCommands(I.parseCommands('-frame bbox=0,0,1,1 width=100 name=f1'), job);
    job.catalog.setDefaultTargets(targets);
  }
  datasets.forEach(function(dataset, i) {
    if (refs[i]) dataset.info.frame = f1(job.catalog);
  });
  await I.runParsedCommands(I.parseCommands(cmdStr), job);
  return job.catalog;
}

function f1(catalog) {
  return I.getFrameByName(catalog, 'f1').dataset.id;
}

function findDataset(catalog, layerName) {
  var o = catalog.getLayers().find(function(o) { return o.layer.name == layerName; });
  return o ? o.dataset : null;
}

var twoBoxes = '-rectangle bbox=0,0,1000,1000 name=a -rectangle bbox=500,500,1500,1500 name=b';

describe('frame membership', function() {

  describe('helpers', function() {
    afterEach(function() {
      clearActiveUndoTransaction();
    });

    it('getFrameRef() and getSharedFrameRef()', function() {
      var a = {info: {frame: 'f1'}};
      var b = {info: {frame: 'f1'}};
      var c = {info: {}};
      assert.equal(getFrameRef(a), 'f1');
      assert.equal(getFrameRef(c), null);
      assert.equal(getFrameRef({}), null);
      assert.equal(getSharedFrameRef([a, b]), 'f1');
      assert.equal(getSharedFrameRef([a, c]), null);
      assert.equal(getSharedFrameRef([c]), null);
      assert.equal(getSharedFrameRef([]), null);
    });

    it('setFrameRef() sets and clears the reference as an undoable info change', function() {
      var dataset = {info: {}, layers: []};
      var events = [];
      setActiveUndoTransaction({
        captureDatasetInfoBefore: function(obj, detail) {
          events.push('capture:' + detail.operation);
        },
        markChanged: function(obj, detail) {
          events.push('changed:' + detail.granularity);
        }
      });
      setFrameRef(dataset, 'f1');
      assert.equal(dataset.info.frame, 'f1');
      setFrameRef(dataset, 'f1'); // no change, no events
      setFrameRef(dataset, null);
      assert(!('frame' in dataset.info));
      assert.deepEqual(events, [
        'capture:setFrameRef', 'changed:info',
        'capture:setFrameRef', 'changed:info'
      ]);
    });

    it('inheritFrameRef() uses the shared frame of the sources', function() {
      var out = {info: {frame: 'stale'}, layers: []};
      inheritFrameRef(out, [{info: {frame: 'f1'}, layers: []}, {info: {frame: 'f1'}, layers: []}]);
      assert.equal(out.info.frame, 'f1');
      inheritFrameRef(out, [{info: {frame: 'f1'}, layers: []}, {info: {}, layers: []}]);
      assert(!('frame' in out.info));
      inheritFrameRef(out, []);
      assert(!('frame' in out.info));
    });

    it('inheritFrameRef() treats a frame dataset as belonging to its own frame', async function() {
      var job = new I.Job();
      await I.runParsedCommands(I.parseCommands(
        '-rectangle bbox=0,0,1000,1000 name=a -frame width=400'), job);
      var frameDataset = findDataset(job.catalog, 'frame');
      var out = {info: {}, layers: []};
      inheritFrameRef(out, [frameDataset]);
      assert.equal(out.info.frame, frameDataset.id);
    });
  });

  describe('merging info', function() {
    it('mergeDatasetInfo() never inherits a frame reference from the merged-in dataset', function() {
      var dest = {info: {}, layers: []};
      mergeDatasetInfo(dest, {info: {frame: 'f1', foo: 'bar'}});
      assert.equal(dest.info.foo, 'bar');
      assert(!('frame' in dest.info));
      var dest2 = {info: {frame: 'f2'}, layers: []};
      mergeDatasetInfo(dest2, {info: {frame: 'f1'}});
      assert.equal(dest2.info.frame, 'f2');
    });

    it('the merging module\'s mergeDatasetInfo() does the same', function() {
      var dest = {info: {}};
      mergeInfoForMerging(dest, {info: {frame: 'f1'}});
      assert(!('frame' in dest.info));
    });

    it('mergeDatasets() keeps a frame reference only if every part has it', function() {
      var a = {info: {frame: 'f1'}, layers: []};
      var b = {info: {frame: 'f1'}, layers: []};
      var c = {info: {}, layers: []};
      assert.equal(mergeDatasets([a, b]).info.frame, 'f1');
      assert(!('frame' in mergeDatasets([a, c]).info));
      assert(!('frame' in mergeDatasets([c, a]).info));
    });
  });

  describe('datasets created by commands', function() {
    it('-merge-layers across datasets of one frame stays in the frame', async function() {
      var catalog = await runWithMembership(twoBoxes, [true, true],
        '-merge-layers target=a,b name=ab');
      assert.equal(getFrameRef(findDataset(catalog, 'ab')), f1(catalog));
    });

    it('-merge-layers of framed and unframed datasets goes into the frame', async function() {
      var catalog = await runWithMembership(twoBoxes, [true, null],
        '-merge-layers target=a,b name=ab');
      assert.equal(getFrameRef(findDataset(catalog, 'ab')), f1(catalog));
    });

    it('a grid made over a member dataset belongs to the frame', async function() {
      var catalog = await runWithMembership('-rectangle bbox=0,0,1000,1000 name=a', [true],
        '-grid interval=500 name=grid');
      assert.equal(getFrameRef(findDataset(catalog, 'grid')), f1(catalog));
    });

    it('a grid made over an unframed dataset is unframed', async function() {
      var catalog = await runWithMembership('-rectangle bbox=0,0,1000,1000 name=a', [null],
        '-grid interval=500 name=grid');
      assert.equal(getFrameRef(findDataset(catalog, 'grid')), null);
    });

    it('a grid made over a frame belongs to that frame', async function() {
      var catalog = await runWithMembership('-rectangle bbox=0,0,1000,1000 name=a -frame width=400',
        [], '-grid target=frame interval=500 + name=grid');
      assert.equal(getFrameRef(findDataset(catalog, 'grid')), findDataset(catalog, 'frame').id);
    });

    it('-rectangle source= belongs to the frame of its source', async function() {
      var catalog = await runWithMembership('-rectangle bbox=0,0,1000,1000 name=a', [true],
        '-rectangle source=a name=box');
      assert.equal(getFrameRef(findDataset(catalog, 'box')), f1(catalog));
    });

    it('+ apart keeps split-off datasets in the frame', async function() {
      var catalog = await runWithMembership('-i test/data/geojson/two_states.json name=states',
        [true], '-split + apart');
      var datasets = catalog.getDatasets().filter(function(dataset) {
        return !I.findFrameLayerInDataset(dataset);
      });
      assert.equal(datasets.length, 3);
      datasets.forEach(function(dataset) {
        assert.equal(getFrameRef(dataset), f1(catalog));
      });
    });

    it('-graticule joins the frame of a target that is a member', async function() {
      var catalog = await runWithMembership('-i test/data/geojson/two_states.json name=states',
        [true], '-graticule');
      assert.equal(getFrameRef(findDataset(catalog, 'graticule')), f1(catalog));
    });

    it('commands that replace layers keep the dataset in its frame', async function() {
      var catalog = await runWithMembership('-i test/data/geojson/two_states.json name=states',
        [true], '-dissolve');
      assert.equal(getFrameRef(findDataset(catalog, 'states')), f1(catalog));
    });
  });

  it('frame references survive a .msx round trip', async function() {
    var job = new I.Job();
    await I.runParsedCommands(I.parseCommands(twoBoxes), job);
    job.catalog.getDatasets()[0].info.frame = 'f1';
    var obj = await I.exportDatasetsToPack(job.catalog.getDatasets(), {});
    var restored = await I.restoreSessionData(obj);
    assert.equal(restored.datasets[0].info.frame, 'f1');
    assert(!('frame' in restored.datasets[1].info));
  });
});
