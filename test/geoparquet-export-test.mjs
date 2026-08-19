import api from '../mapshaper.js';
import assert from 'assert';
import { parquetMetadataAsync } from 'hyparquet';
import { planRowGroups, ROW_GROUP_TARGET_BYTES } from '../src/geoparquet/mapshaper-geoparquet-export';
import { fixPath, captureLogCallsAsync } from './helpers';

describe('geoparquet export', function() {
  it('exports GeoParquet and round-trips via async import', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'alpha', value: 3},
        geometry: {type: 'Point', coordinates: [1, 2]}
      }, {
        type: 'Feature',
        properties: {name: 'beta', value: 7},
        geometry: {type: 'Point', coordinates: [3, 4]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=geoparquet', {'in.json': input});
    var names = Object.keys(output);
    var fileName = names[0];
    var dataset = await api.internal.importContentAsync({
      parquet: {
        filename: fileName,
        content: output[fileName]
      }
    }, {});

    assert.equal(names.length, 1);
    assert(/\.parquet$/i.test(fileName));
    assert.equal(dataset.info.input_formats[0], 'geoparquet');
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].geometry_type, 'point');
    assert.equal(dataset.layers[0].shapes.length, 2);
    assert.deepEqual(dataset.layers[0].data.getRecords().map(rec => rec.name), ['alpha', 'beta']);
    assert.deepEqual(dataset.layers[0].data.getRecords().map(rec => rec.value), [3, 7]);
  });

  it('accepts format=parquet as an alias', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {id: 1},
        geometry: {type: 'Point', coordinates: [5, 6]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=parquet', {'in.json': input});
    var names = Object.keys(output);
    assert.equal(names.length, 1);
    assert(/\.parquet$/i.test(names[0]));
  });

  it('exports tabular layers as Parquet without a geometry column', async function() {
    var input = [{
      name: 'alpha',
      value: 3
    }, {
      name: 'beta',
      value: 7
    }];
    var out = await captureLogCallsAsync(function() {
      return api.applyCommands('-i in.json -o format=geoparquet', {'in.json': input});
    });
    var output = out.result;
    var fileName = Object.keys(output)[0];
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[fileName]));
    var fields = getParquetFieldNames(metadata);
    assert(!fields.includes('geometry'));
    assert(/writing attribute data only/.test(out.log.join('\n')));

    var dataset = await api.internal.importContentAsync({
      parquet: {
        filename: fileName,
        content: output[fileName]
      }
    }, {});
    assert.equal(dataset.layers[0].geometry_type, null);
    assert.deepEqual(dataset.layers[0].data.getRecords(), input);
  });

  it('exports null-geometry features with attributes as Parquet tables', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'alpha'},
        geometry: null
      }]
    };
    var out = await captureLogCallsAsync(function() {
      return api.applyCommands('-i in.json -o format=geoparquet', {'in.json': input});
    });
    var output = out.result;
    var fileName = Object.keys(output)[0];
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[fileName]));
    assert(!getParquetFieldNames(metadata).includes('geometry'));
    assert(/writing attribute data only/.test(out.log.join('\n')));
  });

  it('rejects empty GeoParquet output layers', async function() {
    var emptyInput = {
      type: 'FeatureCollection',
      features: []
    };
    var nullOnlyInput = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: null,
        geometry: null
      }]
    };
    await assert.rejects(function() {
      return api.applyCommands('-i in.json -o format=geoparquet', {'in.json': emptyInput});
    }, /requires at least one record/);
    await assert.rejects(function() {
      return api.applyCommands('-i in.json -o format=geoparquet', {'in.json': nullOnlyInput});
    }, /requires at least one record|requires geometry or attribute data/);
  });

  it('exports ZSTD-compressed GeoParquet when requested', async function() {
    var text = 'abcdefghijklmnopqrstuvwxyz'.repeat(40);
    var input = {
      type: 'FeatureCollection',
      features: []
    };
    for (var i = 0; i < 3000; i++) {
      input.features.push({
        type: 'Feature',
        properties: {name: text + i},
        geometry: {type: 'Point', coordinates: [i % 360 - 180, Math.floor(i / 360)]}
      });
    }
    var output = await api.applyCommands('-i in.json -o format=geoparquet compression=zstd level=10', {'in.json': input});
    var fileName = Object.keys(output)[0];
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[fileName]));
    assert.deepEqual(getParquetCodecs(metadata), ['ZSTD']);

    var dataset = await api.internal.importContentAsync({
      parquet: {
        filename: fileName,
        content: output[fileName]
      }
    }, {});
    assert.equal(dataset.layers[0].geometry_type, 'point');
    assert.equal(dataset.layers[0].data.size(), 3000);
    assert.equal(dataset.layers[0].data.getRecordAt(2999).name, text + '2999');
  });

  it('exports uncompressed GeoParquet when requested', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {id: 1},
        geometry: {type: 'Point', coordinates: [5, 6]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=geoparquet compression=none', {'in.json': input});
    var fileName = Object.keys(output)[0];
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[fileName]));
    assert.deepEqual(getParquetCodecs(metadata), ['UNCOMPRESSED']);
  });

  it('rejects compression level without ZSTD compression', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {id: 1},
        geometry: {type: 'Point', coordinates: [5, 6]}
      }]
    };
    await assert.rejects(function() {
      return api.applyCommands('-i in.json -o format=geoparquet compression=snappy level=3', {'in.json': input});
    }, /level= option only applies with compression=zstd/);
  });

  it('preserves CRS metadata from imported GeoParquet on export', async function() {
    var src = fixPath('data/geoparquet/example-crs_vermont-utm_geo.parquet');
    var imported = await api.internal.importFileAsync(src, {});
    assert.equal(imported.info.crs_string, 'epsg:32618');

    var output = await api.applyCommands('-i ' + src + ' -o format=geoparquet');
    var fileName = Object.keys(output)[0];
    var roundtrip = await api.internal.importContentAsync({
      parquet: {
        filename: fileName,
        content: output[fileName]
      }
    }, {});
    assert.equal(roundtrip.info.crs_string, 'epsg:32618');
  });

  it('writes the CRS on the GEOMETRY logical type as well as in the geo metadata', async function() {
    // A reader that understands the Parquet GEOMETRY logical type ignores the
    // "geo" metadata; with no CRS on the logical type it assumes OGC:CRS84 and
    // reports projected data as WGS 84.
    var output = await api.applyCommands('-i in.json -proj EPSG:26915 -o format=geoparquet',
      {'in.json': utmPointCollection()});
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[Object.keys(output)[0]]));
    var field = metadata.schema.find(function(f) { return f.name == 'geometry'; });

    assert.equal(field.logical_type.type, 'GEOMETRY');
    var logicalCrs = JSON.parse(field.logical_type.crs);
    assert.equal(logicalCrs.type, 'ProjectedCRS');
    assert.equal(logicalCrs.coordinate_system.subtype, 'Cartesian');

    var geo = JSON.parse(getParquetKeyValue(metadata, 'geo'));
    assert.equal(geo.version, '1.1.0');
    assert.deepEqual(geo.columns.geometry.crs, logicalCrs);
  });

  it('leaves the logical type CRS unset when the layer has no CRS', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{type: 'Feature', properties: {id: 1}, geometry: {type: 'Point', coordinates: [1, 2]}}]
    };
    var output = await api.applyCommands('-i in.json -o format=geoparquet', {'in.json': input});
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[Object.keys(output)[0]]));
    var field = metadata.schema.find(function(f) { return f.name == 'geometry'; });
    assert.equal(field.logical_type.type, 'GEOMETRY');
    assert.equal(field.logical_type.crs, undefined);
  });

  it('keeps attribute column types when the geometry CRS is written', async function() {
    var output = await api.applyCommands('-i in.json -proj EPSG:26915 -o format=geoparquet',
      {'in.json': utmPointCollection({name: 'alpha', count: 3, ratio: 1.5, flag: true})});
    var fileName = Object.keys(output)[0];
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[fileName]));
    var types = {};
    metadata.schema.forEach(function(f) {
      if (f.name != 'root') types[f.name] = f.type;
    });
    assert.deepEqual(types, {
      geometry: 'BYTE_ARRAY', name: 'BYTE_ARRAY', count: 'INT32',
      ratio: 'DOUBLE', flag: 'BOOLEAN'
    });

    var roundtrip = await api.internal.importContentAsync({
      parquet: {filename: fileName, content: output[fileName]}
    }, {});
    assert.deepEqual(roundtrip.layers[0].data.getRecords()[0],
      {name: 'alpha', count: 3, ratio: 1.5, flag: true});
  });
});

