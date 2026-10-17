import assert from 'assert';
import api from '../mapshaper.js';

var I = api.internal;
var {
  ArcCollection,
  buildTopology,
  forEachArcId,
  haveSameSimplification,
  mergeArcsKeepingThresholds,
  mergeDatasets,
  rejoinDatasets,
  splitApartLayers
} = I;

// A polygon layer and its dissolved outline, sharing the outer boundary,
// simplified to @pct
async function makeSimplifiedDataset(pct) {
  var job = new I.Job();
  await I.runParsedCommands(I.parseCommands(
    '-i test/data/geojson/two_states.json name=states ' +
    '-dissolve + name=outline ' +
    '-simplify ' + pct + ' planar'), job);
  return job.catalog.getDatasets()[0];
}

function getLayer(dataset, name) {
  return dataset.layers.find(function(lyr) { return lyr.name == name; });
}

function getArcIds(lyr) {
  var ids = new Set();
  forEachArcId(lyr.shapes, function(id) { ids.add(id < 0 ? ~id : id); });
  return ids;
}

function countSharedArcs(dataset) {
  var a = getArcIds(getLayer(dataset, 'states'));
  var b = getArcIds(getLayer(dataset, 'outline'));
  return Array.from(a).filter(function(id) { return b.has(id); }).length;
}

// Simplified geometry of a layer, with each ring rotated to a canonical start
function getLayerGeometry(dataset, name) {
  var lyr = getLayer(dataset, name);
  var arcs = dataset.arcs;
  return lyr.shapes.map(function(shape) {
    return (shape || []).map(function(path) {
      var coords = [];
      var iter = arcs.getShapeIter(path);
      while (iter.hasNext()) coords.push(iter.x + ',' + iter.y);
      return normalizeRing(coords);
    }).sort();
  });
}

function normalizeRing(coords) {
  var ring = coords.slice(0, -1); // drop the closing vertex
  var min = ring.reduce(function(memo, c, i) { return c < ring[memo] ? i : memo; }, 0);
  return ring.slice(min).concat(ring.slice(0, min)).join(' ');
}

// Threshold of each vertex, keyed by its coordinates
function getThresholdIndex(arcs) {
  var data = arcs.getVertexData();
  var index = {};
  for (var i = 0; i < data.xx.length; i++) {
    index[data.xx[i] + ',' + data.yy[i]] = data.zz[i];
  }
  return index;
}

