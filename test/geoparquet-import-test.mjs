import assert from 'assert';
import { createRequire } from 'module';
import api from '../mapshaper.js';
import {
  convertGeoParquetRows,
  parseGeoParquetMetadata,
  getGeoParquetAuthority
} from '../src/geoparquet/mapshaper-geoparquet-import';
import { fixPath, captureLogCallsAsync } from './helpers';
import { setLoggingFunctions, getLoggingSetter } from '../src/utils/mapshaper-logging';

var nodeRequire = createRequire(import.meta.url);

describe('geoparquet import helpers', function () {
  it('keeps projected point coordinates unchanged', function () {
    var rows = [{
      geom: {type: 'Point', coordinates: [500000, 4500000]},
      name: 'alpha',
      value: 10
    }, {
      geom: {type: 'Point', coordinates: [510000, 4510000]},
      name: 'beta',
      value: 20
    }];
    var geo = {
      primary_column: 'geom',
      columns: {
        geom: {encoding: 'WKB'}
      }
    };
    var dataset = convertGeoParquetRows(rows, geo, {no_topology: true});
    var layer = dataset.layers[0];
    assert.equal(layer.geometry_type, 'point');
    assert.deepEqual(layer.shapes[0][0], [500000, 4500000]);
    assert.deepEqual(layer.shapes[1][0], [510000, 4510000]);
    assert.deepEqual(layer.data.getRecords(), [
      {name: 'alpha', value: 10},
      {name: 'beta', value: 20}
    ]);
  });

  it('parses geo metadata from parquet metadata key-value entries', function () {
    var metadata = {
      key_value_metadata: [{
        key: 'geo',
        value: JSON.stringify({
          version: '1.0.0',
          primary_column: 'geom',
          columns: {
            geom: {
              encoding: 'WKB',
              crs: {
                id: {
                  authority: 'EPSG',
                  code: 2269
                }
              }
            }
          }
        })
      }]
    };
    var geo = parseGeoParquetMetadata(metadata);
    assert.equal(geo.primary_column, 'geom');
    assert.equal(geo.columns.geom.encoding, 'WKB');
    assert.equal(geo.columns.geom.crs.id.authority, 'EPSG');
    assert.equal(geo.columns.geom.crs.id.code, 2269);
  });

  it('finds authority codes nested in CRS metadata', function () {
    var crs = {
      type: 'ProjectedCRS',
      base_crs: {
        id: {
          authority: 'EPSG',
          code: 4326
        }
      }
    };
    assert.deepEqual(getGeoParquetAuthority(crs), {org: 'EPSG', code: 4326});
  });

  it('converts safe BigInt attribute values to Numbers without warning', function () {
    var rows = [{
      geom: {type: 'Point', coordinates: [1, 2]},
      id: 42n
    }];
    var geo = {
      primary_column: 'geom',
      columns: {geom: {encoding: 'WKB'}}
    };
    var restore = getLoggingSetter();
    var warnings = [];
    setLoggingFunctions(
      function() {},
      function() {},
      function() {},
      function() { warnings.push(Array.prototype.join.call(arguments, ' ')); }
    );
    try {
      var dataset = convertGeoParquetRows(rows, geo, {no_topology: true});
      var records = dataset.layers[0].data.getRecords();
      assert.equal(records[0].id, 42);
      assert.equal(typeof records[0].id, 'number');
    } finally {
      restore();
    }
    assert.equal(warnings.length, 0);
  });

  it('warns when BigInt attribute conversion loses precision', function () {
    var rows = [{
      geom: {type: 'Point', coordinates: [1, 2]},
      id: 9007199254740993n // Number.MAX_SAFE_INTEGER + 2
    }];
    var geo = {
      primary_column: 'geom',
      columns: {geom: {encoding: 'WKB'}}
    };
    var restore = getLoggingSetter();
    var warnings = [];
    setLoggingFunctions(
      function() {},
      function() {},
      function() {},
      function() { warnings.push(Array.prototype.join.call(arguments, ' ')); }
    );
    try {
      var dataset = convertGeoParquetRows(rows, geo, {no_topology: true});
      var records = dataset.layers[0].data.getRecords();
      assert.equal(typeof records[0].id, 'number');
      assert.equal(records[0].id, 9007199254740992);
    } finally {
      restore();
    }
    var msg = warnings.join('\n');
    assert(/Number\.MAX_SAFE_INTEGER/.test(msg), msg);
    assert(/precision will be lost/.test(msg), msg);
  });
});

