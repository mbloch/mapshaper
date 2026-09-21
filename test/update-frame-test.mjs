import assert from 'assert';
import api from '../mapshaper.js';

describe('-update-frame', function() {
  it('updates the geographic extent', async function() {
    var feature = await runGeoJSON(
      '-frame bbox=0,0,2,1 width=800 -update-frame bbox=10,20,14,22'
    );
    assert.deepEqual(getFeatureBbox(feature), [10, 20, 14, 22]);
    assert.equal(feature.properties.width, 800);
    assert.equal(feature.properties.height, 400);
  });

  it('updates nominal width without changing extent or aspect mode', async function() {
    var feature = await runGeoJSON(
      '-frame bbox=0,0,2,1 width=800 -update-frame width=4in'
    );
    assert.deepEqual(getFeatureBbox(feature), [0, 0, 2, 1]);
    assert.equal(feature.properties.width, 288);
    assert.equal(feature.properties.height, 144);
    assert.equal(feature.properties.frame_units, 'in');
    assert.equal('frame_aspect_ratio' in feature.properties, false);
  });

  it('derives width from height and the effective aspect', async function() {
    var feature = await runGeoJSON(
      '-frame bbox=0,0,2,1 width=800 -update-frame height=100'
    );
    assert.equal(feature.properties.width, 200);
    assert.equal(feature.properties.height, 100);
    assert.equal(feature.properties.frame_units, 'px');
  });

  it('sets a fixed aspect ratio and pads the extent', async function() {
    var feature = await runGeoJSON(
      '-frame bbox=0,0,2,1 width=800 -update-frame aspect-ratio=1'
    );
    assert.deepEqual(getFeatureBbox(feature), [0, -0.5, 2, 1.5]);
    assert.equal(feature.properties.frame_aspect_ratio, 1);
    assert.equal(feature.properties.height, 800);
  });

  it('clears a fixed aspect ratio with auto-aspect', async function() {
    var feature = await runGeoJSON(
      '-frame bbox=0,0,2,1 width=800 height=800 ' +
      '-update-frame bbox=0,0,4,1 auto-aspect'
    );
    assert.deepEqual(getFeatureBbox(feature), [0, 0, 4, 1]);
    assert.equal('frame_aspect_ratio' in feature.properties, false);
    assert.equal(feature.properties.height, 200);
  });

  it('applies pixel offsets using the current nominal scale', async function() {
    var feature = await runGeoJSON(
      '-frame bbox=0,0,100,100 width=100 -update-frame offset=10px'
    );
    assert.deepEqual(getFeatureBbox(feature), [-12.5, -12.5, 112.5, 112.5]);
  });

  it('sets both dimensions and fixes their aspect ratio', async function() {
    var feature = await runGeoJSON(
      '-frame bbox=0,0,2,1 width=800 -update-frame width=6in height=3in'
    );
    assert.equal(feature.properties.width, 432);
    assert.equal(feature.properties.height, 216);
    assert.equal(feature.properties.frame_aspect_ratio, 2);
    assert.equal(feature.properties.frame_units, 'in');
  });

  it('removes the frame role without removing geometry', async function() {
    var feature = await runGeoJSON(
      '-frame bbox=0,0,2,1 width=800 -update-frame remove'
    );
    assert.deepEqual(feature.properties, {});
    assert.deepEqual(getFeatureBbox(feature), [0, 0, 2, 1]);
  });

  it('rebuilds geometry without changing another layer in shared topology', function() {
    var contentDataset = importRectangle([0, 0, 1, 1], {name: 'content'});
    var frameDataset = importRectangle(
      [-1, -1, 2, 2],
      {type: 'frame', width: 600, note: 'keep'}
    );
    var dataset = api.internal.mergeDatasets([contentDataset, frameDataset]);
    var content = dataset.layers[0];
    var frame = dataset.layers[1];
    var contentBbox = api.internal.getLayerBounds(content, dataset.arcs).toArray();

    api.cmd.updateFrame([frame], dataset, {bbox: [-2, -3, 4, 5]});

    assert.deepEqual(
      api.internal.getLayerBounds(content, dataset.arcs).toArray(),
      contentBbox
    );
    assert.deepEqual(
      api.internal.getLayerBounds(frame, dataset.arcs).toArray(),
      [-2, -3, 4, 5]
    );
    assert.equal(frame.data.getReadOnlyRecordAt(0).note, 'keep');
    assert.equal(api.internal.isFrameLayer(frame, dataset.arcs), true);
  });

  it('rejects invalid targets and contradictory options', async function() {
    await assert.rejects(
      api.applyCommands('-rectangle bbox=0,0,1,1 -update-frame width=100'),
      /not a map frame/
    );
    await assert.rejects(
      api.applyCommands(
        '-i box.json frame.json combine-files ' +
        '-update-frame target=box,frame width=100',
        {
          'box.json': JSON.stringify(getRectangleFeature([0, 0, 1, 1], {})),
          'frame.json': JSON.stringify(getRectangleFeature(
            [0, 0, 2, 1],
            {type: 'frame', width: 800}
          ))
        }
      ),
      /single target layer/
    );
    await assert.rejects(
      api.applyCommands(
        '-frame bbox=0,0,2,1 width=800 ' +
        '-update-frame aspect-ratio=2 auto-aspect'
      ),
      /mutually exclusive/
    );
    await assert.rejects(
      api.applyCommands(
        '-frame bbox=0,0,2,1 width=800 ' +
        '-update-frame width=300 height=200 aspect-ratio=2'
      ),
      /Contradictory/
    );
    await assert.rejects(
      api.applyCommands('-frame bbox=0,0,2,1 width=800 -update-frame bbox=0,0,0,1'),
      /collapsed bbox/
    );
    await assert.rejects(
      api.applyCommands('-frame bbox=0,0,2,1 width=800 -update-frame'),
      /Missing frame update/
    );
    await assert.rejects(
      api.applyCommands(
        '-frame bbox=0,0,2,1 width=800 -update-frame bbox=0,0,4,2 ' +
        'fix-scale width=400'
      ),
      /fix-scale cannot be combined/
    );
  });

  // Holding the scale means the output grows with the extent, which is what
  // the resize tool's Fix scale mode does when the frame is fitted or dragged.
  describe('fix-scale', function() {
    it('grows the size in step with the extent', async function() {
      var feature = await runGeoJSON(
        '-frame bbox=0,0,2,1 width=800 -update-frame bbox=0,0,4,2 fix-scale'
      );
      assert.deepEqual(getFeatureBbox(feature), [0, 0, 4, 2]);
      assert.equal(feature.properties.width, 1600);
      assert.equal(feature.properties.height, 800);
    });

    it('shrinks the size in step with the extent', async function() {
      var feature = await runGeoJSON(
        '-frame bbox=0,0,2,1 width=800 -update-frame bbox=0,0,1,0.5 fix-scale'
      );
      assert.equal(feature.properties.width, 400);
      assert.equal(feature.properties.height, 200);
    });

    it('counts the padding an offset adds', async function() {
      var feature = await runGeoJSON(
        '-frame bbox=0,0,2,1 width=800 ' +
        '-update-frame bbox=0,0,4,2 offset=10% fix-scale'
      );
      // The offset is a share of the padded frame, so 10% a side turns a
      // 4-wide extent into a 5-wide one; the held scale takes the width from
      // 800 to 2000 rather than from 800 to 1600.
      assert.deepEqual(getFeatureBbox(feature), [-0.5, -0.25, 4.5, 2.25]);
      assert.equal(feature.properties.width, 2000);
      assert.equal(feature.properties.height, 1000);
    });

    it('keeps a fixed aspect ratio', async function() {
      var feature = await runGeoJSON(
        '-frame bbox=0,0,2,1 width=800 height=800 ' +
        '-update-frame bbox=0,0,4,2 fix-scale'
      );
      assert.equal(feature.properties.frame_aspect_ratio, 1);
      assert.equal(feature.properties.width, feature.properties.height);
    });

    it('is not needed to hold the size, which is the default', async function() {
      var feature = await runGeoJSON(
        '-frame bbox=0,0,2,1 width=800 -update-frame bbox=0,0,4,2'
      );
      assert.equal(feature.properties.width, 800);
    });
  });

  // An offset used to pad the new extent out to the frame's old page shape,
  // which stopped a re-fitted frame from taking the shape of its new bounds.
  describe('offset with a new bbox', function() {
    it('leaves the new extent its own shape when no aspect is fixed', async function() {
      var feature = await runGeoJSON(
        '-frame bbox=0,0,2,1 width=800 -update-frame bbox=0,0,1,1 offset=10%'
      );
      var bbox = getFeatureBbox(feature);
      assert.equal(bbox[2] - bbox[0], bbox[3] - bbox[1]);
      assert.equal(feature.properties.width, 800);
      assert.equal(feature.properties.height, 800);
    });

    it('still pads out to a fixed aspect ratio', async function() {
      var feature = await runGeoJSON(
        '-frame bbox=0,0,2,1 width=800 height=400 ' +
        '-update-frame bbox=0,0,1,1 offset=10%'
      );
      var bbox = getFeatureBbox(feature);
      assert.equal(feature.properties.frame_aspect_ratio, 2);
      assert.ok(Math.abs((bbox[2] - bbox[0]) / (bbox[3] - bbox[1]) - 2) < 1e-10);
    });
  });
});

async function runGeoJSON(commands) {
  var out = await api.applyCommands(commands + ' -o out.json format=geojson');
  var json = JSON.parse(out['out.json']);
  return json.features ? json.features[0] : {
    type: 'Feature',
    properties: {},
    geometry: json.geometries[0]
  };
}

function getFeatureBbox(feature) {
  return feature.geometry.coordinates[0].reduce(function(bbox, p) {
    bbox[0] = Math.min(bbox[0], p[0]);
    bbox[1] = Math.min(bbox[1], p[1]);
    bbox[2] = Math.max(bbox[2], p[0]);
    bbox[3] = Math.max(bbox[3], p[1]);
    return bbox;
  }, [Infinity, Infinity, -Infinity, -Infinity]);
}

function importRectangle(bbox, properties) {
  return api.internal.importGeoJSON(getRectangleFeature(bbox, properties));
}

function getRectangleFeature(bbox, properties) {
  return {
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
  };
}