describe('geoparquet row groups', function() {
  it('writes a single row group for a small layer', async function() {
    var metadata = await writeAndReadMetadata(pointCollection(2000));
    assert.equal(metadata.row_groups.length, 1);
    assert.equal(Number(metadata.row_groups[0].num_rows), 2000);
  });

  it('sizes row groups by geometry size, not by row count', async function() {
    // Same number of rows, ~1000x difference in bytes per row: the point layer
    // belongs in one group, the polygon layer does not.
    var points = await writeAndReadMetadata(pointCollection(400));
    var polygons = await writeAndReadMetadata(polygonCollection(400, 1000));
    assert.equal(points.row_groups.length, 1);
    assert.ok(polygons.row_groups.length > 1,
      'expected the polygon layer to be split, got ' + polygons.row_groups.length + ' group(s)');
  });

  it('keeps the leading row group small so range readers can preview', async function() {
    var metadata = await writeAndReadMetadata(polygonCollection(400, 1000));
    var rows = metadata.row_groups.map(function(rg) { return Number(rg.num_rows); });
    assert.ok(rows[0] < rows[1], 'expected a small leading group, got ' + rows.join(', '));
    assert.equal(rows.reduce(function(a, b) { return a + b; }), 400);
  });

  it('uses rowgroup= when given', async function() {
    var metadata = await writeAndReadMetadata(pointCollection(1000), 'rowgroup=250');
    assert.deepEqual(metadata.row_groups.map(function(rg) { return Number(rg.num_rows); }),
      [250, 250, 250, 250]);
  });

  it('rejects a rowgroup= value that is not a positive number of rows', async function() {
    await assert.rejects(async function() {
      await api.applyCommands('-i in.json -o format=geoparquet rowgroup=0',
        {'in.json': pointCollection(10)});
    }, /rowgroup= option must be a positive integer/);
  });
});

