import assert from 'assert';
import api from '../mapshaper.js';

var internal = api.internal;

describe('multi-dataset command dispatch', function() {
  it('runs an in-place replacement command on each target dataset', async function() {
    var job = await runCommand('-filter keep target=*', [
      makePointDataset('a', 0),
      makePointDataset('b', 10)
    ]);
    var datasets = job.catalog.getDatasets();
    var targets = job.catalog.getDefaultTargets();

    assert.equal(datasets.length, 2);
    assert.deepEqual(datasets.map(function(dataset) {
      return dataset.layers[0].shapes.length;
    }), [1, 1]);
    assert.deepEqual(targets.map(function(target) {
      return target.dataset;
    }), datasets);
    assert.deepEqual(targets.map(function(target) {
      return target.layers[0];
    }), datasets.map(function(dataset) {
      return dataset.layers[0];
    }));
  });

  it('applies no-replace and preserves all output targets', async function() {
    var job = await runCommand('-filter keep target=* + name=selected', [
      makePointDataset('a', 0),
      makePointDataset('b', 10)
    ]);
    var datasets = job.catalog.getDatasets();
    var targets = job.catalog.getDefaultTargets();

    assert.deepEqual(datasets.map(function(dataset) {
      return dataset.layers.map(function(lyr) { return lyr.name; });
    }), [['a', 'selected'], ['b', 'selected']]);
    assert.equal(targets.length, 2);
    assert.deepEqual(targets.map(function(target) {
      return target.layers.map(function(lyr) { return lyr.name; });
    }), [['selected'], ['selected']]);
  });

  it('runs a topology-coordinated command separately per dataset', async function() {
    var job = await runCommand('-dissolve target=*', [
      makePolygonDataset('a', 0),
      makePolygonDataset('b', 10)
    ]);
    var datasets = job.catalog.getDatasets();

    assert.equal(datasets.length, 2);
    assert.deepEqual(datasets.map(function(dataset) {
      return dataset.layers[0].shapes.length;
    }), [1, 1]);
    assert.equal(job.catalog.getDefaultTargets().length, 2);
  });

  it('collects one new-dataset output per target dataset', async function() {
    var job = await runCommand('-grid target=* interval=1 + name=grid', [
      makePointDataset('a', 1000),
      makePointDataset('b', 2000)
    ]);
    var targets = job.catalog.getDefaultTargets();

    assert.equal(job.catalog.getDatasets().length, 4);
    assert.equal(targets.length, 2);
    assert.deepEqual(targets.map(function(target) {
      return target.layers[0].name;
    }), ['grid', 'grid']);
    assert.notEqual(targets[0].dataset, targets[1].dataset);
  });

  ['clip', 'erase'].forEach(function(name) {
    it('reuses an external source safely with -' + name, async function() {
      var output = await api.applyCommands(
        '-i a.json -i b.json -' + name +
        ' source=mask.json target=a,b -o target=* format=geojson',
        {
          'a.json': makeBoxFeatureCollection(0, 4),
          'b.json': makeBoxFeatureCollection(10, 14),
          'mask.json': makeMaskFeatureCollection()
        }
      );
      var aBounds = getOutputXBounds(output['a.json']);
      var bBounds = getOutputXBounds(output['b.json']);

      if (name == 'clip') {
        assert.deepEqual(aBounds, [0, 2]);
        assert.deepEqual(bBounds, [10, 12]);
      } else {
        assert.deepEqual(aBounds, [2, 4]);
        assert.deepEqual(bBounds, [12, 14]);
      }
    });
  });

  it('does not mutate a retained catalog overlay source', async function() {
    var source = internal.importGeoJSON(makeMaskFeatureCollection(), {});
    source.layers[0].name = 'mask';
    var sourceShapes = JSON.stringify(source.layers[0].shapes);
    var job = await runCommand('-clip target=a,b source=mask', [
      makePolygonDataset('a', 0),
      makePolygonDataset('b', 10),
      source
    ]);

    assert.equal(JSON.stringify(source.layers[0].shapes), sourceShapes);
    assert.equal(job.catalog.getDatasets().indexOf(source) > -1, true);
    assert.deepEqual(job.catalog.getDefaultTargets().map(function(target) {
      return target.layers[0].name;
    }), ['a', 'b']);
  });

  it('joins one source table to targets in separate datasets', async function() {
    var source = {
      info: {},
      layers: [{
        name: 'src',
        data: new internal.DataTable([
          {id: 1, value: 'one'},
          {id: 2, value: 'two'}
        ])
      }]
    };
    var job = await runCommand('-join target=a,b source=src keys=id,id fields=value', [
      makePointDataset('a', 0),
      makePointDataset('b', 10),
      source
    ]);
    var datasets = job.catalog.getDatasets();

    assert.deepEqual(datasets[0].layers[0].data.getRecords().map(function(rec) {
      return rec.value;
    }), ['one', 'two']);
    assert.deepEqual(datasets[1].layers[0].data.getRecords().map(function(rec) {
      return rec.value;
    }), ['one', 'two']);
  });

  it('reuses an external polygon source safely for spatial joins', async function() {
    var source = makeMaskFeatureCollection();
    source.features[0].properties = {zone: 'inside'};
    var output = await api.applyCommands(
      '-i a.json -i b.json -join source=zones.json target=a,b fields=zone ' +
      '-o target=* format=geojson',
      {
        'a.json': makeBoxFeatureCollection(0, 1),
        'b.json': makeBoxFeatureCollection(10, 11),
        'zones.json': source
      }
    );

    assert.equal(JSON.parse(output['a.json']).features[0].properties.zone, 'inside');
    assert.equal(JSON.parse(output['b.json']).features[0].properties.zone, 'inside');
  });
});

