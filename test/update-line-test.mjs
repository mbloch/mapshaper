import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

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

// Runs the command the way the command runner does: the output layer replaces
// the target layer
function updateLine(dataset, opts) {
  var target = dataset.layers.slice();
  var output = api.cmd.updateLine(target, dataset, opts);
  internal.replaceLayers(dataset, target, output);
  return output;
}

function datasetState(dataset) {
  var data = dataset.arcs.getVertexData();
  return JSON.stringify({
    nn: Array.from(data.nn),
    xx: Array.from(data.xx),
    yy: Array.from(data.yy),
    shapes: dataset.layers.map(function(lyr) { return lyr.shapes; })
  });
}

describe('mapshaper-update-line.mjs', function () {

  it('replaces the path of a line, keeping its attributes', async function () {
    var input = {type: 'FeatureCollection', features: [
      {type: 'Feature', properties: {name: 'a'}, geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]}},
      {type: 'Feature', properties: {name: 'b'}, geometry: {type: 'LineString', coordinates: [[2, 2], [3, 3]]}}
    ]};
    var out = await api.applyCommands('-i in.json -update-line ids=1 coordinates=5,5,6,7,8,5 -o out.json',
      {'in.json': input});
    var features = JSON.parse(out['out.json']).features;
    assert.deepEqual(features[0].geometry, {type: 'LineString', coordinates: [[0, 0], [1, 1]]});
    assert.deepEqual(features[1].geometry, {type: 'LineString', coordinates: [[5, 5], [6, 7], [8, 5]]});
    assert.deepEqual(features[1].properties, {name: 'b'});
  });

  it('a closed path makes a closed line', async function () {
    var out = await api.applyCommands('-i in.json -update-line ids=0 coordinates=0,0,4,0,4,4,0,0 -o out.json',
      {'in.json': {type: 'LineString', coordinates: [[0, 0], [1, 1]]}});
    var geom = JSON.parse(out['out.json']).geometries[0];
    assert.deepEqual(geom, {type: 'LineString', coordinates: [[0, 0], [4, 0], [4, 4], [0, 0]]});
  });

  it('appends the new arcs and leaves the old ones unreferenced', function () {
    var dataset = getLineDataset(3);
    var arcs = dataset.arcs;
    updateLine(dataset, {ids: [1], coordinates: [10, 10, 11, 11]});
    assert.strictEqual(dataset.arcs, arcs);
    assert.equal(arcs.size(), 4);
    assert.deepEqual(dataset.layers[0].shapes, [[[0]], [[3]], [[2]]]);
  });

  it('does not change the target layer object', function () {
    var dataset = getLineDataset(3);
    var lyr = dataset.layers[0];
    var shapes = lyr.shapes;
    updateLine(dataset, {ids: [1], coordinates: [10, 10, 11, 11]});
    assert.notStrictEqual(dataset.layers[0], lyr);
    assert.strictEqual(lyr.shapes, shapes);
    assert.deepEqual(lyr.shapes[1], [[1]]);
  });

  it('records an arc append and no copy of the arcs', function () {
    var dataset = getLineDataset(20);
    var tx = new internal.UndoTransaction('test');
    var types;
    tx.run(function() {
      updateLine(dataset, {ids: [3], coordinates: [50, 50, 60, 60, 70, 50]});
    });
    types = tx.getCapturedUnits().map(function(unit) { return unit.type; });
    assert(types.includes('arcs-append'));
    assert(!types.includes('arcs'));
  });

  it('undo restores the arcs and the layer exactly', function () {
    var dataset = getLineDataset(5);
    var before = datasetState(dataset);
    var tx = new internal.UndoTransaction('test');
    tx.run(function() {
      updateLine(dataset, {ids: [2], coordinates: [50, 50, 60, 60, 70, 50]});
    });
    internal.restoreCapturedUnits(internal.filterUnchangedRestoreUnits(tx.getCapturedUnits()));
    assert.equal(datasetState(dataset), before);
  });

  it('output leaves out the replaced path', async function () {
    var cmd = '-i in.json -update-line ids=0 coordinates=5,5,6,6 ' +
      '-update-line ids=0 coordinates=7,7,8,9';
    var input = {type: 'LineString', coordinates: [[0, 0], [1, 1]]};
    var out = await api.applyCommands(cmd + ' -o out.json format=topojson', {'in.json': input});
    var topology = JSON.parse(out['out.json']);
    assert.equal(topology.arcs.length, 1);
    out = await api.applyCommands(cmd + ' -o out.json', {'in.json': input});
    assert.deepEqual(JSON.parse(out['out.json']).geometries[0].coordinates, [[7, 7], [8, 9]]);
  });

  it('a point layer is rejected', async function () {
    await assert.rejects(function() {
      return api.applyCommands('-i in.json -update-line ids=0 coordinates=0,0,1,1 -o out.json',
        {'in.json': {type: 'Point', coordinates: [0, 0]}});
    }, /requires a polyline target layer/);
  });

  it('a missing feature is rejected', async function () {
    await assert.rejects(function() {
      return api.applyCommands('-i in.json -update-line ids=4 coordinates=0,0,1,1 -o out.json',
        {'in.json': {type: 'LineString', coordinates: [[0, 0], [1, 1]]}});
    }, /has no feature with id 4/);
  });

  it('an id is required', async function () {
    await assert.rejects(function() {
      return api.applyCommands('-i in.json -update-line coordinates=0,0,1,1 -o out.json',
        {'in.json': {type: 'LineString', coordinates: [[0, 0], [1, 1]]}});
    }, /Missing required ids parameter/);
  });
});