// Sizes that need a multi-gigabyte file to reach end-to-end are checked here
// against the planner directly.
describe('geoparquet row group planner', function() {
  var MB = 1024 * 1024;

  function groupsFor(rowCount, bytesPerRow) {
    var plan = planRowGroups(rowCount, bytesPerRow);
    var sizes = Array.isArray(plan) ? plan : [plan];
    var groups = [];
    for (var i = 0, start = 0; start < rowCount; i++) {
      var size = sizes[Math.min(i, sizes.length - 1)];
      groups.push(Math.min(size, rowCount - start));
      start += size;
    }
    return groups;
  }

  it('puts a layer smaller than a preview into one group', function() {
    assert.deepEqual(groupsFor(50000, 20), [50000]);   // 1 MB of points
    assert.deepEqual(groupsFor(30, 100000), [30]);     // 3 MB of large rows
  });

  it('splits off a preview once a layer is worth previewing', function() {
    // 10 MB still fits in a single bulk group, but a range reader shouldn't
    // have to pull all of it to see the first rows.
    assert.deepEqual(groupsFor(100, 100000), [10, 90]);
  });

  it('turns the same row count into different groups as rows get bigger', function() {
    assert.equal(groupsFor(100000, 20).length, 1);
    assert.ok(groupsFor(100000, 20000).length > groupsFor(100000, 200).length);
  });

  it('holds bulk groups near the byte target', function() {
    var groups = groupsFor(100000, 20000).slice(1);
    groups.forEach(function(rows) {
      assert.ok(rows * 20000 <= ROW_GROUP_TARGET_BYTES,
        'group of ' + rows + ' rows exceeds the target');
    });
    // ...and not so far under it that the file is fragmented.
    assert.ok(groups[0] * 20000 > ROW_GROUP_TARGET_BYTES / 4,
      'groups are much smaller than the target');
  });

  it('evens out the bulk groups instead of leaving a runt', function() {
    // 20001 bulk rows of 20000 bytes would split as 23 groups of 838 rows
    // followed by 727. Rounding the size down spreads that tail out.
    var bulk = groupsFor(20053, 20000).slice(1);
    assert.ok(bulk.length > 1, 'expected several bulk groups, got ' + bulk.length);
    // A constant group size can't divide the rows exactly, but the shortfall
    // in the last group is bounded by the number of groups.
    assert.ok(Math.max.apply(null, bulk) - Math.min.apply(null, bulk) < bulk.length,
      'uneven bulk groups: ' + bulk.join(', '));
  });

  it('keeps the preview group around a megabyte', function() {
    [20, 200, 20000].forEach(function(bytesPerRow) {
      var preview = groupsFor(1000000, bytesPerRow)[0];
      assert.ok(preview * bytesPerRow <= 2 * MB,
        bytesPerRow + ' bytes/row gave a ' + preview * bytesPerRow + ' byte preview');
    });
  });

  it('caps the row count so a narrow table does not make unwieldy groups', function() {
    // A byte target alone would put 16 million 1-byte rows in a group.
    var groups = groupsFor(3000000, 1);
    assert.equal(groups.reduce(function(a, b) { return a + b; }), 3000000);
    groups.forEach(function(rows) {
      assert.ok(rows <= 1000000, 'group of ' + rows + ' rows exceeds the row cap');
    });
  });

  it('always makes progress, even when a single row exceeds the target', function() {
    assert.deepEqual(groupsFor(3, 400 * MB), [1, 1, 1]);
  });
});

