import assert from 'assert';
import api from '../mapshaper.js';

var I = api.internal;

async function run(cmd) {
  var job = new I.Job();
  await I.runParsedCommands(I.parseCommands(cmd), job);
  return job.catalog;
}

function layerNames(catalog) {
  return catalog.getLayers().map(function(o) { return o.layer.name; });
}

describe('mapshaper-copy.mjs', function() {

  it('copies a polygon layer, keeping its name', async function() {
    var catalog = await run('-rectangle bbox=0,0,10,10 name=box -each "n=1" -copy');
    var layers = catalog.getLayers();
    assert.deepEqual(layerNames(catalog), ['box', 'box']);
    assert.equal(layers[0].dataset, layers[1].dataset);
    assert.notEqual(layers[0].layer.shapes, layers[1].layer.shapes);
    assert.deepEqual(layers[1].layer.data.getRecords(), [{n: 1}]);
    assert.notEqual(layers[0].layer.data, layers[1].layer.data);
  });

  it('the copy becomes the default target', async function() {
    var catalog = await run('-rectangle bbox=0,0,10,10 name=box -copy name=box2');
    var target = catalog.getDefaultTargets()[0];
    assert.deepEqual(target.layers.map(function(lyr) { return lyr.name; }), ['box2']);
  });

  it('editing the copy leaves the original unchanged', async function() {
    var catalog = await run('-rectangle bbox=0,0,10,10 name=a -each "n=1" ' +
      '-copy name=b -each "n=2"');
    var a = catalog.findLayers('a')[0].layer;
    assert.deepEqual(a.data.getRecords(), [{n: 1}]);
  });

  it('copies a raster layer', async function() {
    var catalog = await run('-i test/data/geotiff/wgs84-geographic-epsg4326.tif -copy name=copy');
    var layers = catalog.getLayers();
    assert.equal(layers.length, 2);
    assert(I.layerHasRaster(layers[1].layer));
    assert.equal(layers[1].layer.name, 'copy');
    assert.notEqual(layers[0].layer.raster, layers[1].layer.raster);
  });

  it('copies a data-only layer', async function() {
    var catalog = await run('-i test/data/text/states.csv -copy name=states2');
    var layers = catalog.getLayers();
    assert.deepEqual(layerNames(catalog), ['states', 'states2']);
    assert.equal(layers[1].layer.data.size(), layers[0].layer.data.size());
  });

  it('copies several target layers', async function() {
    var catalog = await run('-rectangle bbox=0,0,1,1 name=a -rectangle bbox=0,0,2,2 name=b ' +
      '-copy target=a,b');
    assert.deepEqual(layerNames(catalog).sort(), ['a', 'a', 'b', 'b']);
  });

  it('name= requires a single target layer', async function() {
    await assert.rejects(run('-rectangle bbox=0,0,1,1 name=a -rectangle bbox=0,0,2,2 name=b ' +
      '-copy target=a,b name=c'), /single layer/);
  });

  it('copies a frame with its members', async function() {
    var catalog = await run('-rectangle bbox=0,0,10,10 name=r -frame target=r width=400 name=f1 ' +
      '-copy target=f1 name=f2');
    var f2 = I.getFrameByName(catalog, 'f2');
    assert(I.getFrameByName(catalog, 'f1'));
    assert(f2);
    assert.deepEqual(I.getFrameStack(catalog, f2).map(function(o) { return o.layer.name; }), ['r']);
    assert.equal(catalog.getDefaultTargets()[0].layers[0], f2.layer);
  });

  it('a frame copy needs a name', async function() {
    await assert.rejects(run('-rectangle bbox=0,0,10,10 name=r -frame target=r width=400 name=f1 ' +
      '-copy target=f1'), /name=/);
  });
});
