import assert from 'assert';
import api from '../mapshaper.js';
import { ArcCollection } from '../src/paths/mapshaper-arcs';
import { mergeArcs } from '../src/dataset/mapshaper-merging';
import {
  getStoredUndoPayloadRefs,
  restoreStoredUndoUnits,
  storeUndoUnits
} from '../src/gui/gui-undo-unit-store';
import {
  createMemoryUndoPayloadBackend,
  createUndoPayloadStore
} from '../src/gui/gui-undo-payload-store';

var internal = api.internal;

function vertexData(arcs) {
  var data = arcs.getVertexData();
  return {
    nn: Array.from(data.nn),
    xx: Array.from(data.xx),
    yy: Array.from(data.yy),
    zz: data.zz ? Array.from(data.zz) : null
  };
}

// @n two-vertex arcs
function getLineArcs(n) {
  var arcs = [];
  for (var i = 0; i < n; i++) {
    arcs.push([[i, 0], [i, 1]]);
  }
  return new ArcCollection(arcs);
}

describe('mapshaper-arcs.mjs appendArcs()', function() {

  it('adds arcs after the existing arcs and updates bounds', function() {
    var arcs = new ArcCollection([[[0, 0], [1, 1]]]);
    arcs.appendArcs([3, 2], [5, 6, 7, -1, -2], [5, 6, 7, -1, -2]);
    assert.deepEqual(arcs.toArray(), [
      [[0, 0], [1, 1]],
      [[5, 5], [6, 6], [7, 7]],
      [[-1, -1], [-2, -2]]
    ]);
    assert.deepEqual(arcs.getBounds().toArray(), [-2, -2, 7, 7]);
    assert.deepEqual(arcs.getSimpleShapeBbox([2]), [-2, -2, -1, -1]);
  });

  it('matches the result of merging', function() {
    var a = getLineArcs(5);
    var b = getLineArcs(3);
    var merged = mergeArcs([a.getCopy(), b]);
    var data = b.getVertexData();
    a.appendArcs(data.nn, data.xx, data.yy);
    assert.deepEqual(vertexData(a), vertexData(merged));
  });

  it('reuses its own spare capacity on later appends', function() {
    var arcs = getLineArcs(10);
    var buf;
    arcs.appendArcs([2], [0, 1], [0, 1]);
    buf = arcs.getVertexData().xx.buffer;
    arcs.appendArcs([2], [2, 3], [2, 3]);
    assert.strictEqual(arcs.getVertexData().xx.buffer, buf);
    assert.equal(arcs.size(), 12);
  });

  it('does not write into a buffer that it did not allocate', function() {
    // xx and yy are views into one buffer, followed by a sentinel value:
    // writing past the end of xx would overwrite yy
    var buf = new ArrayBuffer(5 * 8);
    var xx = new Float64Array(buf, 0, 2);
    var yy = new Float64Array(buf, 16, 2);
    var all = new Float64Array(buf);
    var arcs;
    xx.set([0, 1]);
    yy.set([2, 3]);
    all[4] = 99;
    arcs = new ArcCollection(new Uint32Array([2]), xx, yy);
    arcs.appendArcs([2], [10, 11], [12, 13]);
    assert.deepEqual(Array.from(all), [0, 1, 2, 3, 99]);
    assert.deepEqual(arcs.toArray(), [[[0, 2], [1, 3]], [[10, 12], [11, 13]]]);
  });

  it('does not write into spare room in a buffer that it did not allocate', function() {
    // each array starts a larger buffer, as if an importer over-allocated,
    // with values after the end that belong to someone else
    var nnBuf = new Uint32Array([2, 99]);
    var xxBuf = new Float64Array([0, 1, 99, 99]);
    var yyBuf = new Float64Array([2, 3, 99, 99]);
    var arcs = new ArcCollection(new Uint32Array(nnBuf.buffer, 0, 1),
      new Float64Array(xxBuf.buffer, 0, 2), new Float64Array(yyBuf.buffer, 0, 2));
    arcs.appendArcs([2], [10, 11], [12, 13]);
    assert.deepEqual(Array.from(nnBuf), [2, 99]);
    assert.deepEqual(Array.from(xxBuf), [0, 1, 99, 99]);
    assert.deepEqual(Array.from(yyBuf), [2, 3, 99, 99]);
  });

  it('stops reusing capacity after its data is replaced from outside', function() {
    var arcs = getLineArcs(2);
    var data, external, sentinel;
    arcs.appendArcs([2], [0, 1], [0, 1]);
    data = arcs.getVertexData();
    // an array in a larger buffer, like a view handed in by other code
    external = new Float64Array(data.xx.length + 4);
    external.set(data.xx);
    sentinel = new Float64Array(external.buffer, data.xx.length * 8, 4);
    sentinel.fill(99);
    arcs.updateVertexData(new Uint32Array(data.nn),
      new Float64Array(external.buffer, 0, data.xx.length), new Float64Array(data.yy));
    arcs.appendArcs([2], [5, 6], [5, 6]);
    assert.deepEqual(Array.from(sentinel), [99, 99, 99, 99]);
  });

  it('truncateArcs() takes back appended arcs', function() {
    var arcs = getLineArcs(3);
    var before = vertexData(arcs);
    var bounds = arcs.getBounds().toArray();
    arcs.appendArcs([2], [100, 101], [100, 101]);
    arcs.truncateArcs(3);
    assert.deepEqual(vertexData(arcs), before);
    assert.deepEqual(arcs.getBounds().toArray(), bounds);
  });

  it('refuses simplified arcs', function() {
    var arcs = getLineArcs(2);
    arcs.setThresholds(new Float64Array([Infinity, Infinity, Infinity, Infinity]));
    assert.throws(function() {
      arcs.appendArcs([2], [0, 1], [0, 1]);
    });
  });
});