// Rows are converted and handed to the writer one row group at a time, so the
// group boundaries must not be able to affect the contents.
describe('geoparquet row group boundaries', function() {
  it('writes the same rows however the layer is divided into groups', async function() {
    var input = polygonCollection(60, 8);
    input.features.forEach(function(feat, i) {
      // a mix of types, plus nulls that fall in different groups
      feat.properties.name = i % 5 === 0 ? null : 'row ' + i;
      feat.properties.ratio = i % 3 === 0 ? null : i / 4;
      feat.properties.flag = i % 2 === 0;
    });
    var layers = [];
    for (var opt of ['rowgroup=1', 'rowgroup=7', 'rowgroup=59', 'rowgroup=1000', '']) {
      var output = await api.applyCommands(
        '-i in.json -o format=geoparquet' + (opt ? ' ' + opt : ''), {'in.json': input});
      var name = Object.keys(output)[0];
      var dataset = await api.internal.importContentAsync({
        parquet: {filename: name, content: output[name]}
      }, {});
      layers.push(dataset.layers[0]);
    }
    layers.forEach(function(lyr) {
      assert.deepEqual(lyr.data.getRecords(), layers[0].data.getRecords());
      assert.deepEqual(lyr.shapes, layers[0].shapes);
    });
    assert.equal(layers[0].data.getRecords().length, 60);
  });

  it('applies -o precision= to exported coordinates', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {id: 1},
        geometry: {type: 'LineString', coordinates: [[0, 0], [1.23456789, 1.23456789]]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=geoparquet precision=0.001', {
      'in.json': input
    });
    var name = Object.keys(output)[0];
    var dataset = await api.internal.importContentAsync({
      parquet: {filename: name, content: output[name]}
    }, {});
    var files = api.internal.exportFileContent(dataset, {format: 'geojson'});
    var geom = JSON.parse(String(files[0].content)).features[0].geometry;

    assert.deepEqual(geom.coordinates, [[0, 0], [1.235, 1.235]]);
  });

  it('keeps a feature whose geometry collapses at the output precision', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'kept'},
        geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]}
      }, {
        type: 'Feature',
        properties: {name: 'collapsed'},
        geometry: {type: 'LineString', coordinates: [[2, 2], [2.0000001, 2.0000001]]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=geoparquet precision=0.000001', {
      'in.json': input
    });
    var name = Object.keys(output)[0];
    var dataset = await api.internal.importContentAsync({
      parquet: {filename: name, content: output[name]}
    }, {});
    var lyr = dataset.layers[0];

    assert.equal(lyr.shapes.length, 2);
    assert.deepEqual(lyr.data.getRecords().map(rec => rec.name), ['kept', 'collapsed']);
    assert.deepEqual(lyr.shapes[1], null);
  });
});