describe('geoparquet fixture import', function () {
  it('imports WKB-encoded geometry fixtures with geometry intact', async function () {
    var dataset = await api.internal.importFileAsync(
      fixPath('data/geoparquet/data-point-encoding_wkb.parquet'),
      {}
    );
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].geometry_type, 'point');
    assert.equal(dataset.layers[0].shapes.length, 4);
    assert.equal(dataset.layers[0].data.size(), 4);
  });

  it('warns and imports attribute-only when only native geometry encoding is present', async function () {
    var out = await captureLogCallsAsync(async function() {
      return api.internal.importFileAsync(
        fixPath('data/geoparquet/data-point-encoding_native.parquet'),
        {}
      );
    });
    var dataset = out.result;
    var warning = out.log.join('\n');
    assert(/native encodings are not supported/i.test(warning), warning);
    assert(/WKB/i.test(warning), warning);
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].geometry_type, null);
    assert.equal(dataset.layers[0].shapes, undefined);
    assert.equal(dataset.layers[0].data.size(), 4);
  });

  it('imports CRS variants from example-crs_vermont fixtures', async function () {
    var cases = [
      {
        file: 'data/geoparquet/example-crs_vermont-4326_geo.parquet',
        crsString: 'epsg:4326',
        hasCrsMetadata: true
      },
      {
        file: 'data/geoparquet/example-crs_vermont-utm_geo.parquet',
        crsString: 'epsg:32618',
        hasCrsMetadata: true
      },
      {
        file: 'data/geoparquet/example-crs_vermont-custom_geo.parquet',
        crsString: '+proj=ortho +lat_0=43.88 +lon_0=-72.69 +ellps=WGS84 +no_defs',
        hasCrsMetadata: true
      },
      {
        file: 'data/geoparquet/example-crs_vermont-crs84_geo.parquet',
        crsString: '+proj=longlat +datum=WGS84',
        hasCrsMetadata: true
      },
      {
        file: 'data/geoparquet/example-crs_vermont-crs84-unknown.parquet',
        crsString: null,
        hasCrsMetadata: false
      },
      {
        file: 'data/geoparquet/example-crs_vermont-crs84-auth-code.parquet',
        crsString: null,
        hasCrsMetadata: false
      },
      {
        file: 'data/geoparquet/example-crs_vermont-crs84-wkt2.parquet',
        crsString: null,
        hasCrsMetadata: false
      }
    ];

    for (var i = 0; i < cases.length; i++) {
      var testCase = cases[i];
      var dataset = await api.internal.importFileAsync(fixPath(testCase.file), {});
      assert.equal(dataset.layers.length, 1);
      assert.equal(dataset.layers[0].geometry_type, 'polygon');
      assert.equal(dataset.info.crs_string || null, testCase.crsString, testCase.file);
      assert.equal(!!dataset.info.geoparquet_crs, testCase.hasCrsMetadata, testCase.file);
    }
  });

  it('falls back to PROJJSON when EPSG CRS cannot be resolved', async function () {
    var mproj = nodeRequire('mproj');
    var original = mproj.pj_init;
    mproj.pj_init = function(defn) {
      if (typeof defn == 'string' && /(^epsg:|\+init=epsg:)/i.test(defn)) {
        throw new Error('EPSG lookup failed');
      }
      return original.apply(this, arguments);
    };
    try {
      var dataset = await api.internal.importFileAsync(
        fixPath('data/geoparquet/example-crs_vermont-4326_geo.parquet'),
        {}
      );
      assert.equal(dataset.info.crs_string, '+proj=longlat +datum=WGS84');
    } finally {
      mproj.pj_init = original;
    }
  });

});
