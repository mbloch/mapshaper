import api from '../mapshaper.js';
import assert from 'assert';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

var internal = api.internal;

// A Terrarium tile with a constant elevation (256px by default)
function makeTerrariumTile(elevation, size) {
  var png = new PNG({width: size || 256, height: size || 256});
  var v = elevation + 32768;
  var r = Math.floor(v / 256);
  var g = Math.floor(v) % 256;
  var b = Math.round((v - Math.floor(v)) * 256);
  for (var i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

// A JPEG imagery tile of one color
function makeImageTile(r, g, b) {
  var size = 256;
  var data = Buffer.alloc(size * size * 4);
  for (var i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return jpeg.encode({data: data, width: size, height: size}, 95).data;
}

// Replaces global fetch() with a tile server
// @getTile function(url) returning PNG bytes, or null for a 404
function stubFetch(getTile, header) {
  var original = globalThis.fetch;
  var urls = [];
  globalThis.fetch = async function(url) {
    var buf = getTile(url);
    urls.push(url);
    return {
      status: buf ? 200 : 404,
      ok: !!buf,
      headers: {get: function() { return header || null; }},
      arrayBuffer: async function() {
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      }
    };
  };
  return {
    urls: urls,
    restore: function() { globalThis.fetch = original; }
  };
}

var RAINIER = '-rectangle bbox=-122.1,46.65,-121.4,47.0 name=box ' +
  '-proj +proj=tmerc +lon_0=-121.75 +lat_0=46.8 -frame width=200';

async function runCommands(commands) {
  var job = new internal.Job(new internal.Catalog());
  await internal.runParsedCommands(internal.parseCommands(commands), job);
  return job.catalog;
}

function findLayer(catalog, name) {
  return catalog.getLayers().find(function(o) { return o.layer.name == name; });
}

describe('mapshaper-fetch.mjs', function () {

  describe('tile math', function () {
    it('lonToTileX() and latToTileY()', function () {
      assert.equal(internal.lonToTileX(0, 1), 1);
      assert.equal(internal.lonToTileX(-180, 3), 0);
      assert(Math.abs(internal.latToTileY(0, 1) - 1) < 1e-9);
      assert(Math.abs(internal.latToTileY(85.0511287798066, 4)) < 1e-6);
    })

    it('chooseTileZoom() picks the lowest zoom at least as fine as the output', function () {
      var res10 = internal.getTileGroundResolution(0, 10, 256);
      assert.equal(internal.chooseTileZoom(res10, 0, 256, 0, 15), 10);
      assert.equal(internal.chooseTileZoom(res10 * 0.99, 0, 256, 0, 15), 11);
      assert.equal(internal.chooseTileZoom(0.01, 0, 256, 0, 15), 15);
    })

    it('getCircularLonRange() handles the antimeridian and world-scale extents', function () {
      assert.deepEqual(internal.getCircularLonRange([-120, -122, -121]), [-122, -120]);
      assert.deepEqual(internal.getCircularLonRange([170, -170, 175]), [170, 190]);
      var world = [];
      for (var lon = -180; lon < 180; lon += 18) world.push(lon);
      assert.deepEqual(internal.getCircularLonRange(world), [-180, 180]);
    })

    it('getTileRange() can extend past the east edge of the world', function () {
      var range = internal.getTileRange([170, 0, 190, 10], 3);
      assert.equal(range.x0, 7);
      assert.equal(range.x1, 8);
      assert.equal(internal.wrapTileX(range.x1, 3), 0);
      assert.equal(internal.countTiles(range), 2);
    })
  })

  describe('decodeElevationPixels()', function () {
    it('terrarium and mapbox encodings', function () {
      assert.deepEqual(Array.from(internal.decodeElevationPixels([128, 0, 0, 255, 129, 44, 128, 255], 'terrarium', -1)),
        [0, 300.5]);
      assert.deepEqual(Array.from(internal.decodeElevationPixels([1, 134, 160, 255], 'mapbox', -1)), [0]);
    })

    it('transparent pixels are nodata', function () {
      assert.deepEqual(Array.from(internal.decodeElevationPixels([128, 0, 0, 0], 'terrarium', -32768)), [-32768]);
    })
  })

  describe('resolveFetchSource()', function () {
    it('tilezen preset', function () {
      var source = internal.resolveFetchSource({source: 'tilezen'});
      assert.equal(source.id, 'tilezen');
      assert.equal(source.encoding, 'terrarium');
      assert.equal(source.max_zoom, 15);
    })

    it('mapterhorn preset', function () {
      var source = internal.resolveFetchSource({source: 'mapterhorn'});
      assert.equal(source.tile_size, 512);
      assert.equal(source.encoding, 'terrarium');
      assert.equal(source.auto_max_zoom, 12);
      assert(source.attribution);
    })

    it('custom URL, with overrides', function () {
      var source = internal.resolveFetchSource({source: 'https://example.com/{z}/{x}/{y}.png', encoding: 'mapbox', scheme: 'tms'});
      assert.equal(source.id, 'custom');
      assert.equal(source.encoding, 'mapbox');
      assert.equal(internal.getTileUrl(source, 2, 1, 0), 'https://example.com/2/1/3.png');
    })

    it('errors', function () {
      assert.throws(function() { internal.resolveFetchSource({}); }, /Missing a source/);
      assert.throws(function() { internal.resolveFetchSource({source: 'nope'}); }, /Unknown source/);
      assert.throws(function() { internal.resolveFetchSource({source: 'https://example.com/{z}/{x}.png'}); }, /\{y\}/);
      assert.throws(function() { internal.resolveFetchSource({source: 'tilezen', encoding: 'foo'}); }, /encoding/);
    })

    it('imagery presets', function () {
      var bluemarble = internal.resolveFetchSource({source: 'bluemarble'});
      var usgs = internal.resolveFetchSource({source: 'usgs'});
      assert.equal(bluemarble.encoding, 'rgb');
      assert.equal(bluemarble.max_zoom, 8);
      assert.equal(internal.getTileUrl(bluemarble, 3, 4, 2),
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/3/2/4.jpeg');
      assert.equal(usgs.encoding, 'rgb');
      assert(usgs.credit);
    })

    it('year= chooses an edition, and defaults to the latest', function () {
      var black = internal.resolveFetchSource({source: 'blackmarble'});
      var black2012 = internal.resolveFetchSource({source: 'blackmarble', year: 2012});
      var eox = internal.resolveFetchSource({source: 'eox'});
      var eox2016 = internal.resolveFetchSource({source: 'eox', year: 2016});
      var eox2020 = internal.resolveFetchSource({source: 'eox', year: 2020});
      assert.equal(black.year, 2016);
      assert(/\/2016-01-01\//.test(black.url));
      assert(/\/2012-01-01\//.test(black2012.url));
      assert.equal(eox.year, 2025);
      assert(/s2cloudless-2025_3857/.test(eox.url));
      assert(eox.non_commercial);
      assert(/Sentinel data 2025\)/.test(eox.attribution));
      assert(/\/s2cloudless_3857\//.test(eox2016.url));
      assert(!eox2016.non_commercial);
      assert(/s2cloudless-2020_3857/.test(eox2020.url));
      assert.equal(eox.years, undefined);
    })

    it('year= errors', function () {
      assert.throws(function() { internal.resolveFetchSource({source: 'eox', year: 2017}); }, /Available years: 2016, 2018/);
      assert.throws(function() { internal.resolveFetchSource({source: 'tilezen', year: 2020}); }, /year= is not available/);
      assert.throws(function() { internal.resolveFetchSource({source: 'https://example.com/{z}/{x}/{y}.png', year: 2020}); }, /year= is not available/);
    })
  })

  describe('Tilezen sources header', function () {
    it('finds datasets that require attribution', function () {
      var names = internal.parseTilezenSourcesHeader('srtm/N46W122.tif, eudem/x.tif,gmted/y.tif');
      assert.deepEqual(names, ['srtm', 'eudem', 'gmted']);
      assert.deepEqual(internal.findRestrictedTilezenSources(names), ['eudem']);
    })
  })

  describe('decodeWebP()', function () {
    // Generated with cwebp -lossless from images with known pixels
    var TERRAIN = 'UklGRkQAAABXRUJQVlA4TDcAAAAvC8ABALmM6H/sIqL/AYNsI9HU4YXmD/EHISAostz1iAm4+eIHxBTFFECemEFMQfHFD4gpIqYAAA==';
    var PALETTE = 'UklGRjwAAABXRUJQVlA4TDAAAAAvCAABABcgEEhxEGMuFkwA5q/am0AgiWR/rU3mP2xyA5mAZQ4pVm9lRPQ/eGU3vDI=';

    it('decodes Terrarium-encoded elevations exactly', function () {
      var img = internal.decodeWebP(Buffer.from(TERRAIN, 'base64'));
      var elev = internal.decodeElevationPixels(img.rgba, 'terrarium', -32768);
      assert.equal(img.width, 12);
      assert.equal(img.height, 8);
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 12; x++) {
          assert.equal(elev[y * 12 + x], x * 37 + y * 101 - 200);
        }
      }
    })

    it('decodes palette images', function () {
      var colors = [[255, 0, 0, 255], [0, 128, 255, 255], [10, 20, 30, 255]];
      var img = internal.decodeWebP(Buffer.from(PALETTE, 'base64'));
      for (var y = 0; y < 5; y++) {
        for (var x = 0; x < 9; x++) {
          var i = (y * 9 + x) * 4;
          assert.deepEqual(Array.from(img.rgba.subarray(i, i + 4)), colors[(x + 2 * y) % 3]);
        }
      }
    })

    it('isWebP() recognizes WebP files', function () {
      assert(internal.isWebP(Buffer.from(TERRAIN, 'base64')));
      assert(!internal.isWebP(PNG.sync.write(new PNG({width: 1, height: 1}))));
    })
  })

  describe('averageGridPixels()', function () {
    it('averages valid pixels in blocks and marks empty blocks as nodata', function () {
      var grid = {
        width: 4, height: 2, bands: 1, pixelType: 'float32', nodata: -1,
        samples: Float32Array.from([1, 3, -1, -1, 5, 7, -1, -1]),
        bbox: [0, 0, 4, 2], transform: [1, 0, 0, 0, -1, 2]
      };
      var out = internal.averageGridPixels(grid, 2);
      assert.equal(out.width, 2);
      assert.equal(out.height, 1);
      assert.deepEqual(Array.from(out.samples), [4, -1]);
      assert.deepEqual(Array.from(out.coverage), [1, 0]);
      assert.deepEqual(out.transform, [2, 0, 0, 0, -2, 2]);
    })
  })

  describe('-fetch command', function () {
    var stub;
    afterEach(function() {
      if (stub) stub.restore();
      stub = null;
    })

    it('fetches tiles for a frame and reprojects them to the frame', async function () {
      var tile = makeTerrariumTile(500);
      stub = stubFetch(function() { return tile; }, 'srtm/N46W122.tif');
      var catalog = await runCommands(RAINIER + ' -fetch tilezen');
      var elev = findLayer(catalog, 'elevation');
      var box = findLayer(catalog, 'box');
      var grid = elev.layer.raster.grid;
      var mask = internal.getRasterValidityMask(grid);
      var count = 0;
      assert(stub.urls.length > 0);
      stub.urls.forEach(function(url) {
        assert(/^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\/\d+\/\d+\/\d+\.png$/.test(url));
      });
      assert.equal(internal.getDatasetCrsInfo(elev.dataset).crs_string,
        internal.getDatasetCrsInfo(box.dataset).crs_string);
      // 200px frame plus a 10px bleed on each side, at 2 raster pixels per frame pixel
      assert.equal(grid.width, 440);
      assert.equal(elev.dataset.info.raster_sources[0].raster_res, 2);
      for (var i = 0; i < grid.samples.length; i++) {
        if (mask && !mask[i]) continue;
        assert(Math.abs(grid.samples[i] - 500) < 0.01);
        count++;
      }
      assert(count > grid.width * grid.height * 0.9);
      assert(box.dataset.info.frame);
      assert.equal(elev.dataset.info.frame, box.dataset.info.frame);
      assert(elev.layer.menu_order < box.layer.menu_order);
      assert.equal(elev.dataset.info.raster_sources[0].storage, 'remote');
    })

    it('mapterhorn preset: 512px tiles, automatic zoom capped at 12', async function () {
      var tile = makeTerrariumTile(800, 512);
      var zooms;
      stub = stubFetch(function() { return tile; });
      var catalog = await runCommands('-rectangle bbox=7.9,46.5,7.92,46.51 name=box ' +
        '-proj +proj=tmerc +lon_0=7.91 +lat_0=46.5 -frame width=800 -fetch mapterhorn');
      zooms = stub.urls.map(function(url) {
        assert(/^https:\/\/tiles\.mapterhorn\.com\/\d+\/\d+\/\d+\.webp$/.test(url));
        return +url.split('/')[3];
      });
      assert.equal(zooms[0], 12);
      assert(Math.abs(findLayer(catalog, 'elevation').layer.raster.grid.samples[5000] - 800) < 0.01);
    })

    it('-fetch then -hillshade', async function () {
      var tile = makeTerrariumTile(500);
      stub = stubFetch(function() { return tile; });
      var catalog = await runCommands(RAINIER + ' -fetch tilezen -hillshade +');
      assert(findLayer(catalog, 'elevation'));
      assert.equal(findLayer(catalog, 'hillshade').layer.raster.grid.bands, 4);
    })

    it('raster-res= and name=', async function () {
      stub = stubFetch(function() { return makeTerrariumTile(10); });
      var catalog = await runCommands(RAINIER + ' -fetch tilezen raster-res=0.5 bleed=0 name=dem');
      assert.equal(findLayer(catalog, 'dem').layer.raster.grid.width, 100);
    })

    it('zoom= chooses the zoom level', async function () {
      stub = stubFetch(function() { return makeTerrariumTile(10); });
      await runCommands(RAINIER + ' -fetch tilezen zoom=8');
      assert(stub.urls.every(function(url) { return /terrarium\/8\//.test(url); }));
    })

    it('bbox= works without any layers', async function () {
      stub = stubFetch(function() { return makeTerrariumTile(10); });
      var catalog = await runCommands('-fetch tilezen bbox=-122,46.7,-121.5,47 zoom=8');
      var elev = findLayer(catalog, 'elevation');
      assert(internal.isLatLngCRS(internal.getDatasetCRS(elev.dataset)));
    })

    it('missing tiles become nodata', async function () {
      var tile = makeTerrariumTile(500);
      var first;
      stub = stubFetch(function(url) {
        if (!first) first = url;
        return url == first ? null : tile;
      });
      var catalog = await runCommands(RAINIER + ' -fetch tilezen zoom=10');
      var grid = findLayer(catalog, 'elevation').layer.raster.grid;
      assert(stub.urls.length > 1);
      assert(internal.getRasterValidityMask(grid).some(function(v) { return v === 0; }));
    })

    it('imagery: JPEG tiles become an RGB raster in the frame', async function () {
      var tile = makeImageTile(200, 120, 40);
      stub = stubFetch(function() { return tile; });
      var catalog = await runCommands(RAINIER + ' -fetch bluemarble');
      var lyr = findLayer(catalog, 'bluemarble');
      var grid = lyr.layer.raster.grid;
      var i;
      assert(stub.urls.every(function(url) { return /BlueMarble_NextGeneration\/.*\.jpeg$/.test(url); }));
      assert.equal(lyr.layer.raster.interpretation, 'image');
      assert.equal(lyr.layer.raster.view.recipe.type, 'rgb');
      assert.equal(grid.bands, 3);
      assert(grid.samples instanceof Uint8Array);
      assert.equal(grid.width, 440);
      for (i = 0; i < grid.width * grid.height; i += 997) {
        assert(Math.abs(grid.samples[i * 3] - 200) <= 3);
        assert(Math.abs(grid.samples[i * 3 + 1] - 120) <= 3);
        assert(Math.abs(grid.samples[i * 3 + 2] - 40) <= 3);
      }
      assert.equal(findLayer(catalog, 'box').dataset.info.frame, lyr.dataset.info.frame);
    })

    it('imagery: missing tiles are transparent', async function () {
      var tile = makeImageTile(50, 100, 150);
      var first;
      stub = stubFetch(function(url) {
        if (!first) first = url;
        return url == first ? null : tile;
      });
      var catalog = await runCommands(RAINIER + ' -fetch usgs zoom=10');
      var grid = findLayer(catalog, 'usgs').layer.raster.grid;
      var transparent = 0, opaque = 0;
      assert.equal(grid.bands, 4);
      for (var i = 3; i < grid.samples.length; i += 4) {
        if (grid.samples[i] === 0) transparent++;
        if (grid.samples[i] == 255) opaque++;
      }
      assert(transparent > 0);
      assert(opaque > 0);
    })

    it('imagery from a URL with encoding=rgb', async function () {
      stub = stubFetch(function() { return makeImageTile(10, 20, 30); });
      var catalog = await runCommands(RAINIER + ' -fetch https://example.com/{z}/{x}/{y}.jpg encoding=rgb zoom=8');
      assert.equal(findLayer(catalog, 'imagery').layer.raster.grid.bands, 3);
    })

    it('fails when no tiles are found', async function () {
      stub = stubFetch(function() { return null; });
      await assert.rejects(runCommands(RAINIER + ' -fetch tilezen'), /No tiles/);
    })

    it('fails when too many tiles are needed', async function () {
      stub = stubFetch(function() { return makeTerrariumTile(10); });
      await assert.rejects(runCommands(RAINIER + ' -fetch tilezen zoom=15 max-tiles=10'), /more than the limit/);
      assert.equal(stub.urls.length, 0);
    })

    it('fails without an area to fetch', async function () {
      await assert.rejects(runCommands('-fetch tilezen'), /area to fetch/);
    })
  })
})