describe('-add-shape appends arcs in place', function() {

  // a polyline dataset with @n two-vertex lines
  function getLineDataset(n) {
    var features = [];
    for (var i = 0; i < n; i++) {
      features.push({
        type: 'Feature',
        properties: {id: i},
        geometry: {type: 'LineString', coordinates: [[i, 0], [i, 1]]}
      });
    }
    return internal.importGeoJSON({type: 'FeatureCollection', features: features});
  }

  function datasetState(dataset) {
    return JSON.stringify({
      arcs: vertexData(dataset.arcs),
      bounds: dataset.arcs.getBounds().toArray(),
      shapes: dataset.layers.map(function(lyr) { return lyr.shapes; })
    });
  }

  function runInTransaction(cb) {
    var tx = new internal.UndoTransaction('test');
    tx.run(cb);
    return tx;
  }

  function undo(tx) {
    internal.restoreCapturedUnits(internal.filterUnchangedRestoreUnits(tx.getCapturedUnits()));
  }

  // Adds a shape the way the command runner does: the output layer replaces
  // the target layer
  function addShape(dataset, opts) {
    var target = dataset.layers.slice();
    var output = api.cmd.addShape(target, dataset, opts);
    internal.replaceLayers(dataset, target, output);
    return output;
  }

  it('keeps the arc collection and records no copy of it', function() {
    var dataset = getLineDataset(20);
    var arcs = dataset.arcs;
    var tx = runInTransaction(function() {
      addShape(dataset, {coordinates: [50, 50, 60, 60]});
    });
    var units = tx.getCapturedUnits();
    var types = units.map(function(unit) { return unit.type; });
    assert.strictEqual(dataset.arcs, arcs);
    assert.equal(arcs.size(), 21);
    assert(types.includes('arcs-append'));
    assert(!types.includes('arcs'));
    units.forEach(function(unit) {
      if (unit.type == 'dataset') assert.strictEqual(unit.arcs, arcs);
    });
  });

  it('produces the same arcs as merging', function() {
    var dataset = getLineDataset(4);
    var copy = dataset.arcs.getCopy();
    var shape = internal.importGeoJSON({
      type: 'Feature', properties: null,
      geometry: {type: 'LineString', coordinates: [[50, 50], [60, 60], [70, 50]]}
    });
    var lyr;
    addShape(dataset, {coordinates: [50, 50, 60, 60, 70, 50]});
    lyr = dataset.layers[0];
    assert.deepEqual(vertexData(dataset.arcs), vertexData(internal.mergeArcs([copy, shape.arcs])));
    assert.equal(lyr.shapes.length, 5);
    assert.deepEqual(lyr.shapes[4], [[4]]);
  });

  it('extends a line by appending arcs', function() {
    var dataset = getLineDataset(3);
    var arcs = dataset.arcs;
    addShape(dataset, {coordinates: [0, 1, 0, 5], extend: true});
    assert.strictEqual(dataset.arcs, arcs);
    assert.deepEqual(dataset.layers[0].shapes[0], [[0, 3]]);
  });

  it('merges simplified arcs, as before', function() {
    var dataset = getLineDataset(2);
    var arcs = dataset.arcs;
    arcs.setThresholds(new Float64Array([Infinity, Infinity, Infinity, Infinity]));
    addShape(dataset, {coordinates: [50, 50, 60, 60]});
    assert.notStrictEqual(dataset.arcs, arcs);
    assert(dataset.arcs.isFlat());
  });

  // expected output was generated with the merging version of -add-shape
  it('gives the same output files as merging', async function() {
    var input = JSON.stringify({
      type: 'LineString', coordinates: [[0, 0], [1, 1], [2, 0]]
    });
    var cmd = '-i in.json -add-shape coordinates=5,5,6,6 -add-shape coordinates=2,0,3,3 extend';
    var output = await api.applyCommands(cmd + ' -o out.json', {'in.json': input});
    assert.equal(String(output['out.json']),
      '{"type":"GeometryCollection", "geometries": [\n' +
      '{"type":"LineString","coordinates":[[0,0],[1,1],[2,0],[3,3]]},\n' +
      '{"type":"LineString","coordinates":[[5,5],[6,6]]}\n' +
      ']}');
    output = await api.applyCommands(cmd + ' -o out.json format=topojson', {'in.json': input});
    assert.equal(String(output['out.json']),
      '{"type":"Topology","arcs":[[[0,0],[50,33],[50,-33],[50,100]],[[250,167],[50,33]]],' +
      '"transform":{"scale":[0.02,0.03],"translate":[0,0]},"objects":{"in":{"type":' +
      '"GeometryCollection","geometries":[{"type":"LineString","arcs":[0]},' +
      '{"type":"LineString","arcs":[1]}]}}}');
  });

  it('undo restores the arcs and the layer exactly', function() {
    var dataset = getLineDataset(20);
    var before = datasetState(dataset);
    var tx = runInTransaction(function() {
      addShape(dataset, {coordinates: [50, 50, 60, 60, 70, 70]});
    });
    undo(tx);
    assert.equal(datasetState(dataset), before);
  });

  it('extend: undo restores the arcs and the layer exactly', function() {
    var dataset = getLineDataset(5);
    var before = datasetState(dataset);
    var tx = runInTransaction(function() {
      addShape(dataset, {coordinates: [2, 1, 2, 3, 4, 4], extend: true});
    });
    undo(tx);
    assert.equal(datasetState(dataset), before);
  });

  it('redo restores the edit', function() {
    var dataset = getLineDataset(10);
    var tx, redoUnits, after;
    tx = runInTransaction(function() {
      addShape(dataset, {coordinates: [50, 50, 60, 60]});
    });
    after = datasetState(dataset);
    redoUnits = internal.captureCurrentUnits(tx.getCapturedUnits());
    undo(tx);
    internal.restoreCapturedUnits(redoUnits);
    assert.equal(datasetState(dataset), after);
  });

  it('redo data survives a different edit written over the freed space', function() {
    var dataset = getLineDataset(10);
    var before = datasetState(dataset);
    var tx1, tx2, redo1, afterFirst;
    tx1 = runInTransaction(function() {
      addShape(dataset, {coordinates: [50, 50, 60, 60, 70, 70]});
    });
    afterFirst = datasetState(dataset);
    redo1 = internal.captureCurrentUnits(tx1.getCapturedUnits());
    undo(tx1);

    tx2 = runInTransaction(function() {
      addShape(dataset, {coordinates: [-5, -5, -6, -6, -7, -7]});
    });
    undo(tx2);
    assert.equal(datasetState(dataset), before);

    internal.restoreCapturedUnits(redo1);
    assert.equal(datasetState(dataset), afterFirst);
  });

  it('a series of edits undoes in order', function() {
    var dataset = getLineDataset(10);
    var states = [datasetState(dataset)];
    var txs = [];
    [0, 1, 2, 3, 4].forEach(function(i) {
      txs.push(runInTransaction(function() {
        addShape(dataset, {coordinates: [50 + i, 50, 60 + i, 60]});
      }));
      states.push(datasetState(dataset));
    });
    for (var i = 4; i >= 0; i--) {
      undo(txs[i]);
      assert.equal(datasetState(dataset), states[i]);
    }
  });

  it('becomes a full arcs unit if the arcs are also changed in another way', function() {
    var dataset = getLineDataset(4);
    var before = datasetState(dataset);
    var tx, types, redoUnits, after;
    tx = runInTransaction(function() {
      addShape(dataset, {coordinates: [50, 50, 60, 60]});
      dataset.arcs.transformPoints(function(x, y) { return [x + 1, y]; });
      addShape(dataset, {coordinates: [80, 80, 90, 90]});
    });
    after = datasetState(dataset);
    types = tx.getCapturedUnits().map(function(unit) { return unit.type; });
    assert(!types.includes('arcs-append'));
    assert.equal(types.filter(function(type) { return type == 'arcs'; }).length, 1);

    redoUnits = internal.captureCurrentUnits(tx.getCapturedUnits());
    undo(tx);
    assert.equal(datasetState(dataset), before);
    internal.restoreCapturedUnits(redoUnits);
    assert.equal(datasetState(dataset), after);
  });

  it('becomes a full arcs unit if simplification is added afterwards', function() {
    var dataset = getLineDataset(3);
    var before = datasetState(dataset);
    var tx = runInTransaction(function() {
      addShape(dataset, {coordinates: [50, 50, 60, 60]});
      dataset.arcs.setThresholds(new Float64Array(dataset.arcs.getPointCount()).fill(Infinity));
    });
    undo(tx);
    assert.equal(datasetState(dataset), before);
  });

  it('round-trips through the undo payload store', async function() {
    var dataset = getLineDataset(10);
    var store = createUndoPayloadStore({backend: createMemoryUndoPayloadBackend()});
    var before = datasetState(dataset);
    var tx, units, storedUndo, storedRedo, after;
    tx = runInTransaction(function() {
      addShape(dataset, {coordinates: [50, 50, 60, 60]});
    });
    after = datasetState(dataset);
    units = internal.filterUnchangedRestoreUnits(tx.getCapturedUnits());
    storedUndo = await storeUndoUnits(units, store, 'entry1', 'undo');
    storedRedo = await storeUndoUnits(internal.captureCurrentUnits(units), store, 'entry1', 'redo');
    assert(storedRedo.some(function(unit) {
      return unit.type == 'arcs-append' && unit.payloadRef && !unit.xx;
    }));
    assert(getStoredUndoPayloadRefs(storedRedo).length > 0);

    await restoreStoredUndoUnits(storedUndo, store);
    assert.equal(datasetState(dataset), before);
    await restoreStoredUndoUnits(storedRedo, store);
    assert.equal(datasetState(dataset), after);
  });
});