describe('geoparquet geospatial statistics', function() {
  // hyparquet-writer picks each thrift wire type from the runtime value, so a
  // bounding box bound that lands on a whole number goes out as I32 where the
  // spec requires a double. hyparquet reads such a file back without complaint,
  // but pyarrow 21+ and GDAL 3.11+ cannot deserialize the footer at all, so
  // these tests check the encoded bounds rather than a round trip.
  it('keeps whole-number bounds off the integer thrift type', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [
        {type: 'Feature', properties: {id: 1}, geometry: {type: 'Point', coordinates: [1, 2]}},
        {type: 'Feature', properties: {id: 2}, geometry: {type: 'Point', coordinates: [3, 4]}}
      ]
    };
    var boxes = getBoundingBoxes(await writeAndReadMetadata(input));
    assert.equal(boxes.length, 1);
    assertBoundsAreDoubles(boxes[0]);
    // still a cover of the two points, and only just
    assert.ok(boxes[0].xmin <= 1 && boxes[0].xmax >= 3);
    assert.ok(boxes[0].ymin <= 2 && boxes[0].ymax >= 4);
    assert.ok(boxes[0].xmin > 0.99 && boxes[0].xmax < 3.01);
  });

  it('fixes the bounds in every row group', async function() {
    var metadata = await writeAndReadMetadata(pointCollection(1000), 'rowgroup=250');
    var boxes = getBoundingBoxes(metadata);
    assert.equal(boxes.length, 4);
    boxes.forEach(assertBoundsAreDoubles);
  });
});

function assertBoundsAreDoubles(bbox) {
  Object.keys(bbox).forEach(function(key) {
    assert.ok(!Number.isInteger(bbox[key]),
      'expected ' + key + ' to be encoded as a double, got ' + bbox[key]);
  });
}

function getBoundingBoxes(metadata) {
  var boxes = [];
  (metadata.row_groups || []).forEach(function(rowGroup) {
    (rowGroup.columns || []).forEach(function(column) {
      var stats = column.meta_data && column.meta_data.geospatial_statistics;
      if (stats && stats.bbox) boxes.push(stats.bbox);
    });
  });
  return boxes;
}

async function writeAndReadMetadata(input, extraOpts) {
  var cmd = '-i in.json -o format=geoparquet' + (extraOpts ? ' ' + extraOpts : '');
  var output = await api.applyCommands(cmd, {'in.json': input});
  return parquetMetadataAsync(toArrayBuffer(output[Object.keys(output)[0]]));
}

function pointCollection(n) {
  var features = [];
  for (var i = 0; i < n; i++) {
    features.push({
      type: 'Feature',
      properties: {id: i},
      geometry: {type: 'Point', coordinates: [-179 + (i * 37) % 358, -84 + (i * 13) % 168]}
    });
  }
  return {type: 'FeatureCollection', features: features};
}

function polygonCollection(n, vertices) {
  var features = [];
  for (var i = 0; i < n; i++) {
    var cx = -179 + (i * 37) % 358, cy = -84 + (i * 13) % 168;
    var ring = [];
    for (var j = 0; j < vertices; j++) {
      var a = 2 * Math.PI * j / vertices;
      ring.push([+(cx + 0.4 * Math.cos(a)).toFixed(6), +(cy + 0.4 * Math.sin(a)).toFixed(6)]);
    }
    ring.push(ring[0]);
    features.push({
      type: 'Feature',
      properties: {id: i},
      geometry: {type: 'Polygon', coordinates: [ring]}
    });
  }
  return {type: 'FeatureCollection', features: features};
}

// Coordinates inside UTM zone 15, so that -proj EPSG:26915 keeps the geometry.
function utmPointCollection(properties) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: properties || {id: 1},
      geometry: {type: 'Point', coordinates: [-93, 41]}
    }]
  };
}

function getParquetKeyValue(metadata, key) {
  var entry = (metadata.key_value_metadata || []).find(function(item) {
    return item.key == key;
  });
  return entry ? entry.value : null;
}

function getParquetCodecs(metadata) {
  var index = {};
  (metadata.row_groups || []).forEach(function(rowGroup) {
    (rowGroup.columns || []).forEach(function(column) {
      index[column.meta_data && column.meta_data.codec] = true;
    });
  });
  return Object.keys(index).sort();
}

function getParquetFieldNames(metadata) {
  return metadata.schema.map(function(field) {
    return field.name;
  });
}

function toArrayBuffer(content) {
  if (content instanceof ArrayBuffer) return content;
  if (content instanceof Uint8Array) {
    return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
  }
  return content;
}
