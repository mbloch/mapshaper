import assert from 'assert';
import api from '../mapshaper.js';

describe('map frame contract', function() {
  it('recognizes only a single rectangular polygon with one valid frame record', function() {
    var valid = importRectangle([0, 0, 2, 1], {type: 'frame', width: 800});
    var missingWidth = importRectangle([0, 0, 2, 1], {type: 'frame'});
    var stringWidth = importRectangle([0, 0, 2, 1], {type: 'frame', width: '800'});

    assert.equal(api.internal.isFrameLayer(valid.layers[0], valid.arcs), true);
    assert.equal(api.internal.isFrameLayer(missingWidth.layers[0], missingWidth.arcs), false);
    assert.equal(api.internal.isFrameLayer(stringWidth.layers[0], stringWidth.arcs), false);
  });

  it('normalizes height from the extent or a fixed aspect ratio', function() {
    var derived = importRectangle(
      [0, 0, 2, 1],
      {type: 'frame', width: 800, height: 999, frame_units: 'px'}
    );
    var fixed = importRectangle(
      [0, 0, 2, 1],
      {type: 'frame', width: 600, frame_aspect_ratio: 1.5, frame_units: 'in'}
    );

    assert.deepEqual(
      api.internal.getFrameLayerData(derived.layers[0], derived.arcs),
      {
        type: 'frame',
        width: 800,
        height: 400,
        bbox: [0, 0, 2, 1],
        aspect_ratio: null,
        units: 'px'
      }
    );
    var data = api.internal.getFrameLayerData(fixed.layers[0], fixed.arcs);
    assert.equal(data.height, 400);
    assert.equal(data.aspect_ratio, 1.5);
    assert.equal(data.units, 'in');
  });

  it('resolves the only frame in a catalog', function() {
    var catalog = new api.internal.Catalog();
    var content = importRectangle([0, 0, 1, 1], {name: 'content'});
    var frame = importRectangle([0, 0, 2, 1], {type: 'frame', width: 800});
    frame.layers[0].name = 'frame';
    catalog.addDatasets([content, frame]);

    var target = api.internal.getActiveFrame(catalog);
    assert.equal(target.layer, frame.layers[0]);
    assert.equal(target.dataset, frame);
  });

  it('rejects multiple frames before adding any datasets', function() {
    var catalog = new api.internal.Catalog();
    var frame1 = importRectangle([0, 0, 1, 1], {type: 'frame', width: 800});
    var frame2 = importRectangle([0, 0, 2, 1], {type: 'frame', width: 800});

    assert.throws(function() {
      catalog.addDatasets([frame1, frame2]);
    }, /Multiple map frames are not supported/);
    assert.equal(catalog.isEmpty(), true);
  });

  it('identifies reserved frame fields', function() {
    assert.equal(api.internal.isFrameReservedField('width'), true);
    assert.equal(api.internal.isFrameReservedField('frame_units'), true);
    assert.equal(api.internal.isFrameReservedField('notes'), false);
  });

  it('formats nominal dimensions in authored units', function() {
    assert.equal(api.internal.formatFrameSizeForDisplay({
      width: 432,
      height: 216,
      units: 'in'
    }), '6 × 3 in');
    assert.equal(api.internal.formatFrameSizeForDisplay({
      width: 600,
      height: 300,
      units: 'px'
    }), '600 × 300 px');
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
