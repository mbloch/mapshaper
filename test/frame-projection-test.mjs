import assert from 'assert';
import api from '../mapshaper.js';
import { Bounds } from '../src/geom/mapshaper-bounds';
import { enhanceLayerForDisplay } from '../src/gui/gui-display-layer';
import { getDisplayProjectionTransform } from '../src/gui/gui-dynamic-crs';
import { getProjectedFrameBounds } from '../src/furniture/mapshaper-frame-projection';
import { captureLogCallsAsync } from './helpers';

describe('map frame projection', function() {
  var src = api.internal.parseCrsString('wgs84');
  var dest = api.internal.parseCrsString('robin');
  var project = api.internal.getProjTransform2(src, dest);
  var bbox = [-120, -70, 120, 70];

  it('samples curved edges when calculating projected bounds', function() {
    var bounds = getProjectedFrameBounds(bbox, project);
    var cornerBounds = new Bounds();
    [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[1]],
      [bbox[2], bbox[3]],
      [bbox[0], bbox[3]]
    ].forEach(function(p) {
      var p2 = project(p[0], p[1]);
      cornerBounds.mergePoint(p2[0], p2[1]);
    });
    var sideMidpoint = project(bbox[2], 0);

    assert(bounds.containsPoint(sideMidpoint[0], sideMidpoint[1]));
    assert(bounds.width() > cornerBounds.width());
  });

  it('rebuilds a frame safely in a dataset with other path layers', function() {
    var contentDataset = importRectangle([-20, -10, 20, 10], {});
    var frameDataset = importRectangle(bbox, {type: 'frame', width: 800, height: 467});
    var dataset = api.internal.mergeDatasets([contentDataset, frameDataset]);
    var contentLayer = dataset.layers[0];
    var frameLayer = dataset.layers[1];
    dataset.info.crs = src;

    api.internal.projectDataset(dataset, src, dest, {});

    assert.equal(dataset.layers[0], contentLayer);
    assert.equal(dataset.layers[1], frameLayer);
    assert.equal(api.internal.isFrameLayer(frameLayer, dataset.arcs), true);
    assert.equal(contentLayer.shapes.length, 1);
    var frame = api.internal.getFrameLayerData(frameLayer, dataset.arcs);
    var sideMidpoint = project(bbox[2], 0);
    assert(new Bounds(frame.bbox).containsPoint(sideMidpoint[0], sideMidpoint[1]));
  });

  it('uses a rectangular frame layer for dynamic display projection', function() {
    var dataset = importRectangle(bbox, {type: 'frame', width: 800, height: 467});
    var layer = dataset.layers[0];
    dataset.info.crs = src;

    enhanceLayerForDisplay(layer, dataset, {crs: dest});

    assert.equal(api.internal.isFrameLayer(layer, dataset.arcs), true);
    assert.equal(api.internal.isFrameLayer(layer.gui.displayLayer, layer.gui.displayArcs), true);
    assert.notEqual(layer.gui.displayArcs, dataset.arcs);
    var displayFrame = api.internal.getFrameLayerData(
      layer.gui.displayLayer,
      layer.gui.displayArcs
    );
    var displayProject = getDisplayProjectionTransform(src, dest);
    var sideMidpoint = displayProject(bbox[2], 0);
    assert(new Bounds(displayFrame.bbox).containsPoint(sideMidpoint[0], sideMidpoint[1]));
  });
});