describe('rejoining split datasets', function() {

  it('a plain merge and topology rebuild restore shared arcs but lose simplification', async function() {
    var dataset = await makeSimplifiedDataset('20%');
    var parts = splitApartLayers(dataset, [getLayer(dataset, 'outline')]);
    var merged = mergeDatasets(parts);
    assert.equal(countSharedArcs(merged), 0);
    buildTopology(merged);
    assert(countSharedArcs(merged) > 0);
    assert(merged.arcs.isFlat());
  });

  // Imported topology can split arcs at vertices where nothing branches; a
  // split and rejoin, like dissolveArcs(), leaves only the necessary arcs.
  it('rejoinDatasets() restores the original arcs, sharing and simplification', async function() {
    var original = await makeSimplifiedDataset('20%');
    var dataset = await makeSimplifiedDataset('20%');
    I.dissolveArcs(original);
    var arcCount = original.arcs.size();
    var sharedCount = countSharedArcs(original);
    var parts, rejoined;
    assert(sharedCount > 0);

    parts = splitApartLayers(dataset, [getLayer(dataset, 'outline')]);
    assert.equal(parts.length, 2);
    assert(haveSameSimplification(parts));
    rejoined = rejoinDatasets(parts);

    assert.equal(rejoined.arcs.size(), arcCount);
    assert.equal(countSharedArcs(rejoined), sharedCount);
    assert.equal(rejoined.arcs.getRetainedInterval(), original.arcs.getRetainedInterval());
    assert.deepEqual(getThresholdIndex(rejoined.arcs), getThresholdIndex(original.arcs));
    ['states', 'outline'].forEach(function(name) {
      assert.deepEqual(getLayerGeometry(rejoined, name), getLayerGeometry(original, name));
    });
  });

  it('the rejoined dataset can be re-simplified like the original', async function() {
    var original = await makeSimplifiedDataset('20%');
    var dataset = await makeSimplifiedDataset('20%');
    var rejoined = rejoinDatasets(splitApartLayers(dataset, [getLayer(dataset, 'outline')]));
    original.arcs.setRetainedPct(0.05);
    rejoined.arcs.setRetainedPct(0.05);
    ['states', 'outline'].forEach(function(name) {
      assert.deepEqual(getLayerGeometry(rejoined, name), getLayerGeometry(original, name));
    });
  });

  it('rejoinDatasets() keeps the shared ID of the parts', async function() {
    var dataset = await makeSimplifiedDataset('20%');
    var parts = splitApartLayers(dataset, [getLayer(dataset, 'outline')]);
    parts.forEach(function(d) { d.id = 'abc'; });
    assert.equal(rejoinDatasets(parts).id, 'abc');
  });

  it('works for unsimplified datasets', async function() {
    var job = new I.Job();
    await I.runParsedCommands(I.parseCommands(
      '-i test/data/geojson/two_states.json name=states -dissolve + name=outline'), job);
    var dataset = job.catalog.getDatasets()[0];
    I.dissolveArcs(dataset);
    var arcCount = dataset.arcs.size();
    var sharedCount = countSharedArcs(dataset);
    var rejoined = rejoinDatasets(splitApartLayers(dataset, [getLayer(dataset, 'outline')]));
    assert.equal(rejoined.arcs.size(), arcCount);
    assert.equal(countSharedArcs(rejoined), sharedCount);
    assert(rejoined.arcs.isFlat());
  });

  describe('haveSameSimplification()', function() {
    function datasetWithArcs(zz, interval) {
      var arcs = new ArcCollection([[[0, 0], [1, 1], [2, 0]]]);
      if (zz) arcs.setThresholds(zz).setRetainedInterval(interval);
      return {arcs: arcs, layers: [], info: {}};
    }

    it('compares threshold presence and retained interval', function() {
      var flat = datasetWithArcs(null);
      var a = datasetWithArcs([Infinity, 2, Infinity], 1);
      var b = datasetWithArcs([Infinity, 3, Infinity], 1);
      var c = datasetWithArcs([Infinity, 3, Infinity], 2);
      assert(haveSameSimplification([flat, datasetWithArcs(null)]));
      assert(haveSameSimplification([a, b]));
      assert(!haveSameSimplification([a, c]));
      assert(!haveSameSimplification([a, flat]));
    });

    it('ignores datasets without paths', function() {
      var a = datasetWithArcs([Infinity, 2, Infinity], 1);
      assert(haveSameSimplification([a, {arcs: null, layers: [], info: {}}]));
    });
  });

  describe('mergeArcsKeepingThresholds()', function() {
    it('concatenates thresholds and keeps the retained interval', function() {
      var a = new ArcCollection([[[0, 0], [1, 1], [2, 0]]]).setThresholds([Infinity, 2, Infinity]).setRetainedInterval(1);
      var b = new ArcCollection([[[5, 5], [6, 6]]]).setThresholds([Infinity, Infinity]).setRetainedInterval(1);
      var merged = mergeArcsKeepingThresholds([a, b]);
      assert.deepEqual(Array.from(merged.getVertexData().zz), [Infinity, 2, Infinity, Infinity, Infinity]);
      assert.equal(merged.getRetainedInterval(), 1);
      assert(!a.isFlat()); // sources are not flattened
    });

    it('gives unsimplified arcs infinite thresholds', function() {
      var a = new ArcCollection([[[0, 0], [1, 1], [2, 0]]]).setThresholds([Infinity, 2, Infinity]).setRetainedInterval(1);
      var b = new ArcCollection([[[5, 5], [6, 6], [7, 5]]]);
      var merged = mergeArcsKeepingThresholds([a, b]);
      assert.deepEqual(Array.from(merged.getVertexData().zz).slice(3), [Infinity, Infinity, Infinity]);
    });

    it('rejects different retained intervals', function() {
      var a = new ArcCollection([[[0, 0], [1, 1]]]).setThresholds([Infinity, Infinity]).setRetainedInterval(1);
      var b = new ArcCollection([[[5, 5], [6, 6]]]).setThresholds([Infinity, Infinity]).setRetainedInterval(2);
      assert.throws(function() {
        mergeArcsKeepingThresholds([a, b]);
      }, /different simplification intervals/);
    });
  });

  describe('buildTopology() with preserve_simplification', function() {
    it('gives vertices that become nodes an infinite threshold', function() {
      // two rings sharing the edge (1,0)-(1,1); vertex (1,1) is interior to
      // the first path, but becomes a node
      var arcs = new ArcCollection([
        [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]],
        [[1, 0], [1, 1], [2, 1], [2, 0], [1, 0]]
      ]);
      arcs.setThresholds([Infinity, 3, 2, 1, Infinity, Infinity, 4, 5, 6, Infinity]);
      arcs.setRetainedInterval(1.5);
      var dataset = {
        arcs: arcs,
        info: {},
        layers: [{geometry_type: 'polygon', shapes: [[[0]], [[1]]]}]
      };
      buildTopology(dataset, {preserve_simplification: true});
      var index = getThresholdIndex(dataset.arcs);
      assert.equal(index['1,1'], Infinity);
      assert.equal(index['1,0'], Infinity);
      assert.equal(index['0,1'], 3);
      assert.equal(index['2,1'], 5);
      assert.equal(dataset.arcs.getRetainedInterval(), 1.5);
    });

    it('drops thresholds by default, as before', function() {
      var arcs = new ArcCollection([[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]);
      arcs.setThresholds([Infinity, 3, 2, 1, Infinity]).setRetainedInterval(1.5);
      var dataset = {arcs: arcs, info: {}, layers: [{geometry_type: 'polygon', shapes: [[[0]]]}]};
      buildTopology(dataset);
      assert(dataset.arcs.isFlat());
    });
  });

  it('dissolveArcs() keeps rings that only collapse at the current simplification level', function() {
    var arcs = new ArcCollection([[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]);
    arcs.setThresholds([Infinity, 1, 1, 1, Infinity]).setRetainedInterval(2);
    var dataset = {arcs: arcs, info: {}, layers: [{geometry_type: 'polygon', shapes: [[[0]]]}]};
    assert(arcs.arcIsDegenerate(0)); // collapsed as displayed
    assert(!arcs.arcIsDegenerate(0, true));
    I.dissolveArcs(dataset);
    assert.deepEqual(dataset.layers[0].shapes, [[[0]]]);
    assert.equal(dataset.arcs.getPointCount(), 5);
  });

  it('deleting unused arcs keeps simplification thresholds', function() {
    var arcs = new ArcCollection([
      [[0, 0], [1, 1], [2, 0]],
      [[5, 5], [6, 6], [7, 5]]
    ]);
    arcs.setThresholds([Infinity, 2, Infinity, Infinity, 3, Infinity]).setRetainedInterval(1);
    arcs.deleteArcs(function(i) { return i == 1; });
    assert.equal(arcs.size(), 1);
    assert.deepEqual(Array.from(arcs.getVertexData().zz), [Infinity, 3, Infinity]);
    assert.equal(arcs.getRetainedInterval(), 1);
  });
});
