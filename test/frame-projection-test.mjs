import assert from 'assert';
import api from '../mapshaper.js';
import { Bounds } from '../src/geom/mapshaper-bounds';
import { enhanceLayerForDisplay } from '../src/gui/gui-display-layer';
import { getDisplayProjectionTransform } from '../src/gui/gui-dynamic-crs';
import { getProjectedFrameBounds } from '../src/furniture/mapshaper-frame-projection';

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
