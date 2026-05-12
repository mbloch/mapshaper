import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import jpeg from 'jpeg-js';
import os from 'os';
import path from 'path';
import { PNG } from 'pngjs';

var GEOTIFF_FIXTURE = '/Users/matthewbloch/Development/mapshaper/geotiff.js/test/data/rgb.tiff';
var BIG_ENDIAN_DEFLATE_FIXTURE = '/Users/matthewbloch/nytweb/2026/mapshaper/rasters/Sentinel-8bit.tiff';
var LARGE_YCBCR_FIXTURE = '/Users/matthewbloch/nytweb/2026/mapshaper/rasters/f5a3e369-efa2-449d-aa74-6f164d6b9103.tif';

describe('raster layers', function () {
  it('exports raster previews as embedded SVG images', function () {
    var dataset = getRasterDataset();
    var file = api.internal.exportSVG(dataset, {
      format: 'svg',
      margin: 0,
      width: 20
    })[0];
    assert(file.content.includes('<image'));
    assert(file.content.includes('data:image/jpeg;base64,'));
    assert(file.content.includes('preserveAspectRatio="none"'));
  });

  it('rejects raster export to vector and table formats', function () {
    assert.throws(function() {
      api.internal.exportFileContent(getRasterDataset(), {format: 'geojson'});
    }, /Raster layers can only be exported as SVG or/);
  });

  it('clips embedded SVG raster images to a frame layer', function () {
    var dataset = getRasterDataset();
    var frameDataset = getFrameDataset();
    dataset.layers.unshift(frameDataset.layers[0]);
    dataset.arcs = frameDataset.arcs;
    var file = api.internal.exportSVG(dataset, {
      format: 'svg',
      margin: 0
    })[0];
    var data = file.content.match(/data:image\/jpeg;base64,([^"]+)/)[1];
    var image = jpeg.decode(Buffer.from(data, 'base64'));
    assert.equal(image.width, 1);
    assert.equal(image.height, 1);
  });

  it('imports GeoTIFF files when the local geotiff.js fixture exists', async function () {
    if (!fs.existsSync(GEOTIFF_FIXTURE)) this.skip();
    var dataset = await api.internal.importFileAsync(GEOTIFF_FIXTURE, {});
    var lyr = dataset.layers[0];
    assert.equal(dataset.info.input_formats[0], 'geotiff');
    assert.equal(lyr.raster_type, 'grid');
    assert.equal(lyr.raster.grid.width, 541);
    assert.equal(lyr.raster.grid.height, 449);
    assert.equal(lyr.raster.grid.bands, 3);
    assert(lyr.raster.grid.samples instanceof Uint8Array);
    assert(lyr.raster.view.preview.pixels instanceof Uint8ClampedArray);
    assert.deepEqual(lyr.raster.grid.bbox, [11.331755000000001, 32.19025, 28.294810000000002, 46.268645]);
    assert.equal(dataset.info.raster_sources.length, 1);
  });

  it('imports big-endian Deflate GeoTIFFs with deferred strip arrays', async function () {
    if (!fs.existsSync(BIG_ENDIAN_DEFLATE_FIXTURE)) this.skip();
    var dataset = await api.internal.importFileAsync(BIG_ENDIAN_DEFLATE_FIXTURE, {});
    var lyr = dataset.layers[0];
    assert.equal(dataset.info.input_formats[0], 'geotiff');
    assert.equal(lyr.raster_type, 'grid');
    assert.equal(lyr.raster.grid.width, 2500);
    assert.equal(lyr.raster.grid.height, 2057);
    assert.equal(lyr.raster.grid.bands, 3);
    assert(lyr.raster.grid.samples instanceof Uint8Array);
  });

  it('imports large YCbCr GeoTIFFs from an internal overview', async function () {
    this.timeout(10000);
    if (!fs.existsSync(LARGE_YCBCR_FIXTURE)) this.skip();
    var dataset = await api.internal.importFileAsync(LARGE_YCBCR_FIXTURE, {maxPixels: 16e6});
    var lyr = dataset.layers[0];
    assert.equal(dataset.info.input_formats[0], 'geotiff');
    assert.equal(lyr.raster_type, 'grid');
    assert.equal(lyr.raster.grid.width, 6099);
    assert.equal(lyr.raster.grid.height, 2519);
    assert.equal(lyr.raster.grid.bands, 3);
    assert(lyr.raster.grid.samples instanceof Uint8ClampedArray);
  });

  it('imports a selected GeoTIFF rendition', async function () {
    this.timeout(10000);
    if (!fs.existsSync(LARGE_YCBCR_FIXTURE)) this.skip();
    var dataset = await api.internal.importFileAsync(LARGE_YCBCR_FIXTURE, {rendition: 'overview-4'});
    var lyr = dataset.layers[0];
    assert.equal(lyr.raster.grid.width, 3050);
    assert.equal(lyr.raster.grid.height, 1260);
    assert.equal(lyr.raster.grid.bands, 3);
  });

  it('imports PNG rasters with world and projection sidecars', async function () {
    var dataset = await api.internal.importContentAsync(getPngImportGroup(), {});
    var lyr = dataset.layers[0];
    assert.equal(dataset.info.input_formats[0], 'png');
    assert.equal(dataset.info.wkt1, WGS84_PRJ);
    assert.equal(lyr.raster_type, 'grid');
    assert.equal(lyr.raster.grid.width, 2);
    assert.equal(lyr.raster.grid.height, 1);
    assert.equal(lyr.raster.grid.bands, 4);
    assert.deepEqual(lyr.raster.grid.bbox, [100, 190, 120, 200]);
    assert.deepEqual(Array.from(lyr.raster.grid.samples), [
      255, 0, 0, 255,
      0, 0, 255, 128
    ]);
  });

  it('imports PNG raster sidecars from local files', async function () {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapshaper-raster-'));
    var group = getPngImportGroup();
    var filename = path.join(dir, 'image.png');
    try {
      fs.writeFileSync(filename, group.png.content);
      fs.writeFileSync(path.join(dir, 'image.pgw'), group.world.content);
      fs.writeFileSync(path.join(dir, 'image.prj'), group.prj.content);
      var dataset = await api.internal.importFileAsync(filename, {});
      assert.equal(dataset.info.input_formats[0], 'png');
      assert.equal(dataset.info.wkt1, WGS84_PRJ);
      assert.deepEqual(dataset.layers[0].raster.grid.bbox, [100, 190, 120, 200]);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('imports JPEG rasters with a world sidecar and unknown CRS', async function () {
    var dataset = await api.internal.importContentAsync(getJpegImportGroup(), {});
    var lyr = dataset.layers[0];
    assert.equal(dataset.info.input_formats[0], 'jpeg');
    assert.equal(dataset.info.wkt1, undefined);
    assert.equal(lyr.raster.grid.width, 2);
    assert.equal(lyr.raster.grid.height, 1);
    assert.equal(lyr.raster.grid.bands, 3);
    assert.deepEqual(lyr.raster.grid.bbox, [100, 190, 120, 200]);
  });

  it('clips raster samples and bbox to an intersecting rectangle', function () {
    var dataset = getRasterDataset();
    var lyr = dataset.layers[0];
    var clipped = api.internal.clipLayers([lyr], null, dataset, 'clip', {bbox2: [1, 0, 2, 1]})[0];
    assert.equal(clipped.raster.grid.width, 1);
    assert.equal(clipped.raster.grid.height, 1);
    assert.deepEqual(clipped.raster.grid.bbox, [1, 0, 2, 1]);
    assert.deepEqual(Array.from(clipped.raster.grid.samples), [0, 0, 255]);
    assert.deepEqual(Array.from(clipped.raster.view.preview.pixels), [0, 0, 255, 255]);
  });

  it('preserves raster layer when clipping rectangle does not intersect', function () {
    var dataset = getRasterDataset();
    var lyr = dataset.layers[0];
    var clipped = api.internal.clipLayers([lyr], null, dataset, 'clip', {bbox2: [3, 3, 4, 4]})[0];
    assert.equal(clipped, lyr);
    assert.equal(lyr.raster.grid.width, 2);
    assert.deepEqual(Array.from(lyr.raster.grid.samples), [255, 0, 0, 0, 0, 255]);
  });

  it('exports current clipped raster preview to SVG', function () {
    var dataset = getRasterDataset();
    dataset.layers[0] = api.internal.clipLayers(dataset.layers, null, dataset, 'clip', {bbox2: [1, 0, 2, 1]})[0];
    var file = api.internal.exportSVG(dataset, {
      format: 'svg',
      margin: 0,
      width: 20
    })[0];
    var data = file.content.match(/data:image\/jpeg;base64,([^"]+)/)[1];
    var image = jpeg.decode(Buffer.from(data, 'base64'));
    assert.equal(image.width, 1);
    assert.equal(image.height, 1);
  });

  it('packs and unpacks raster grids and previews', async function () {
    var dataset = getRasterDataset();
    var file = (await api.internal.exportPackedDatasets([dataset], {}))[0];
    var session = await api.internal.unpackSessionData(file.content);
    var raster = session.datasets[0].layers[0].raster;
    assert.equal(raster.grid.width, 2);
    assert(raster.grid.samples instanceof Uint8Array);
    assert(raster.view.preview.pixels instanceof Uint8ClampedArray);
    assert.deepEqual(Array.from(raster.grid.samples), [255, 0, 0, 0, 0, 255]);
  });

  it('undo restores raster state after clipping', function () {
    var lyr = getRasterDataset().layers[0];
    var tx = new api.internal.UndoTransaction('clip raster');
    tx.captureLayerBefore(lyr, {operation: 'clip'});
    api.internal.clipRasterToBBox(lyr, [1, 0, 2, 1]);
    var redo = tx.captureCurrentState();
    tx.restore();
    assert.equal(lyr.raster.grid.width, 2);
    assert.deepEqual(Array.from(lyr.raster.grid.samples), [255, 0, 0, 0, 0, 255]);
    api.internal.restoreCapturedUnits(redo);
    assert.equal(lyr.raster.grid.width, 1);
    assert.deepEqual(Array.from(lyr.raster.grid.samples), [0, 0, 255]);
  });

  it('renders uint16 RGB data using the full type range with scaling none', function () {
    var preview = api.internal.renderRasterPreview({
      width: 1,
      height: 1,
      bands: 3,
      pixelType: 'uint16',
      samples: new Uint16Array([0, 32768, 65535]),
      nodata: null
    }, {type: 'rgb', scaling: 'none'}, 1, 1);
    assert.deepEqual(Array.from(preview.pixels), [0, 128, 255, 255]);
  });

  it('renders non-8-bit data with percentile scaling by default', function () {
    var values = new Uint16Array(100);
    for (var i = 0; i < values.length; i++) values[i] = i;
    var preview = api.internal.renderRasterPreview({
      width: 100,
      height: 1,
      bands: 1,
      pixelType: 'uint16',
      samples: values,
      nodata: null
    }, {type: 'gray'}, 100, 1);
    assert.deepEqual(Array.from(preview.pixels.subarray(4, 8)), [0, 0, 0, 255]); // value 1
    assert.deepEqual(Array.from(preview.pixels.subarray(200, 204)), [130, 130, 130, 255]); // value 50
    assert.deepEqual(Array.from(preview.pixels.subarray(388, 392)), [255, 255, 255, 255]); // value 97
  });

  it('renders float percentile scaling using an approximate histogram', function () {
    var values = new Float32Array(100);
    var preview, mid;
    for (var i = 0; i < values.length; i++) values[i] = i;
    preview = api.internal.renderRasterPreview({
      width: 100,
      height: 1,
      bands: 1,
      pixelType: 'float32',
      samples: values,
      nodata: null
    }, {type: 'gray'}, 100, 1);
    mid = preview.pixels[50 * 4];
    assert(mid > 125 && mid < 135);
    assert.equal(preview.pixels[1 * 4], 0);
    assert.equal(preview.pixels[97 * 4], 255);
  });

  it('excludes known nodata values from percentile scaling', function () {
    var values = new Float32Array(101);
    var preview;
    values[0] = -99999;
    for (var i = 1; i < values.length; i++) values[i] = i - 1;
    preview = api.internal.renderRasterPreview({
      width: 101,
      height: 1,
      bands: 1,
      pixelType: 'float32',
      samples: values,
      nodata: -99999
    }, {type: 'gray'}, 101, 1);
    assert.equal(preview.pixels[0], 0);
    assert.equal(preview.pixels[2 * 4], 0); // source value 1
    assert.equal(preview.pixels[98 * 4], 255); // source value 97
  });

  it('renders RGB minmax scaling with a shared range across color bands', function () {
    var preview = api.internal.renderRasterPreview({
      width: 2,
      height: 1,
      bands: 3,
      pixelType: 'uint8',
      samples: new Uint8Array([
        10, 20, 30,
        110, 60, 10
      ]),
      nodata: null
    }, {type: 'rgb', scaling: 'minmax'}, 2, 1);
    assert.deepEqual(Array.from(preview.pixels), [
      0, 26, 51, 255,
      255, 128, 0, 255
    ]);
  });

  it('renders display values within a normalized scale range', function () {
    var preview = api.internal.renderRasterPreview({
      width: 1,
      height: 1,
      bands: 1,
      pixelType: 'uint8',
      samples: new Uint8Array([255]),
      nodata: null
    }, {type: 'gray', scaling: 'none', scaleRange: [0, 50]}, 1, 1);
    assert.deepEqual(Array.from(preview.pixels), [128, 128, 128, 255]);
  });

  it('renders viewport previews from a source raster window', function () {
    var preview = api.internal.renderRasterViewportPreview({
      width: 4,
      height: 4,
      bands: 1,
      pixelType: 'uint8',
      samples: new Uint8Array([
        0, 1, 2, 3,
        4, 5, 6, 7,
        8, 9, 10, 11,
        12, 13, 14, 15
      ]),
      bbox: [0, 0, 4, 4],
      nodata: null
    }, {type: 'gray', scaling: 'none'}, [1, 1, 3, 3], 2, 2);
    assert.deepEqual(preview.bbox, [1, 1, 3, 3]);
    assert.deepEqual(Array.from(preview.pixels), [
      5, 5, 5, 255,
      6, 6, 6, 255,
      9, 9, 9, 255,
      10, 10, 10, 255
    ]);
  });
});

var WGS84_PRJ = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]';
var WORLD_FILE = '10\n0\n0\n-10\n105\n195\n';

function getPngImportGroup() {
  var png = new PNG({width: 2, height: 1});
  png.data.set([
    255, 0, 0, 255,
    0, 0, 255, 128
  ]);
  return {
    png: {
      filename: 'image.png',
      content: PNG.sync.write(png)
    },
    world: {
      filename: 'image.pgw',
      content: WORLD_FILE
    },
    prj: {
      filename: 'image.prj',
      content: WGS84_PRJ
    }
  };
}

function getJpegImportGroup() {
  var raw = {
    width: 2,
    height: 1,
    data: Buffer.from([
      255, 0, 0, 255,
      0, 0, 255, 255
    ])
  };
  return {
    jpeg: {
      filename: 'image.jpg',
      content: jpeg.encode(raw, 100).data
    },
    world: {
      filename: 'image.jgw',
      content: WORLD_FILE
    }
  };
}

function getRasterDataset() {
  return {
    info: {crs_string: 'wgs84'},
    layers: [{
      name: 'raster',
      raster_type: 'grid',
      raster: {
        sourceId: 'raster',
        grid: {
          width: 2,
          height: 1,
          bands: 3,
          pixelType: 'uint8',
          samples: new Uint8Array([
            255, 0, 0,
            0, 0, 255
          ]),
          sampleBands: [0, 1, 2],
          nodata: null,
          bbox: [0, 0, 2, 1],
          transform: [1, 0, 0, 0, -1, 1]
        },
        derivation: {
          type: 'rgb',
          sourceId: 'raster',
          bands: [0, 1, 2]
        },
        view: {
          recipe: {
            type: 'rgb',
            bands: [0, 1, 2]
          },
          preview: {
            width: 2,
            height: 1,
            bands: 4,
            pixelType: 'uint8',
            colorModel: 'rgba',
            pixels: new Uint8ClampedArray([
              255, 0, 0, 255,
              0, 0, 255, 255
            ])
          }
        }
      }
    }]
  };
}

function getFrameDataset() {
  var feature = {
    type: 'Feature',
    properties: {
      type: 'frame',
      width: 100
    },
    geometry: api.internal.bboxToPolygon([0, 0, 1, 1])
  };
  var dataset = api.internal.importGeoJSON(feature);
  dataset.layers[0].name = 'frame';
  return dataset;
}
