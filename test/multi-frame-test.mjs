import assert from 'assert';
import api from '../mapshaper.js';

var I = api.internal;

async function run(cmd) {
  var job = new I.Job();
  await I.runParsedCommands(I.parseCommands(cmd), job);
  return job.catalog;
}

function findLayer(catalog, name) {
  return catalog.getLayers().find(function(o) { return o.layer.name == name; });
}

function frameOf(catalog, layerName) {
  var frame = I.getFrameForDataset(catalog, findLayer(catalog, layerName).dataset);
  return frame ? frame.layer.name : null;
}

// names of a frame's members, bottom to top
function stackOf(catalog, frameName) {
  return I.getFrameStack(catalog, I.getFrameByName(catalog, frameName)).map(function(o) {
    return o.layer.name;
  });
}

function svgGroups(svg) {
  return (String(svg).match(/<g id="[^"]+"/g) || []).map(function(str) {
    return str.slice(7, -1);
  });
}

var boxes = '-rectangle bbox=0,0,10,10 name=a -rectangle bbox=2,2,8,8 name=b ' +
  '-rectangle bbox=3,3,4,4 name=c ';

describe('multiple map frames', function() {

  describe('-frame (making a frame)', function() {
    it('target layers become members of the new frame', async function() {
      var catalog = await run(boxes + '-frame target=a,b width=200 name=f1');
      assert.equal(frameOf(catalog, 'a'), 'f1');
      assert.equal(frameOf(catalog, 'b'), 'f1');
      assert.equal(frameOf(catalog, 'c'), null);
    });

    it('layers are not members when bbox= is given without target=', async function() {
      var catalog = await run(boxes + '-frame bbox=0,0,10,10 width=200 name=f1');
      assert.equal(frameOf(catalog, 'c'), null);
    });

    it('frames are named frame, frame2, ...', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 -frame target=c width=100');
      assert.deepEqual(I.getFrames(catalog).map(function(o) { return o.layer.name; }),
        ['frame', 'frame2']);
    });

    // xy: projected coordinates without a CRS; ll: lat-long with CRS metadata
    var xyAndLatLong = '-rectangle bbox=0,0,2000000,1000000 name=xy ' +
      '-rectangle bbox=-100,30,-90,40 name=ll -proj init=wgs84 target=ll ';

    it('rejects projected layers without a CRS framed with lat-long layers', async function() {
      await assert.rejects(run(xyAndLatLong + '-frame target=ll,xy width=200'),
        /different coordinate systems/);
    });

    it('rejects adding lat-long layers to a frame of projected layers without a CRS',
        async function() {
      await assert.rejects(run(xyAndLatLong + '-frame target=xy width=200 name=f1 ' +
        '-frame target=f1 add-layers=ll'), /different coordinate systems/);
    });

    it('still frames layers whose coordinate systems are both guessed', async function() {
      var catalog = await run('-rectangle bbox=0,0,2000000,1000000 name=xy ' +
        '-rectangle bbox=0,0,1,1 name=small -frame target=xy,small width=200 name=f1');
      assert.equal(frameOf(catalog, 'small'), 'f1');
    });

    it('rejects a name that is in use', async function() {
      await assert.rejects(run(boxes + '-frame target=a name=f1 -frame target=c name=f1'),
        /A map frame named f1 already exists/);
    });

    it('a frame becomes the current target', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1');
      assert.equal(catalog.getActiveLayer().layer.name, 'f1');
    });

    it('a layer split off from its dataset keeps the dataset id', async function() {
      var catalog = await run('-rectangle bbox=0,0,10,10 name=a -dissolve + name=b ' +
        '-frame target=b width=100 name=f1');
      var a = findLayer(catalog, 'a');
      var b = findLayer(catalog, 'b');
      assert.notEqual(a.dataset, b.dataset);
      assert.equal(a.dataset.id, b.dataset.id);
    });

    it('a layer that leaves the frame rejoins its dataset', async function() {
      var catalog = await run('-rectangle bbox=0,0,10,10 name=a -dissolve + name=b ' +
        '-frame target=b width=100 name=f1 -frame target=f1 remove-layers=b');
      assert.equal(findLayer(catalog, 'a').dataset, findLayer(catalog, 'b').dataset);
    });

    it('replace swaps in a new frame and keeps its members', async function() {
      var catalog = await run(boxes + '-frame target=a,b width=200 name=f1 ' +
        '-frame target=f1 replace bbox=0,0,5,5 width=300');
      assert.equal(I.getFrames(catalog).length, 1);
      assert.equal(frameOf(catalog, 'a'), 'f1');
      assert.equal(I.getFrameLayerData(I.getFrameByName(catalog, 'f1').layer,
        I.getFrameByName(catalog, 'f1').dataset.arcs).width, 300);
    });
  });

  describe('-frame (changing a frame)', function() {
    it('add-layers= and remove-layers=', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1 ' +
        '-frame target=f1 add-layers=b,c -frame target=f1 remove-layers=b');
      assert.deepEqual(stackOf(catalog, 'f1'), ['a', 'c']);
      assert.equal(frameOf(catalog, 'b'), null);
    });

    it('add-layers= puts layers on top unless a position is given', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1 ' +
        '-frame target=f1 add-layers=b -frame target=f1 add-layers=c below=a');
      assert.deepEqual(stackOf(catalog, 'f1'), ['c', 'a', 'b']);
    });

    it('above= and bottom', async function() {
      var catalog = await run(boxes + '-frame target=a,b width=200 name=f1 ' +
        '-frame target=f1 add-layers=c above=a');
      assert.deepEqual(stackOf(catalog, 'f1'), ['a', 'c', 'b']);
      catalog = await run(boxes + '-frame target=a,b width=200 name=f1 ' +
        '-frame target=f1 add-layers=c bottom');
      assert.deepEqual(stackOf(catalog, 'f1'), ['c', 'a', 'b']);
    });

    it('add-layers= stacks the added layers in list order', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1 ' +
        '-frame target=f1 add-layers=c,b');
      assert.deepEqual(stackOf(catalog, 'f1'), ['a', 'c', 'b']);
    });

    it('add-layers= rejects layers that are already in the frame', async function() {
      await assert.rejects(run(boxes + '-frame target=a,b width=200 name=f1 ' +
        '-frame target=f1 add-layers=b'), /already in frame f1. Use order-layers=/);
    });

    it('add-layers= skips a member with the same name as a layer outside', async function() {
      var catalog = await run('-rectangle bbox=0,0,10,10 name=roads ' +
        '-rectangle bbox=1,1,2,2 name=roads -frame target=1 width=200 name=f1 ' +
        '-frame target=f1 add-layers=roads');
      assert.equal(I.getFrameMembers(catalog, I.getFrameByName(catalog, 'f1')).length, 2);
    });

    it('order-layers= moves a layer within the frame', async function() {
      var catalog = await run(boxes + '-frame target=a,b,c width=200 name=f1 ' +
        '-frame target=f1 order-layers=c bottom');
      assert.deepEqual(stackOf(catalog, 'f1'), ['c', 'a', 'b']);
    });

    it('order-layers= stacks layers in list order, first at the bottom', async function() {
      var catalog = await run(boxes + '-frame target=a,b,c width=200 name=f1 ' +
        '-frame target=f1 order-layers=c,a,b bottom');
      assert.deepEqual(stackOf(catalog, 'f1'), ['c', 'a', 'b']);
      catalog = await run(boxes + '-frame target=a,b,c width=200 name=f1 ' +
        '-frame target=f1 order-layers=c,b above=a');
      assert.deepEqual(stackOf(catalog, 'f1'), ['a', 'c', 'b']);
    });

    it('order-layers= without a position restacks the layers in place', async function() {
      var catalog = await run(boxes + '-frame target=a,b,c width=200 name=f1 ' +
        '-frame target=f1 order-layers=c,b');
      assert.deepEqual(stackOf(catalog, 'f1'), ['a', 'c', 'b']);
      catalog = await run(boxes + '-frame target=a,b,c width=200 name=f1 ' +
        '-frame target=f1 order-layers=c,a');
      assert.deepEqual(stackOf(catalog, 'f1'), ['c', 'a', 'b']);
      catalog = await run(boxes + '-frame target=a,b,c width=200 name=f1 ' +
        '-frame target=f1 order-layers=b,c,a');
      assert.deepEqual(stackOf(catalog, 'f1'), ['b', 'c', 'a']);
    });

    it('order-layers= matches names only among the members', async function() {
      var catalog = await run('-rectangle bbox=0,0,10,10 name=roads ' +
        '-rectangle bbox=1,1,2,2 name=water -rectangle bbox=1,1,2,2 name=roads ' +
        '-frame target=1,2 width=200 name=f1 -frame target=f1 order-layers=roads top');
      assert.deepEqual(stackOf(catalog, 'f1'), ['water', 'roads']);
      assert.equal(I.getFrameMembers(catalog, I.getFrameByName(catalog, 'f1')).length, 2);
    });

    it('order-layers= rejects layers that are not in the frame', async function() {
      await assert.rejects(run(boxes + '-frame target=a,b width=200 name=f1 ' +
        '-frame target=f1 order-layers=c'), /Frame f1 has no layer matching c/);
    });

    it('layers matched by a wildcard keep their order in the stack', async function() {
      var catalog = await run(boxes + '-frame target=a,b,c width=200 name=f1 ' +
        '-frame target=f1 order-layers=c,b,a -frame target=f1 order-layers=* top');
      assert.deepEqual(stackOf(catalog, 'f1'), ['c', 'b', 'a']);
      catalog = await run(boxes + '-frame target=a,b,c width=200 name=f1 ' +
        '-frame target=f1 order-layers=c,b,a -frame target=f1 order-layers=a,f1:* bottom');
      assert.deepEqual(stackOf(catalog, 'f1'), ['a', 'c', 'b']);
    });

    it('rejects an anchor that is one of the layers being moved', async function() {
      await assert.rejects(run(boxes + '-frame target=a,b,c width=200 name=f1 ' +
        '-frame target=f1 order-layers=a,b above=a'), /names a layer that is being moved/);
    });

    it('rejects add-layers= with order-layers=', async function() {
      await assert.rejects(run(boxes + '-frame target=a,b width=200 name=f1 ' +
        '-frame target=f1 add-layers=c order-layers=a'), /cannot be used together/);
    });

    it('rejects reproject without add-layers=', async function() {
      await assert.rejects(run(boxes + '-frame target=a,b width=200 name=f1 ' +
        '-frame target=f1 order-layers=a reproject'), /reproject is used with add-layers=/);
    });

    it('hide-layers= matches names only among the members', async function() {
      var catalog = await run('-rectangle bbox=0,0,10,10 name=roads ' +
        '-rectangle bbox=1,1,2,2 name=roads -frame target=1 width=200 name=f1 ' +
        '-frame target=f1 hide-layers=roads');
      var hidden = catalog.getLayers().filter(function(o) { return o.layer.frame_hidden; });
      assert.equal(hidden.length, 1);
      assert.equal(I.getFrameForDataset(catalog, hidden[0].dataset).layer.name, 'f1');
    });

    it('add-layers= moves layers from another frame', async function() {
      var catalog = await run(boxes + '-frame target=a,b width=200 name=f1 ' +
        '-frame target=c width=100 name=f2 -frame target=f2 add-layers=b');
      assert.equal(frameOf(catalog, 'b'), 'f2');
      assert.deepEqual(stackOf(catalog, 'f1'), ['a']);
    });

    it('rejects an anchor layer that is not in the frame', async function() {
      await assert.rejects(run(boxes + '-frame target=a width=200 name=f1 ' +
        '-frame target=f1 add-layers=b above=c'), /not in frame|not a member|c/);
    });

    it('rejects a position without add-layers=', async function() {
      await assert.rejects(run(boxes + '-frame target=a width=200 name=f1 -frame target=f1 top'));
    });

    it('rejects remove-layers= for a layer that is not in the frame', async function() {
      await assert.rejects(run(boxes + '-frame target=a width=200 name=f1 ' +
        '-frame target=f1 remove-layers=c'));
    });

    it('hide-layers= and show-layers=', async function() {
      var catalog = await run(boxes + '-frame target=a,b width=200 name=f1 ' +
        '-frame target=f1 hide-layers=a,b -frame target=f1 show-layers=b');
      assert.equal(findLayer(catalog, 'a').layer.frame_hidden, true);
      assert.equal(!!findLayer(catalog, 'b').layer.frame_hidden, false);
    });

    it('a layer that leaves a frame is no longer hidden', async function() {
      var catalog = await run(boxes + '-frame target=a,b width=200 name=f1 ' +
        '-frame target=f1 hide-layers=a -frame target=f1 remove-layers=a');
      assert.equal(!!findLayer(catalog, 'a').layer.frame_hidden, false);
    });

    it('name= renames a frame', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1 -frame target=f1 name=main');
      assert.equal(frameOf(catalog, 'a'), 'main');
    });

    it('+ copies a frame and its members', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1 ' +
        '-frame target=f1 + name=f2 width=400');
      var f1 = I.getFrameByName(catalog, 'f1');
      var f2 = I.getFrameByName(catalog, 'f2');
      assert.equal(I.getFrameLayerData(f1.layer, f1.dataset.arcs).width, 200);
      assert.equal(I.getFrameLayerData(f2.layer, f2.dataset.arcs).width, 400);
      assert.deepEqual(stackOf(catalog, 'f2'), ['a']);
      assert.deepEqual(stackOf(catalog, 'f1'), ['a']);
    });

    it('+ requires name=', async function() {
      await assert.rejects(run(boxes + '-frame target=a width=200 name=f1 -frame target=f1 +'));
    });

    it('remove turns the frame into an ordinary layer and frees its members', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1 -frame target=f1 remove');
      assert.equal(I.getFrames(catalog).length, 0);
      assert.equal(frameOf(catalog, 'a'), null);
    });

    it('rejects options for changing a frame when making one', async function() {
      await assert.rejects(run(boxes + '-frame target=a add-layers=b'));
    });

    it('rejects a mix of frames and other layers as targets', async function() {
      await assert.rejects(run(boxes + '-frame target=a width=200 name=f1 -frame target=f1,c width=100'));
    });
  });

  describe('qualified layer names', function() {
    var twoFrames = boxes + '-frame target=a,b width=200 name=f1 -frame target=f1 + name=f2 ';

    it('frame:layer selects a layer in a frame', async function() {
      var catalog = await run(twoFrames);
      var found = catalog.findLayers('f2:b');
      assert.equal(found.length, 1);
      assert.equal(I.getFrameForDataset(catalog, found[0].dataset).layer.name, 'f2');
    });

    it('frame:index counts the frame members from 1', async function() {
      var catalog = await run(twoFrames);
      var found = catalog.findLayers('f2:1');
      assert.equal(found.length, 1);
      assert.equal(I.getFrameForDataset(catalog, found[0].dataset).layer.name, 'f2');
    });

    it('a name with a colon that is not a frame name is a layer name', async function() {
      var catalog = await run('-rectangle bbox=0,0,1,1 name=x:y');
      assert.equal(catalog.findLayers('x:y')[0].layer.name, 'x:y');
    });

    it('getLayerTargetId() qualifies names that are used in several frames', async function() {
      var catalog = await run(twoFrames);
      var lyr = catalog.findLayers('f2:b')[0].layer;
      assert.equal(I.getLayerTargetId(catalog, lyr), 'f2:b');
      assert.equal(I.getLayerTargetId(catalog, findLayer(catalog, 'c').layer), 'c');
    });

    it('commands accept qualified targets', async function() {
      var catalog = await run(twoFrames + '-each target=f2:b "copy=1"');
      var layer = catalog.findLayers('f2:b')[0].layer;
      assert.equal(layer.data.getRecords()[0].copy, 1);
      assert.equal(catalog.findLayers('f1:b')[0].layer.data.getRecords()[0].copy, undefined);
    });
  });

  describe('-o with frames', function() {
    var oneFrame = boxes + '-frame target=a,b width=200 name=f1 ';
    var twoFrames = oneFrame + '-frame target=c width=100 name=f2 ';

    it('a frame target draws the frame\'s members', async function() {
      var out = await api.applyCommands(oneFrame + '-o out.svg');
      assert.deepEqual(svgGroups(out['out.svg']), ['a', 'b']);
    });

    it('leaves out hidden members', async function() {
      var out = await api.applyCommands(oneFrame + '-frame hide-layers=b -o out.svg');
      assert.deepEqual(svgGroups(out['out.svg']), ['a']);
    });

    it('members are drawn in stacking order', async function() {
      var out = await api.applyCommands(oneFrame + '-frame order-layers=a top -o out.svg');
      assert.deepEqual(svgGroups(out['out.svg']), ['b', 'a']);
    });

    it('a member is drawn alone on its frame\'s page', async function() {
      var out = await api.applyCommands(oneFrame + '-o target=b out.svg');
      var svg = String(out['out.svg']);
      assert.deepEqual(svgGroups(svg), ['b']);
      assert(svg.includes('width="200"'));
    });

    it('layers in no frame are drawn in the only frame', async function() {
      var out = await api.applyCommands(oneFrame + '-o target=f1,c out.svg');
      assert.deepEqual(svgGroups(out['out.svg']), ['a', 'b', 'c']);
    });

    it('writes one file per frame, named after the frame', async function() {
      var out = await api.applyCommands(twoFrames + '-o target=f1,f2 map.svg');
      assert.deepEqual(Object.keys(out).sort(), ['map-f1.svg', 'map-f2.svg']);
      assert.deepEqual(svgGroups(out['map-f1.svg']), ['a', 'b']);
      assert.deepEqual(svgGroups(out['map-f2.svg']), ['c']);
      out = await api.applyCommands(twoFrames + '-o target=f1,f2 format=svg');
      assert.deepEqual(Object.keys(out).sort(), ['f1.svg', 'f2.svg']);
    });

    it('a data format exports the frame layer', async function() {
      var out = await api.applyCommands(oneFrame + '-o target=f1 out.json');
      var json = JSON.parse(out['out.json']);
      assert.equal(json.features.length, 1);
      assert.equal(json.features[0].properties.type, 'frame');
    });

    it('output without frames is unchanged', async function() {
      var out = await api.applyCommands(boxes + '-o target=* out.svg');
      assert.deepEqual(svgGroups(out['out.svg']), ['a', 'b', 'c']);
    });
  });

  describe('-merge-layers and -union', function() {
    it('untargeted layers in the same dataset stay where they are', async function() {
      var catalog = await run('-rectangle bbox=0,0,10,10 name=a -dissolve + name=a2 ' +
        '-rectangle bbox=2,2,8,8 name=b -frame target=b width=200 name=f1 ' +
        '-merge-layers target=a,b name=ab force');
      assert.equal(frameOf(catalog, 'ab'), 'f1');
      assert.equal(frameOf(catalog, 'a2'), null);
    });

    it('rejects layers from different frames', async function() {
      await assert.rejects(run(boxes + '-frame target=a width=200 name=f1 ' +
        '-frame target=b width=200 name=f2 -merge-layers target=a,b force'),
        /cannot combine layers from different map frames/);
    });

    it('the output keeps the ID of a member dataset', async function() {
      var job = new I.Job();
      var id;
      await I.runParsedCommands(I.parseCommands(boxes + '-frame target=a width=200 name=f1'), job);
      id = findLayer(job.catalog, 'a').dataset.id;
      await I.runParsedCommands(I.parseCommands('-merge-layers target=a,b name=ab force'), job);
      assert.equal(findLayer(job.catalog, 'ab').dataset.id, id);
      assert.equal(I.getFrameMembers(job.catalog, I.getFrameByName(job.catalog, 'f1')).length, 1);
    });

    it('-union output goes into the frame', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1 ' +
        '-union target=a,b + name=u');
      assert.equal(frameOf(catalog, 'u'), 'f1');
    });
  });

  describe('-proj', function() {
    it('targeting a member projects the whole frame', async function() {
      var catalog = await run(boxes + '-frame target=a,b width=200 name=f1 -proj target=a EPSG:3857');
      assert(I.getDatasetBounds(findLayer(catalog, 'b').dataset).xmax > 1000);
      assert(I.getDatasetBounds(I.getFrameByName(catalog, 'f1').dataset).xmax > 1000);
      assert(I.getDatasetBounds(findLayer(catalog, 'c').dataset).xmax < 100);
    });

    it('targeting a frame projects its members', async function() {
      var catalog = await run(boxes + '-frame target=a,b width=200 name=f1 -proj EPSG:3857');
      assert(I.getDatasetBounds(findLayer(catalog, 'a').dataset).xmax > 1000);
      assert(I.getDatasetBounds(findLayer(catalog, 'c').dataset).xmax < 100);
    });

    it('an unframed target leaves a frame with members alone', async function() {
      var catalog = await run(boxes + '-frame target=a,b width=200 name=f1 -proj target=c EPSG:3857');
      assert(I.getDatasetBounds(findLayer(catalog, 'a').dataset).xmax < 100);
      assert(I.getDatasetBounds(I.getFrameByName(catalog, 'f1').dataset).xmax < 100);
    });
  });

  describe('projections', function() {
    // (-rectangle takes the coordinate system of the current target)
    var mixed = '-rectangle bbox=0,0,1,1 name=b -rectangle bbox=0,0,10,10 name=a ' +
      '-proj target=a EPSG:3857 -frame target=a width=200 name=f1 ';

    it('rejects adding lat-long layers to a projected frame', async function() {
      await assert.rejects(run(mixed + '-frame target=f1 add-layers=b'),
        /different coordinate systems/);
    });

    it('rejects adding layers in a different projection', async function() {
      await assert.rejects(run('-rectangle bbox=0,0,10,10 name=a -proj EPSG:3857 ' +
        '-rectangle bbox=0,0,10,10 name=b -proj +proj=robin target=b ' +
        '-frame target=a width=200 name=f1 -frame target=f1 add-layers=b'),
        /different coordinate systems/);
    });

    it('rejects an overlay source in a different projection', async function() {
      await assert.rejects(run('-rectangle bbox=0,0,10,10 name=a -proj EPSG:3857 ' +
        '-rectangle bbox=0,0,5,5 name=b -proj +proj=robin target=b ' +
        '-clip target=a b'),
        /different projections/);
    });

    it('accepts an overlay source in the same projection', async function() {
      var catalog = await run('-rectangle bbox=0,0,10,10 name=a -proj EPSG:3857 ' +
        '-rectangle bbox=0,0,5,5 name=b -proj EPSG:3857 target=b -clip target=a b');
      assert(findLayer(catalog, 'a'));
    });

    it('reproject projects layers to the frame\'s coordinate system', async function() {
      var catalog = await run(mixed + '-frame target=f1 add-layers=b reproject');
      var b = findLayer(catalog, 'b');
      assert.equal(frameOf(catalog, 'b'), 'f1');
      assert(I.getDatasetBounds(b.dataset).xmax > 1000);
    });

    it('the error names only the layers being moved, and suggests the reproject flag',
        async function() {
      var setup = '-rectangle bbox=0,0,1,1 name=b -filter true + name=b2 target=b ' +
        '-rectangle bbox=0,0,10,10 name=a -proj target=a EPSG:3857 ' +
        '-frame target=a width=200 name=f1 ';
      await assert.rejects(run(setup + '-frame target=f1 add-layers=b'), function(e) {
        assert.match(e.message, /(^|\] )b and frame f1 have different coordinate systems/);
        assert.match(e.message, /reproject flag to -frame to reproject the layer into the frame/);
        return true;
      });
    });

    it('findLayersNeedingReprojection() lists layers whose coordinate system differs',
        async function() {
      var catalog = await run(mixed + '-rectangle bbox=0,0,20,20 name=c target=a');
      var frame = I.getFrameByName(catalog, 'f1');
      var b = findLayer(catalog, 'b'), c = findLayer(catalog, 'c');
      var result = I.findLayersNeedingReprojection(catalog, [b, c], frame);
      assert.deepEqual(result.layers.map(function(lyr) { return lyr.name; }), ['b']);
      assert.equal(result.reprojectable, true);
      result = I.findLayersNeedingReprojection(catalog, [c], frame);
      assert.deepEqual(result, {layers: [], reprojectable: false});
    });

    it('findLayersNeedingReprojection() says when a frame\'s coordinate system is unknown',
        async function() {
      var catalog = await run('-rectangle bbox=0,0,2000000,1000000 name=xy ' +
        '-rectangle bbox=-100,30,-90,40 name=ll -proj init=wgs84 target=ll ' +
        '-frame target=xy width=200 name=f1');
      var result = I.findLayersNeedingReprojection(catalog, [findLayer(catalog, 'll')],
        I.getFrameByName(catalog, 'f1'));
      assert.deepEqual(result.layers.map(function(lyr) { return lyr.name; }), ['ll']);
      assert.equal(result.reprojectable, false);
    });
  });

  describe('-add-layer', function() {
    it('a layer added beside a member joins its frame', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1 ' +
        '-add-layer target=f1:a geometry-type=point name=pts');
      assert.equal(frameOf(catalog, 'pts'), 'f1');
    });

    it('a layer added beside an unframed layer is unframed', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1 ' +
        '-add-layer target=c geometry-type=point name=pts');
      assert.equal(frameOf(catalog, 'pts'), null);
    });
  });

  describe('getFrameMemberRef()', function() {
    function refOf(catalog, frameName, index) {
      var frame = I.getFrameByName(catalog, frameName);
      var o = I.getFrameMemberLayers(catalog, frame)[index];
      return I.getFrameMemberRef(catalog, frame, o.layer);
    }

    it('a member with a unique name is referred to by name', async function() {
      var catalog = await run(boxes + '-frame target=a,b width=200 name=f1');
      assert.equal(refOf(catalog, 'f1', 1), 'b');
    });

    it('members with the same name are referred to by number', async function() {
      var catalog = await run('-rectangle bbox=0,0,10,10 name=a -rectangle bbox=0,0,5,5 name=a ' +
        '-frame target=* width=200 name=f1');
      assert.equal(refOf(catalog, 'f1', 0), '1');
      assert.equal(refOf(catalog, 'f1', 1), '2');
    });

    it('a name that would be read as a number or a list is not used', async function() {
      var catalog = await run('-rectangle bbox=0,0,10,10 name=2 -frame target=1 width=200 name=f1');
      assert.equal(refOf(catalog, 'f1', 0), '1');
    });

    it('the reference works in hide-layers=', async function() {
      var catalog = await run('-rectangle bbox=0,0,10,10 name=a -rectangle bbox=0,0,5,5 name=a ' +
        '-frame target=* width=200 name=f1');
      var frame = I.getFrameByName(catalog, 'f1');
      var second = I.getFrameMemberLayers(catalog, frame)[1].layer;
      var job = new I.Job(catalog);
      await I.runParsedCommands(I.parseCommands('-frame target=f1 hide-layers=' +
        I.getFrameMemberRef(catalog, frame, second)), job);
      assert.equal(second.frame_hidden, true);
      assert(!I.getFrameMemberLayers(catalog, frame)[0].layer.frame_hidden);
    });
  });

  describe('getDisplayFrameForDataset() (the frame the web UI shows)', function() {
    function displayFrameOf(catalog, layerName) {
      var frame = I.getDisplayFrameForDataset(catalog, findLayer(catalog, layerName).dataset);
      return frame ? frame.layer.name : null;
    }

    it('a member is shown in its frame; an unframed layer in no frame', async function() {
      var catalog = await run(boxes + '-frame target=a width=200 name=f1');
      assert.equal(displayFrameOf(catalog, 'a'), 'f1');
      assert.equal(displayFrameOf(catalog, 'c'), null);
    });

    it('unframed layers are shown in a lone frame without members', async function() {
      var catalog = await run(boxes + '-frame bbox=0,0,10,10 width=200 name=f1');
      assert.equal(displayFrameOf(catalog, 'c'), 'f1');
    });

    it('...but not when there is another frame', async function() {
      var catalog = await run(boxes + '-frame bbox=0,0,10,10 width=200 name=f1 ' +
        '-frame target=a width=200 name=f2');
      assert.equal(displayFrameOf(catalog, 'c'), null);
      assert.equal(displayFrameOf(catalog, 'a'), 'f2');
    });
  });

  describe('overlay frames', function() {
    var frames = '-rectangle bbox=0,0,10,10 name=a -rectangle bbox=3,3,4,4 name=c ' +
      '-frame target=a width=200 name=main -frame target=c width=50 name=inset ';

    function placements(catalog, hostName) {
      var host = I.getFrameByName(catalog, hostName);
      return I.getHostOverlays(catalog, host).map(function(o) {
        return Object.assign({name: o.frame.layer.name}, o.record);
      });
    }

    function nestedSvgs(svg) {
      return (String(svg).match(/<svg id="[^>]+>/g) || []);
    }

    it('overlay= places a frame in a free corner, referring to it by ID', async function() {
      var catalog = await run(frames + '-frame target=main overlay=inset');
      var p = placements(catalog, 'main');
      assert.equal(p.length, 1);
      assert.equal(p[0].frame, I.getFrameByName(catalog, 'inset').dataset.id);
      assert.equal(p[0].position, 'bottom-right');
      assert.equal(p[0].margin_x, 10);
      assert.equal(p[0].margin_y, 10);
    });

    it('a second overlay takes the next free corner', async function() {
      var catalog = await run(frames + '-rectangle bbox=0,0,1,1 name=d ' +
        '-frame target=d width=40 name=inset2 ' +
        '-frame target=main overlay=inset -frame target=main overlay=inset2');
      assert.deepEqual(placements(catalog, 'main').map(function(o) { return o.position; }),
        ['bottom-right', 'bottom-left']);
    });

    it('same-sized overlays fill the page with zero margins', async function() {
      var catalog = await run(
        '-rectangle bbox=0,0,10,10 name=a -rectangle bbox=0,0,10,10 name=b ' +
        '-frame target=a width=200 name=host -frame target=b width=200 name=overlay ' +
        '-frame target=host overlay=overlay'
      );
      var host = I.getFrameByName(catalog, 'host');
      var overlay = I.getFrameByName(catalog, 'overlay');
      var p = placements(catalog, 'host')[0];
      assert.equal(p.position, 'top-left');
      assert.equal(p.margin_x, 0);
      assert.equal(p.margin_y, 0);
      assert.equal(I.framesHaveSamePageSize(host, overlay), true);
      assert.equal(I.frameCanContainOverlay(host, overlay), true);
      assert.deepEqual(I.getOverlayBox(p, I.getFramePageSize(host), I.getFramePageSize(overlay)),
        {x: 0, y: 0, width: 200, height: 200});
    });

    it('only frames at least as wide and tall can contain an overlay', async function() {
      var catalog = await run(
        '-rectangle bbox=0,0,1,1 name=a -rectangle bbox=0,0,1,1 name=b ' +
        '-rectangle bbox=0,0,2,1 name=c -rectangle bbox=0,0,1,2 name=d ' +
        '-frame target=a width=100 name=source -frame target=b width=100 name=same ' +
        '-frame target=c width=120 name=too-short -frame target=d width=60 name=too-narrow'
      );
      var source = I.getFrameByName(catalog, 'source');
      assert.equal(I.frameCanContainOverlay(I.getFrameByName(catalog, 'same'), source), true);
      assert.equal(I.frameCanContainOverlay(I.getFrameByName(catalog, 'too-short'), source), false);
      assert.equal(I.frameCanContainOverlay(I.getFrameByName(catalog, 'too-narrow'), source), false);
      assert.equal(I.framesHaveSamePageSize(I.getFrameByName(catalog, 'same'), source), true);
      assert.equal(I.framesHaveSamePageSize(I.getFrameByName(catalog, 'too-short'), source), false);
    });

    it('overlay= on an overlay updates its placement, keeping other settings', async function() {
      var catalog = await run(frames + '-frame target=main overlay=inset overlay-margin=5,8 ' +
        '-frame target=main overlay=inset overlay-position=top-left');
      var p = placements(catalog, 'main');
      assert.equal(p.length, 1);
      assert.equal(p[0].position, 'top-left');
      assert.equal(p[0].margin_x, 5);
      assert.equal(p[0].margin_y, 8);
    });

    it('margins may be negative and take units', async function() {
      var catalog = await run(frames + '-frame target=main overlay=inset overlay-margin=-4,1in');
      var p = placements(catalog, 'main')[0];
      assert.equal(p.margin_x, -4);
      assert.equal(p.margin_y, 72);
    });

    it('remove-overlay= removes a placement', async function() {
      var catalog = await run(frames + '-frame target=main overlay=inset ' +
        '-frame target=main remove-overlay=inset');
      assert.equal(placements(catalog, 'main').length, 0);
    });

    it('rejects bad overlay options', async function() {
      await assert.rejects(run(frames + '-frame target=main remove-overlay=inset'),
        /is not an overlay/);
      await assert.rejects(run(frames + '-frame target=main overlay=nope'), /Unknown frame/);
      await assert.rejects(run(frames + '-frame target=main overlay=main'), /on itself/);
      await assert.rejects(run(frames + '-frame target=main overlay-position=top-left'),
        /used with overlay=/);
      await assert.rejects(run(frames + '-frame target=main overlay=inset overlay-position=middle'),
        /Unsupported overlay-position/);
      await assert.rejects(run(frames + '-frame target=main overlay=inset ' +
        '-frame target=inset overlay=main'), /cannot contain each other/);
    });

    it('one frame can be overlaid on several hosts', async function() {
      var catalog = await run(frames + '-rectangle bbox=0,0,1,1 name=d ' +
        '-frame target=d width=100 name=main2 ' +
        '-frame target=main overlay=inset -frame target=main2 overlay=inset overlay-position=top-right');
      assert.equal(placements(catalog, 'main')[0].position, 'bottom-right');
      assert.equal(placements(catalog, 'main2')[0].position, 'top-right');
      assert.deepEqual(I.getOverlayHosts(catalog, I.getFrameByName(catalog, 'inset'))
        .map(function(o) { return o.layer.name; }), ['main', 'main2']);
    });

    it('renaming the overlay frame keeps its placements', async function() {
      var catalog = await run(frames + '-frame target=main overlay=inset ' +
        '-frame target=inset name=locator');
      assert.equal(placements(catalog, 'main')[0].name, 'locator');
    });

    it('deleting the overlay frame removes its placements', async function() {
      var catalog = await run(frames + '-frame target=main overlay=inset -drop target=inset');
      var host = I.getFrameByName(catalog, 'main');
      assert.equal(I.getFrameOverlayLayers(host.dataset).length, 0);
    });

    it('demoting the overlay frame removes its placements', async function() {
      var catalog = await run(frames + '-frame target=main overlay=inset -frame target=inset remove');
      var host = I.getFrameByName(catalog, 'main');
      assert.equal(I.getFrameOverlayLayers(host.dataset).length, 0);
    });

    it('a copy of the host keeps the overlay', async function() {
      var catalog = await run(frames + '-frame target=main overlay=inset ' +
        '-frame target=main + name=main2');
      assert.equal(placements(catalog, 'main2')[0].name, 'inset');
      assert.equal(placements(catalog, 'main')[0].name, 'inset');
    });

    it('replacing the overlay frame moves its placements to the new frame', async function() {
      var catalog = await run(frames + '-frame target=main overlay=inset ' +
        '-frame target=inset replace width=60');
      var p = placements(catalog, 'main');
      assert.equal(p.length, 1);
      assert.equal(p[0].name, 'inset');
    });

    it('SVG output draws the overlay in a nested <svg> at its placement', async function() {
      var out = await api.applyCommands(frames +
        '-frame target=main overlay=inset overlay-position=top-left overlay-margin=5,8 ' +
        '-o target=main out.svg');
      var svg = String(out['out.svg']);
      assert.deepEqual(nestedSvgs(svg),
        ['<svg id="inset" x="5" y="8" width="50" height="50" viewBox="0 0 50 50" overflow="hidden">']);
      assert.deepEqual(svgGroups(svg), ['a', 'inset-c']);
    });

    it('the overlay is placed from the far edges in a bottom-right corner', async function() {
      var out = await api.applyCommands(frames + '-frame target=main overlay=inset -o target=main out.svg');
      assert(nestedSvgs(out['out.svg'])[0].includes('x="140" y="140"'));
    });

    it('the overlay map has its own background and neatline, and leaves out hidden members',
        async function() {
      var out = await api.applyCommands(frames + '-rectangle bbox=3,3,4,4 name=e ' +
        '-frame target=inset hide-layers=e ' +
        '-style target=inset fill=#eee stroke=#333 ' +
        '-frame target=main overlay=inset -o target=main out.svg');
      var svg = String(out['out.svg']);
      var inner = svg.slice(svg.indexOf('<svg id="inset"'));
      assert(inner.includes('id="inset-inset-background"'));
      assert(inner.includes('id="inset-inset-neatline"'));
      assert(!inner.includes('inset-e'));
    });

    it('overlays are left out of data formats', async function() {
      var out = await api.applyCommands(frames + '-frame target=main overlay=inset ' +
        '-o target=main out.json');
      var json = JSON.parse(out['out.json']);
      assert.equal(json.features.length, 1);
    });

    it('getOverlayPlacementFromBox() anchors to the nearest corner', function() {
      var host = {width: 200, height: 100};
      assert.deepEqual(I.getOverlayPlacementFromBox({x: 150, y: 70, width: 40, height: 20}, host),
        {position: 'bottom-right', margin_x: 10, margin_y: 10});
      assert.deepEqual(I.getOverlayPlacementFromBox({x: -5, y: 3, width: 40, height: 20}, host),
        {position: 'top-left', margin_x: -5, margin_y: 3});
      assert.deepEqual(I.getOverlayPlacementFromBox(
        {x: 7.86, y: 10.17, width: 40, height: 20}, host
      ), {position: 'top-left', margin_x: 8, margin_y: 10});
      var box = I.getOverlayBox({position: 'bottom-right', margin_x: 10, margin_y: 10}, host,
        {width: 40, height: 20});
      assert.deepEqual(box, {x: 150, y: 70, width: 40, height: 20});
    });
  });
});