function runCommand(command, datasets) {
  var catalog = new internal.Catalog();
  catalog.addDatasets(datasets);
  catalog.setDefaultTargets(datasets.map(function(dataset) {
    return {dataset: dataset, layers: dataset.layers.concat()};
  }));
  var job = new internal.Job(catalog);
  var commands = internal.parseCommands(command);
  return new Promise(function(resolve, reject) {
    internal.runParsedCommands(commands, job, function(err, result) {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function makePointDataset(name, x) {
  var dataset = internal.importGeoJSON({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {id: 1, keep: true},
      geometry: {type: 'Point', coordinates: [x, 0]}
    }, {
      type: 'Feature',
      properties: {id: 2, keep: false},
      geometry: {type: 'Point', coordinates: [x + 2, 2]}
    }]
  }, {});
  dataset.layers[0].name = name;
  return dataset;
}

function makePolygonDataset(name, x) {
  var dataset = internal.importGeoJSON({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]]
      }
    }, {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[x + 1, 0], [x + 2, 0], [x + 2, 1], [x + 1, 1], [x + 1, 0]]]
      }
    }]
  }, {});
  dataset.layers[0].name = name;
  return dataset;
}

function makeBoxFeatureCollection(xmin, xmax) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [xmin, 0], [xmax, 0], [xmax, 2], [xmin, 2], [xmin, 0]
        ]]
      }
    }]
  };
}

function makeMaskFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, -1], [2, -1], [2, 3], [0, 3], [0, -1]]],
          [[[10, -1], [12, -1], [12, 3], [10, 3], [10, -1]]]
        ]
      }
    }]
  };
}

function getOutputXBounds(content) {
  var json = JSON.parse(content);
  var xx = [];
  collectXCoords(json, xx);
  return [Math.min.apply(null, xx), Math.max.apply(null, xx)];
}

function collectXCoords(obj, xx) {
  if (!obj) return;
  if (Array.isArray(obj)) {
    if (obj.length >= 2 && typeof obj[0] == 'number' && typeof obj[1] == 'number') {
      xx.push(obj[0]);
    } else {
      obj.forEach(function(part) {
        collectXCoords(part, xx);
      });
    }
  } else if (obj.type == 'FeatureCollection') {
    obj.features.forEach(function(feature) {
      collectXCoords(feature.geometry, xx);
    });
  } else if (obj.type == 'Feature') {
    collectXCoords(obj.geometry, xx);
  } else if (obj.type == 'GeometryCollection') {
    obj.geometries.forEach(function(geometry) {
      collectXCoords(geometry, xx);
    });
  } else if (obj.coordinates) {
    collectXCoords(obj.coordinates, xx);
  }
}
