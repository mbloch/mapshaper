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

// A JPEG imagery tile of one color (256px by default)
function makeImageTile(r, g, b, size) {
  size = size || 256;
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
// @getTile function(url, init) returning image bytes, a JSON object, or null
//   for a 404
function stubFetch(getTile, header) {
  var original = globalThis.fetch;
  var urls = [];
  globalThis.fetch = async function(url, init) {
    var buf = getTile(url, init);
    urls.push(url);
    return {
      status: buf ? 200 : 404,
      ok: !!buf,
      headers: {get: function() { return header || null; }},
      json: async function() { return buf; },
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

    it('Planetary Computer presets', function () {
      var naip = internal.resolveFetchSource({source: 'naip'});
      var naip2021 = internal.resolveFetchSource({source: 'naip', year: 2021});
      var cir = internal.resolveFetchSource({source: 'naip-cir'});
      var s2 = internal.resolveFetchSource({source: 'sentinel2'});
      var s2y = internal.resolveFetchSource({source: 'sentinel2', year: 2020});
      var cop = internal.resolveFetchSource({source: 'copernicus'});
      assert.equal(naip.adapter, 'planetary-computer');
      assert.equal(naip.tile_size, 512);
      assert.equal(naip.year, null);
      assert.equal(naip2021.year, 2021);
      assert(decodeURIComponent(cir.tile_params).includes('image|4,1,2'));
      assert.equal(cir.layer_name, 'naip_cir');
      assert.equal(s2.year, internal.getCurrentYear() - 1);
      assert.equal(s2y.attribution, 'Contains modified Copernicus Sentinel data 2020');
      assert.equal(cop.encoding, 'terrarium');
      assert.equal(internal.resolveFetchSource({source: '3dep'}).layer_name, 'elevation');
      assert.equal(internal.resolveFetchSource({source: 'landsat'}).encoding, 'rgb');
    })

    it('getFetchSourceList() lists every preset under ELEVATION or IMAGERY', function () {
      var lines = internal.getFetchSourceList();
      var text = internal.formatFetchSourceList(lines);
      var imagery = lines.indexOf('IMAGERY');
      var rowIndex = function(name) { return lines.findIndex(function(o) { return o[0] === name; }); };
      assert.equal(lines[0], 'ELEVATION');
      internal.getFetchPresetNames().forEach(function(name) {
        assert(new RegExp('^' + name + ' ', 'm').test(text), name);
        assert.equal(lines[rowIndex(name) + 1][0], '');
      });
      assert(rowIndex('copernicus') < imagery);
      assert(rowIndex('naip') > imagery);
      assert(!/undefined|\{year\}|\{season\}/.test(text));
      assert(/Conterminous United States, 0\.3-1 m; year= 2010 and later \(default: newest\); zoom 11 and up; public domain/.test(text));
      assert(/year= 2012, 2016 \(default: 2016\)/.test(text));
    })

    it('-fetch sources prints the list without fetching', async function () {
      var stub = stubFetch(function() { return null; });
      try {
        var catalog = await runCommands('-fetch sources');
        assert.equal(stub.urls.length, 0);
        assert.equal(catalog.getLayers().length, 0);
      } finally {
        stub.restore();
      }
    })

    it('Planetary Computer year= errors', function () {
      assert.throws(function() { internal.resolveFetchSource({source: 'sentinel2', year: 2012}); }, /Available years: 2016-/);
      assert.throws(function() { internal.resolveFetchSource({source: 'naip', year: internal.getCurrentYear() + 1}); }, /not available/);
      assert.throws(function() { internal.resolveFetchSource({source: 'copernicus', year: 2020}); }, /year= is not available/);
    })

    it('a custom URL can use {bbox-epsg-3857} instead of {z}/{x}/{y}', function () {
      var source = internal.resolveFetchSource({source: 'https://example.com/wms?BBOX={bbox-epsg-3857}&WIDTH=256', encoding: 'rgb'});
      assert.equal(internal.getTileUrl(source, 1, 0, 1), 'https://example.com/wms?BBOX=-20037508.342789244,-20037508.342789244,0,0&WIDTH=256');
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

  describe('Planetary Computer', function () {
    var stub;
    afterEach(function() {
      if (stub) stub.restore();
      stub = null;
    })

    var NAIP_ITEMS = [
      {'naip:state': 'wa', 'naip:year': 2021, datetime: '2021-07-20T16:00:00Z', gsd: 0.6},
      {'naip:state': 'wa', 'naip:year': 2023, datetime: '2023-08-02T16:00:00Z', gsd: 0.3},
      {'naip:state': 'wa', 'naip:year': 2023, datetime: '2023-08-19T16:00:00Z', gsd: 0.3},
      {'naip:state': 'or', 'naip:year': 2022, datetime: '2022-06-30T16:00:00Z', gsd: 0.6}
    ];

    // Stands in for the mosaic registration, the item search and the tiles
    function stubPlanetaryComputer(items, tile) {
      var searches = [];
      stub = stubFetch(function(url, init) {
        if (/\/mosaic\/register$/.test(url)) {
          searches.push(JSON.parse(init.body));
          return {searchid: 'abc'};
        }
        if (/\/stac\/v1\/search$/.test(url)) {
          return items ? {features: items.map(function(o) { return {properties: o}; }), links: []} : null;
        }
        return tile;
      });
      return searches;
    }

    it('mosaic searches', function () {
      var bbox = [-122, 46.6, -121.4, 47];
      var naip = internal.getMosaicSearch(internal.resolveFetchSource({source: 'naip', year: 2021}), bbox);
      var s2 = internal.getMosaicSearch(internal.resolveFetchSource({source: 'sentinel2', year: 2024}), bbox);
      var s2south = internal.getMosaicSearch(internal.resolveFetchSource({source: 'sentinel2', year: 2024}), [170, -44, 171, -43]);
      var landsat = internal.getMosaicSearch(internal.resolveFetchSource({source: 'landsat', year: 2024}), bbox);
      var dep = internal.getMosaicSearch(internal.resolveFetchSource({source: '3dep'}), bbox);
      assert.deepEqual(naip, {
        collections: ['naip'],
        sortby: [{field: 'datetime', direction: 'desc'}],
        'filter-lang': 'cql2-json',
        filter: {op: '=', args: [{property: 'naip:year'}, '2021']}
      });
      assert.deepEqual(s2.filter.args[0].args[1].interval, ['2024-06-01T00:00:00Z', '2024-09-30T23:59:59Z']);
      assert.deepEqual(s2.filter.args[1], {op: '<=', args: [{property: 'eo:cloud_cover'}, 10]});
      assert.deepEqual(s2.sortby, [{field: 'eo:cloud_cover', direction: 'asc'}]);
      assert.deepEqual(s2south.filter.args[0].args[1].interval, ['2023-12-01T00:00:00Z', '2024-03-31T23:59:59Z']);
      assert.equal(landsat.filter.args[0].args[0].property, 'platform');
      assert(!landsat.filter.args[0].args[1].includes('landsat-7'));
      assert.deepEqual(dep.filter, {op: '=', args: [{property: 'gsd'}, 10]});
      assert.equal(internal.getSeason(2024, 5).label, '2024');
    })

    it('summaries', function () {
      var states = internal.summarizeByState(NAIP_ITEMS, true);
      var scenes = internal.summarizeScenes([{datetime: '2024-07-03T18:00:00Z'}, {datetime: '2024-06-10T18:00:00Z'}], false);
      assert.deepEqual(states.groups[0], {state: 'WA', year: 2021, start: '2021-07-20', end: '2021-07-20', images: 1, resolution: 0.6});
      assert.deepEqual(internal.formatAcquisitions(states), [
        '2021 (WA, 0.6 m): 2021-07-20',
        '2022 (OR, 0.6 m): 2022-06-30',
        '2023 (WA, 0.3 m): 2023-08-02 to 2023-08-19'
      ]);
      assert.deepEqual(internal.formatAcquisitions(scenes), [
        '2 (or more) scenes with 10% cloud cover or less, acquired 2024-06-10 to 2024-07-03; the least cloudy are drawn first'
      ]);
    })

    it('-fetch naip: newest imagery of each state, from a registered mosaic', async function () {
      var searches = stubPlanetaryComputer(NAIP_ITEMS, makeImageTile(60, 90, 50, 512));
      var catalog = await runCommands(RAINIER + ' -fetch naip zoom=11');
      var info = findLayer(catalog, 'naip').dataset.info.raster_sources[0];
      var tileUrls = stub.urls.filter(function(url) { return /\/tiles\//.test(url); });
      assert.equal(searches[0].filter, undefined);
      assert(tileUrls.length > 0);
      assert(tileUrls.every(function(url) {
        return url.startsWith('https://planetarycomputer.microsoft.com/api/data/v1/mosaic/abc/tiles/WebMercatorQuad/11/') &&
          url.includes('@2x?collection=naip&assets=image');
      }));
      assert.equal(info.collection, 'naip');
      assert.deepEqual(info.acquisitions.groups.map(function(g) { return g.state + g.year; }), ['OR2022', 'WA2023']);
    })

    it('-fetch naip year= with no imagery lists the years available', async function () {
      stubPlanetaryComputer(NAIP_ITEMS, makeImageTile(60, 90, 50, 512));
      await assert.rejects(runCommands(RAINIER + ' -fetch naip year=2019 zoom=11'), /Years available here: 2021, 2022, 2023/);
      stub.restore();
      stubPlanetaryComputer([], makeImageTile(60, 90, 50, 512));
      await assert.rejects(runCommands(RAINIER + ' -fetch naip zoom=11'), /Conterminous United States/);
    })

    it('-fetch sentinel2 continues if the item search fails, and stops if no scenes are found', async function () {
      var searches = stubPlanetaryComputer(null, makeImageTile(60, 90, 50, 512));
      var catalog = await runCommands(RAINIER + ' -fetch sentinel2 year=2024 zoom=9');
      assert.equal(findLayer(catalog, 'sentinel2').dataset.info.raster_sources[0].acquisitions, undefined);
      assert.equal(searches[0].sortby[0].field, 'eo:cloud_cover');
      stub.restore();
      stubPlanetaryComputer([], makeImageTile(60, 90, 50, 512));
      await assert.rejects(runCommands(RAINIER + ' -fetch sentinel2 year=2024 zoom=9'), /No Sentinel-2 scenes .* June-September 2024/);
    })

    it('-fetch copernicus: Terrarium elevation tiles', async function () {
      stubPlanetaryComputer(null, makeTerrariumTile(1200, 512));
      var catalog = await runCommands(RAINIER + ' -fetch copernicus zoom=9');
      var grid = findLayer(catalog, 'elevation').layer.raster.grid;
      assert(stub.urls.some(function(url) { return url.includes('collection=cop-dem-glo-30&assets=data&algorithm=terrarium'); }));
      assert(Math.abs(grid.samples[5000] - 1200) < 0.01);
    })

    it('a source whose lowest zoom needs too many tiles', async function () {
      stubPlanetaryComputer(null, makeImageTile(60, 90, 50, 512));
      await assert.rejects(runCommands('-fetch naip bbox=-110,35,-100,45'), /starts at zoom 11/);
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