// -frame always calls catalog.addDataset(), so a frame is normally alone in its
// own dataset -- which is the configuration -proj has to handle, and the one
// -proj's per-dataset targeting cannot reach on its own.
describe('map frame projection (frame in its own dataset)', function() {
  var content = JSON.stringify({
    type: 'Feature',
    properties: {n: 'a'},
    geometry: {
      type: 'Polygon',
      coordinates: [[[-120, 30], [-70, 30], [-70, 50], [-120, 50], [-120, 30]]]
    }
  });
  var point = JSON.stringify({
    type: 'Feature',
    properties: {n: 'b'},
    geometry: {type: 'Point', coordinates: [-95, 40]}
  });
  var files = {'a.json': content, 'b.json': point};

  async function getFrameCoords(cmd) {
    var out = await api.applyCommands(cmd + ' -o out.json target=frame', files);
    return JSON.parse(out['out.json']).features[0].geometry.coordinates[0];
  }

  it('projects the frame when only a data layer is targeted', async function() {
    var swept = await getFrameCoords(
      '-i a.json -frame width=600 target=a -target a -proj merc');
    var explicit = await getFrameCoords(
      '-i a.json -frame width=600 target=a -proj merc target=*');
    assert.deepEqual(swept, explicit);
    // no longer in degrees
    assert(Math.abs(swept[0][0]) > 1000);
  });

  async function getFrameRecord(cmd) {
    var out = await api.applyCommands(cmd + ' -o out.json target=frame', files);
    return JSON.parse(out['out.json']).features[0].properties;
  }

  function getAspect(coords) {
    var xx = coords.map(function(p) {return p[0];});
    var yy = coords.map(function(p) {return p[1];});
    return (Math.max.apply(null, xx) - Math.min.apply(null, xx)) /
      (Math.max.apply(null, yy) - Math.min.apply(null, yy));
  }

  it('pads a frame with a fixed aspect ratio back out to it', async function() {
    // Projecting a rectangle's boundary and taking its bounds reshapes it, so
    // the declared ratio has to be restored or the page won't match the extent.
    var coords = await getFrameCoords(
      '-i a.json -frame width=600 height=300 target=a -target a -proj robin');
    assert(Math.abs(getAspect(coords) - 2) < 1e-9);
    var rec = await getFrameRecord(
      '-i a.json -frame width=600 height=300 target=a -target a -proj robin');
    assert.equal(rec.frame_aspect_ratio, 2);
    assert.equal(rec.height, 300);
  });

  it('projects a frame padded past the pole instead of failing', async function() {
    // Fitting a near-global extent to a fixed ratio can pad the frame beyond
    // 90 degrees, which has no projected equivalent.
    var world = JSON.stringify({
      type: 'Feature', properties: {n: 'w'},
      geometry: {type: 'Polygon', coordinates:
        [[[-170, -50], [170, -50], [170, 70], [-170, 70], [-170, -50]]]}
    });
    var out = await api.applyCommands(
      '-i w.json -frame width=800 height=400 target=w -target w -proj robin ' +
      '-o out.json target=frame', {'w.json': world});
    var coords = JSON.parse(out['out.json']).features[0].geometry.coordinates[0];
    assert(Math.abs(getAspect(coords) - 2) < 1e-9);
    assert(coords.every(function(p) {
      return isFinite(p[0]) && isFinite(p[1]);
    }));
  });

  it('refreshes the derived height of a frame with no fixed ratio', async function() {
    var rec = await getFrameRecord(
      '-i a.json -frame width=600 target=a -target a -proj robin');
    var coords = await getFrameCoords(
      '-i a.json -frame width=600 target=a -target a -proj robin');
    assert(!('frame_aspect_ratio' in rec));
    assert.equal(rec.height, Math.round(600 / getAspect(coords)));
  });

  it('reports that the frame was projected', async function() {
    var captured = await captureLogCallsAsync(function() {
      return api.applyCommands(
        '-i a.json -frame width=600 target=a -target a -proj merc -o out.json target=a', files);
    });
    assert(captured.log.some(function(str) {
      return str.includes('Also reprojected the map frame');
    }));
  });

  it('says nothing when the frame is already in the destination CRS', async function() {
    var captured = await captureLogCallsAsync(function() {
      return api.applyCommands(
        '-i a.json -frame width=600 target=a -proj merc target=* ' +
        '-i b.json -target b -proj merc -o out.json target=b', files);
    });
    assert.equal(captured.log.some(function(str) {
      return str.includes('Also reprojected the map frame') ||
        str.includes('Source and destination CRS are the same');
    }), false);
  });

  it('gives the frame the same auto-fitted CRS as the content', async function() {
    var captured = await captureLogCallsAsync(function() {
      return api.applyCommands(
        '-i a.json -frame width=600 target=a -target a -proj lcc -o out.json target=a', files);
    });
    // One expansion for the whole command: re-deriving parameters from the
    // frame's own extent would put the frame in a different lcc.
    var expansions = captured.log.filter(function(str) {
      return str.includes('Converted "lcc"');
    });
    assert.equal(expansions.length, 1);
    assert(captured.log.some(function(str) {
      return str.includes('Also reprojected the map frame');
    }));
  });

  it('names layers that the command did not project', async function() {
    var captured = await captureLogCallsAsync(function() {
      return api.applyCommands(
        '-i a.json -i b.json -frame width=600 target=a,b -target a -proj merc ' +
        '-o out.json target=a', files);
    });
    assert(captured.log.some(function(str) {
      return str.includes('Layer not projected by this command: b') &&
        str.includes('target=*');
    }));
  });

  it('survives a round trip back to lat-long', async function() {
    var coords = await getFrameCoords(
      '-i a.json -frame width=600 target=a -proj merc target=* -target a -proj wgs84');
    coords.forEach(function(p) {
      assert(Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
    });
  });

  it('keeps the frame usable for sizing SVG output', async function() {
    var out = await api.applyCommands(
      '-i a.json -frame width=600 target=a -target a -proj merc -o out.svg target=a,frame',
      files);
    var svg = String(out['out.svg']);
    assert(svg.includes('width="600"'));
    // content spans the full page, so the frame still matches the data
    assert(/<path d="M 0[. ]/.test(svg));
  });

  // A generic field command can promote an ordinary rectangle into a second
  // frame. The GUI resolves the frame on every render, so the resolver has to
  // choose one rather than throw.
  it('resolves one frame when a second has been promoted', function() {
    var catalog = new api.internal.Catalog();
    var frameDataset = importRectangle([0, 0, 2, 1],
      {type: 'frame', width: 600, height: 300});
    var otherDataset = importRectangle([0, 0, 1, 1], {});
    frameDataset.layers[0].name = 'frame';
    otherDataset.layers[0].name = 'rect';
    catalog.addDataset(frameDataset);
    catalog.addDataset(otherDataset);
    var rec = otherDataset.layers[0].data.getRecords()[0];
    rec.type = 'frame';
    rec.width = 400;

    assert.equal(api.internal.findFrames(catalog).length, 2);
    assert.equal(api.internal.getActiveFrame(catalog).layer.name, 'frame');
  });
});

describe('-proj with several target datasets', function() {
  it('resolves one destination CRS for the whole command', async function() {
    var west = JSON.stringify({type: 'Feature', properties: {}, geometry: {
      type: 'Polygon',
      coordinates: [[[-120, 30], [-100, 30], [-100, 50], [-120, 50], [-120, 30]]]}});
    var east = JSON.stringify({type: 'Feature', properties: {}, geometry: {
      type: 'Polygon',
      coordinates: [[[-80, 25], [-60, 25], [-60, 40], [-80, 40], [-80, 25]]]}});
    var captured = await captureLogCallsAsync(function() {
      return api.applyCommands('-i west.json -i east.json -proj lcc target=* -o out.json target=west',
        {'west.json': west, 'east.json': east});
    });
    var expansions = captured.log.filter(function(str) {
      return str.includes('Converted "lcc"');
    });
    assert.equal(expansions.length, 1);
    // fitted to the combined extent of both targets, not to either one alone
    assert(expansions[0].includes('+lon_0=-90'));
  });
});

function importRectangle(bbox, properties) {
  return api.internal.importGeoJSON({
    type: 'Feature',
    properties: properties,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [bbox[0], bbox[1]],
        [bbox[0], bbox[3]],
        [bbox[2], bbox[3]],
        [bbox[2], bbox[1]],
        [bbox[0], bbox[1]]
      ]]
    }
  });
}
