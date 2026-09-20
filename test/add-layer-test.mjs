import api from '../mapshaper.js';
import assert from 'assert';

var polygonLayer = JSON.stringify({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {n: 'a'},
    geometry: {type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]}
  }]
});

// Runs commands and hands back the catalog, which is where an empty layer shows
// up: it has no features, so there is nothing for -o to export.
function runCommands(str, input) {
  return new Promise(function(resolve, reject) {
    var commands = api.internal.parseCommands(str);
    if (input) {
      commands.forEach(function(cmd) {
        if (cmd.name == 'i') cmd.options.input = input;
      });
    }
    api.internal.runParsedCommands(commands, null, function(err, job) {
      if (err) reject(err); else resolve(job.catalog);
    });
  });
}

describe('mapshaper-add-layer.mjs', function () {

  describe('layer creation', function () {
    it('creates an empty layer of the given type', async function () {
      var catalog = await runCommands('-add-layer geometry-type=point');
      var lyr = catalog.getActiveLayer().layer;
      assert.equal(lyr.geometry_type, 'point');
      assert.deepEqual(lyr.shapes, []);
      assert(!lyr.data);
    });

    it('names the layer when name= is given', async function () {
      var catalog = await runCommands('-add-layer geometry-type=point name=labels');
      assert.equal(catalog.getActiveLayer().layer.name, 'labels');
    });

    it('leaves the layer unnamed without name=', async function () {
      var catalog = await runCommands('-add-layer geometry-type=polygon');
      assert(!catalog.getActiveLayer().layer.name);
    });

    it('the new layer becomes the target', async function () {
      var catalog = await runCommands('-i in.json -add-layer geometry-type=point name=pts',
        {'in.json': polygonLayer});
      assert.equal(catalog.getActiveLayer().layer.name, 'pts');
    });
  });

  describe('arcs', function () {
    it('a path layer gets an empty ArcCollection to draw into', async function () {
      var polygons = await runCommands('-add-layer geometry-type=polygon');
      var lines = await runCommands('-add-layer geometry-type=polyline');
      assert.equal(polygons.getActiveLayer().dataset.arcs.size(), 0);
      assert.equal(lines.getActiveLayer().dataset.arcs.size(), 0);
    });

    it('a point layer gets no ArcCollection', async function () {
      var catalog = await runCommands('-add-layer geometry-type=point');
      assert(!catalog.getActiveLayer().dataset.arcs);
    });
  });

  describe('relationship to the target', function () {
    // Shapes drawn into the new layer get their own topology, so editing them
    // cannot disturb the arcs of the layer it was created beside.
    it('the layer goes into a dataset of its own', async function () {
      var catalog = await runCommands('-i in.json -add-layer geometry-type=polygon name=drawn',
        {'in.json': polygonLayer});
      var datasets = catalog.getDatasets();
      assert.equal(datasets.length, 2);
      assert.equal(datasets[0].layers.length, 1);
      assert.equal(datasets[1].layers.length, 1);
      assert.equal(datasets[1].layers[0].name, 'drawn');
      assert.notStrictEqual(datasets[0].arcs, datasets[1].arcs);
    });

    it("inherits the target's CRS", async function () {
      var catalog = await runCommands('-i in.json -proj webmercator ' +
        '-add-layer geometry-type=point name=pts', {'in.json': polygonLayer});
      var P = api.internal.getDatasetCRS(catalog.getActiveLayer().dataset);
      assert.equal(api.internal.isLatLngCRS(P), false);
      assert(api.internal.crsAreEqual(P,
        api.internal.parseCrsString('webmercator')));
    });

    it('accepts an empty target', async function () {
      var catalog = await runCommands('-add-layer geometry-type=point');
      assert.equal(catalog.getLayers().length, 1);
    });

    it('takes the CRS of a named target rather than the current one',
      async function () {
        var catalog = await runCommands('-i in.json name=a -proj webmercator ' +
          '-i in.json name=b -add-layer geometry-type=point target=a',
          {'in.json': polygonLayer});
        var P = api.internal.getDatasetCRS(catalog.getActiveLayer().dataset);
        assert.equal(api.internal.isLatLngCRS(P), false);
      });
  });

  describe('option validation', function () {
    it('geometry-type is required', async function () {
      await assert.rejects(runCommands('-add-layer name=x'),
        /Missing required geometry-type/);
    });

    it('rejects an unsupported geometry type', async function () {
      await assert.rejects(runCommands('-add-layer geometry-type=line'),
        /Unsupported geometry type/);
    });
  });
});
