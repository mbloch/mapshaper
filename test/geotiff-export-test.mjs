import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fromArrayBuffer } from 'geotiff';

var encodeGeoTIFF = api.internal.encodeGeoTIFF;
var WGS84_GEOTIFF_FIXTURE = 'test/data/geotiff/wgs84-geographic-epsg4326.tif';

describe('GeoTIFF export', function () {

  describe('encoder', function () {
    it('round-trips a single-band float grid with a nodata value', async function () {
      var grid = makeGrid({
        width: 4,
        height: 3,
        samples: new Float32Array([
          -9999, 101.5, 102.5, 103.5,
          104.5, 105.5, 106.5, 107.5,
          108.5, 109.5, 110.5, 111.5
        ]),
        nodata: -9999,
        bbox: [500000, 4000000, 500400, 4000300]
      });
      var image = await decode(grid, {ProjectedCSTypeGeoKey: 32615});

      assert.equal(image.getWidth(), 4);
      assert.equal(image.getHeight(), 3);
      assert.equal(image.getSamplesPerPixel(), 1);
      assert.equal(image.getSampleFormat(), 3); // floating point
      assert.deepEqual(image.getBitsPerSample(), 32);
      assert.equal(+image.getGDALNoData(), -9999);
      assert.deepEqual(image.getBoundingBox(), [500000, 4000000, 500400, 4000300]);
      assert.deepEqual(await readSamples(image), Array.from(grid.samples));
    });

    it('round-trips an RGB grid', async function () {
      var grid = makeGrid({
        width: 3,
        height: 2,
        bands: 3,
        samples: new Uint8Array([
          255, 0, 0, 0, 255, 0, 0, 0, 255,
          255, 255, 0, 0, 255, 255, 255, 0, 255
        ]),
        bbox: [-30, -20, 30, 20]
      });
      var image = await decode(grid, {GeographicTypeGeoKey: 4326});

      assert.equal(image.getSamplesPerPixel(), 3);
      assert.equal(getTag(image, 'PhotometricInterpretation'), 2); // RGB
      assert.equal(getTag(image, 'ExtraSamples'), undefined);
      assert.deepEqual(await readSamples(image), Array.from(grid.samples));
    });

    it('flags the fourth band of an RGBA grid as alpha', async function () {
      var grid = makeGrid({
        width: 2,
        height: 1,
        bands: 4,
        samples: new Uint8Array([10, 20, 30, 255, 40, 50, 60, 128]),
        bbox: [0, 0, 2, 1]
      });
      var image = await decode(grid, {GeographicTypeGeoKey: 4326});

      assert.equal(getTag(image, 'PhotometricInterpretation'), 2);
      assert.deepEqual(Array.from(getTag(image, 'ExtraSamples')), [2]); // unassociated alpha
      assert.deepEqual(await readSamples(image), Array.from(grid.samples));
    });

    it('marks bands beyond the first of a multiband measurement grid as extra', async function () {
      var grid = makeGrid({
        width: 1,
        height: 1,
        bands: 2,
        samples: new Int16Array([-5, 700]),
        bbox: [0, 0, 1, 1]
      });
      var image = await decode(grid, {});

      assert.equal(getTag(image, 'PhotometricInterpretation'), 1); // black is zero
      assert.deepEqual(Array.from(getTag(image, 'ExtraSamples')), [0]); // unspecified
    });

    it('tags a grid by its display bands rather than its band count', async function () {
      var grid = makeGrid({
        width: 1,
        height: 1,
        bands: 4,
        samples: new Uint8Array([10, 20, 30, 40]),
        displayBands: {color: [0], alpha: -1},
        bbox: [0, 0, 1, 1]
      });
      var image = await decode(grid, {});
      assert.equal(getTag(image, 'PhotometricInterpretation'), 1);
      assert.deepEqual(Array.from(getTag(image, 'ExtraSamples')), [0, 0, 0]);

      grid.displayBands = {color: [0, 1, 2], alpha: -1};
      image = await decode(grid, {});
      assert.equal(getTag(image, 'PhotometricInterpretation'), 2);
      assert.deepEqual(Array.from(getTag(image, 'ExtraSamples')), [0]);
    });

    // The geotiff package's own writer mistypes signed samples, so these are
    // the types most in need of a check.
    [
      ['Int16Array', new Int16Array([-32768, -100, 0, 32767]), 2, 16],
      ['Int32Array', new Int32Array([-2000000, -1, 0, 2000000]), 2, 32],
      ['Uint8Array', new Uint8Array([0, 1, 128, 255]), 1, 8],
      ['Uint16Array', new Uint16Array([0, 300, 40000, 65535]), 1, 16],
      ['Uint32Array', new Uint32Array([0, 70000, 4e9, 12]), 1, 32],
      ['Float32Array', new Float32Array([-1.5, 0, 0.25, 1234.5]), 3, 32],
      ['Float64Array', new Float64Array([-1.5, 0, 1 / 3, 1e300]), 3, 64]
    ].forEach(function(test) {
      var name = test[0];
      it('round-trips ' + name + ' samples', async function () {
        var grid = makeGrid({
          width: 2,
          height: 2,
          samples: test[1],
          bbox: [0, 0, 2, 2]
        });
        var image = await decode(grid, {});
        assert.equal(image.getSampleFormat(), test[2]);
        assert.equal(image.getBitsPerSample(), test[3]);
        assert.deepEqual(await readSamples(image), Array.from(test[1]));
      });
    });

    it('splits a large grid into strips, compressed or not', async function () {
      var samples = new Float32Array(300 * 400);
      var i;
      for (i = 0; i < samples.length; i++) samples[i] = i % 977;
      var grid = makeGrid({
        width: 300,
        height: 400,
        samples: samples,
        bbox: [0, 0, 300, 400]
      });
      var deflated = encode(grid, {});
      var stored = encode(grid, {}, {compress: false});
      var image = await decodeBytes(deflated);
      var rawImage = await decodeBytes(stored);

      var rowsPerStrip = getTag(image, 'RowsPerStrip');
      assert(rowsPerStrip < 400);
      assert.equal(Object.keys(getTag(image, 'StripOffsets')).length,
        Math.ceil(400 / rowsPerStrip));
      assert.equal(getTag(image, 'Compression'), 8); // deflate
      assert.equal(getTag(rawImage, 'Compression'), 1); // none
      assert(deflated.length < stored.length / 2);
      assert.deepEqual(await readSamples(image), Array.from(samples));
      assert.deepEqual(await readSamples(rawImage), Array.from(samples));
    });

    it('writes the geo keys it is given', async function () {
      var image = await decode(makeGrid({}), {
        GTModelTypeGeoKey: 1,
        GTRasterTypeGeoKey: 1,
        ProjectedCSTypeGeoKey: 32615
      });
      var keys = image.getGeoKeys();
      assert.equal(keys.GTModelTypeGeoKey, 1);
      assert.equal(keys.GTRasterTypeGeoKey, 1); // pixel is area
      assert.equal(keys.ProjectedCSTypeGeoKey, 32615);
    });

    it('omits the nodata tag when a grid has no nodata value', async function () {
      var image = await decode(makeGrid({nodata: null}), {});
      assert.strictEqual(image.getGDALNoData(), null);
    });

    // Angles and axis lengths do not fit in the geo key directory, which holds
    // shorts, so they go in a block of doubles that the keys point into.
    it('writes double-valued geo keys through GeoDoubleParams', async function () {
      var image = await decode(makeGrid({}), {
        ProjCoordTransGeoKey: 11,
        ProjStdParallel1GeoKey: 29.5,
        ProjNatOriginLongGeoKey: -96,
        ProjFalseEastingGeoKey: 0
      });
      var keys = image.getGeoKeys();
      assert.equal(keys.ProjCoordTransGeoKey, 11);
      assert.equal(keys.ProjStdParallel1GeoKey, 29.5);
      assert.equal(keys.ProjNatOriginLongGeoKey, -96);
      assert.strictEqual(keys.ProjFalseEastingGeoKey, 0);
    });
  });

  describe('geo keys', function () {
    // Each projection's parameters have their own place in the geo keys, which
    // this follows GDAL in choosing.
    it('describes a projection parameter by parameter', function () {
      assert.deepEqual(getGeoKeys('+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +datum=WGS84 +units=m'), {
        GTModelTypeGeoKey: 1, // projected
        GeographicTypeGeoKey: 4326,
        GeogAngularUnitsGeoKey: 9102, // degree
        GeogSemiMajorAxisGeoKey: 6378137,
        GeogPrimeMeridianLongGeoKey: 0,
        GeogInvFlatteningGeoKey: 298.257223563,
        ProjectedCSTypeGeoKey: 32767, // user-defined
        ProjectionGeoKey: 32767,
        ProjCoordTransGeoKey: 11, // CT_AlbersEqualArea
        ProjLinearUnitsGeoKey: 9001, // metre
        ProjNatOriginLongGeoKey: -96,
        ProjNatOriginLatGeoKey: 37.5,
        ProjFalseEastingGeoKey: 0,
        ProjFalseNorthingGeoKey: 0,
        ProjStdParallel1GeoKey: 29.5,
        ProjStdParallel2GeoKey: 45.5
      });
    });

    it('uses the false-origin keys of a two-parallel Lambert conformal conic', function () {
      var keys = getGeoKeys('+proj=lcc +lat_1=33 +lat_2=45 +lat_0=39 +lon_0=-96 +x_0=100 +datum=WGS84');
      assert.equal(keys.ProjCoordTransGeoKey, 8); // CT_LambertConfConic_2SP
      assert.equal(keys.ProjFalseOriginLongGeoKey, -96);
      assert.equal(keys.ProjFalseOriginLatGeoKey, 39);
      assert.equal(keys.ProjFalseOriginEastingGeoKey, 100);
      assert.equal(keys.ProjNatOriginLongGeoKey, undefined);
    });

    it('uses the one-parallel code when a conic has a single parallel', function () {
      var keys = getGeoKeys('+proj=lcc +lat_1=40 +lat_0=40 +lon_0=-96 +k_0=0.9999 +datum=WGS84');
      assert.equal(keys.ProjCoordTransGeoKey, 9); // CT_LambertConfConic_Helmert
      assert.equal(keys.ProjNatOriginLatGeoKey, 40);
      assert.equal(keys.ProjScaleAtNatOriginGeoKey, 0.9999);
    });

    // A polar stereographic projection is a case of its own: the pole is
    // implied, and the keys hold the meridian running down the map and the
    // parallel of true scale.
    it('describes a polar stereographic projection', function () {
      var keys = getGeoKeys('+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +datum=WGS84');
      assert.equal(keys.ProjCoordTransGeoKey, 15); // CT_PolarStereographic
      assert.equal(keys.ProjStraightVertPoleLongGeoKey, -45);
      assert.equal(keys.ProjNatOriginLatGeoKey, 70);
    });

    it('gives the axes of an unnamed ellipsoid, and a sphere its radius', function () {
      var grs80 = getGeoKeys('+proj=longlat +ellps=GRS80');
      var sphere = getGeoKeys('+proj=longlat +a=6370997 +b=6370997');
      assert.equal(grs80.GTModelTypeGeoKey, 2); // geographic
      assert.equal(grs80.GeographicTypeGeoKey, 32767); // user-defined
      assert.equal(grs80.GeogSemiMajorAxisGeoKey, 6378137);
      assert.equal(grs80.GeogInvFlatteningGeoKey, 298.257222101);
      assert.equal(sphere.GeogSemiMajorAxisGeoKey, 6370997);
      assert.equal(sphere.GeogSemiMinorAxisGeoKey, 6370997);
      assert.equal(sphere.GeogInvFlatteningGeoKey, undefined);
    });

    it('names a unit that has no code by its size in meters', function () {
      var keys = getGeoKeys('+proj=tmerc +lon_0=-75 +datum=WGS84 +to_meter=1.5');
      assert.equal(keys.ProjLinearUnitsGeoKey, 32767); // user-defined
      assert.equal(keys.ProjLinearUnitSizeGeoKey, 1.5);
      assert.equal(getGeoKeys('+proj=tmerc +lon_0=-75 +datum=WGS84 +units=us-ft')
        .ProjLinearUnitsGeoKey, 9003); // US survey foot
    });

    it('gives up on a projection GeoTIFF cannot describe', function () {
      assert.strictEqual(getGeoKeys('+proj=moll +datum=WGS84'), null);
      // A composite projection reports itself as its main projection, so it has
      // to be turned away by name rather than by failing to match.
      assert.strictEqual(getGeoKeys('albersusa'), null);
    });

    // Reading the keys back uses the same table the other way round, so that a
    // file mapshaper writes is one it can also read. The parameters the library
    // that mapshaper reads GeoTIFF CRSes with gets wrong are among these: the
    // true-scale parallel of a Mercator, the central meridian of a polar
    // stereographic, the azimuth of an oblique Mercator.
    it('reads its own keys back as the projection it started from', function () {
      [
        '+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +datum=WGS84 +units=m',
        '+proj=lcc +lat_1=33 +lat_2=45 +lat_0=39 +lon_0=-96 +datum=WGS84 +units=m',
        '+proj=lcc +lat_1=40 +lat_0=40 +lon_0=-96 +k_0=0.9999 +datum=WGS84 +units=m',
        '+proj=merc +lat_ts=20 +lon_0=0 +datum=WGS84 +units=m',
        '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +datum=WGS84 +units=m',
        '+proj=omerc +lat_0=45 +lonc=-86 +alpha=337 +k_0=0.9996 +datum=WGS84 +units=m',
        '+proj=utm +zone=15 +datum=WGS84 +units=m',
        '+proj=eqc +lat_ts=30 +lon_0=10 +datum=WGS84 +units=m',
        '+proj=sterea +lat_0=52 +lon_0=5 +k_0=0.9999 +x_0=155000 +y_0=463000 +datum=WGS84 +units=m'
      ].forEach(function(def) {
        var read = api.internal.getGeoKeyProjection(getGeoKeys(def)) +
          ' +datum=WGS84 +units=m';
        assert.equal(maxProjectionError(def, read) < 1e-6, true,
          def + '\n  read back as ' + read);
      });
    });
  });

  describe('command', function () {
    it('writes a raster layer to a .tif file', async function () {
      var out = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE + ' -o out.tif');
      var image = await decodeBytes(out['out.tif']);
      assert.deepEqual(Object.keys(out), ['out.tif']);
      assert.equal(image.getWidth(), 2);
      assert.equal(image.getHeight(), 2);
      assert.equal(image.getGeoKeys().GeographicTypeGeoKey, 4326);
      assert.deepEqual(image.getBoundingBox(), [-180, -90, 180, 90]);
    });

    it('is chosen by a .tiff extension and by format=geotiff', async function () {
      var byExtension = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE + ' -o out.tiff');
      var byFormat = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE + ' -o format=geotiff');
      assert(await decodeBytes(byExtension['out.tiff']));
      assert(await decodeBytes(byFormat['wgs84-geographic-epsg4326.tif']));
    });

    it('exports the current pixels, not the imported ones', async function () {
      var out = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE +
        ' -clip bbox=-180,-90,0,90 -o out.tif');
      var image = await decodeBytes(out['out.tif']);
      assert.equal(image.getWidth(), 1);
      assert.deepEqual(image.getBoundingBox(), [-180, -90, 0, 90]);
    });

    it('stores an EPSG code recognized from a projection alias', async function () {
      var out = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE +
        ' -proj wgs84 -o out.tif');
      var image = await decodeBytes(out['out.tif']);
      assert.equal(image.getGeoKeys().GeographicTypeGeoKey, 4326);
      assert.equal(image.getGeoKeys().GTModelTypeGeoKey, 2); // geographic
    });

    // A projection with no EPSG code is spelled out in the geo keys instead.
    it('writes a CRS with no EPSG code as geo keys', async function () {
      var out = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE +
        ' -proj eqc -o out.tif');
      var keys = (await decodeBytes(out['out.tif'])).getGeoKeys();
      assert.deepEqual(Object.keys(out), ['out.tif']); // no sidecar needed
      assert.equal(keys.GTModelTypeGeoKey, 1); // projected
      assert.equal(keys.ProjectedCSTypeGeoKey, 32767); // user-defined
      assert.equal(keys.ProjCoordTransGeoKey, 17); // CT_Equirectangular
      assert.equal(keys.ProjCenterLongGeoKey, 0);
      assert.equal(keys.ProjLinearUnitsGeoKey, 9001); // metre
      assert.equal(keys.GeogSemiMajorAxisGeoKey, 6378137);
    });

    // Many projections, Mollweide and mapshaper's composite ones among them,
    // have no GeoTIFF representation at all.
    it('writes a projection GeoTIFF cannot describe to an .aux.xml sidecar', async function () {
      var out = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE +
        ' -proj moll -o out.tif');
      var image = await decodeBytes(out['out.tif']);
      var aux = String(out['out.tif.aux.xml']);
      assert.deepEqual(Object.keys(out).sort(), ['out.tif', 'out.tif.aux.xml']);
      assert(aux.includes('<SRS>'));
      // The grid is still georeferenced, just not identified.
      assert.equal(image.getGeoKeys().GTModelTypeGeoKey, undefined);
      assert.equal(image.getBoundingBox().length, 4);
    });

    it('accepts compression=none and rejects an unknown setting', async function () {
      var out = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE +
        ' -o out.tif compression=none');
      var image = await decodeBytes(out['out.tif']);
      assert.equal(getTag(image, 'Compression'), 1);
      await assert.rejects(async function() {
        await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE + ' -o out.tif compression=lzw');
      }, /Unsupported GeoTIFF compression/);
    });

    it('rejects vector layers', async function () {
      await assert.rejects(async function() {
        await api.applyCommands('-i test/data/geojson/two_states.json -o out.tif');
      }, /GeoTIFF output requires raster layers/);
    });

    it('rejects other formats for raster layers, naming GeoTIFF as an option', async function () {
      await assert.rejects(async function() {
        await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE + ' -o out.json');
      }, /exported as GeoTIFF/);
    });

    // The whole point of the geo keys: a raster in a projection with no EPSG
    // code comes back with the projection it left with.
    it('writes a code-less projection that mapshaper reads back', async function () {
      var def = '+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +datum=WGS84 +units=m';
      var out = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE +
        ' -clip bbox=-130,25,-65,50 -proj "' + def + '" -o out.tif');
      var file = path.join(os.tmpdir(), 'mapshaper-geokey-test.tif');
      var dataset;
      fs.writeFileSync(file, out['out.tif']);
      try {
        dataset = await api.internal.importFileAsync(file, {});
      } finally {
        fs.unlinkSync(file);
      }
      assert(dataset.info.crs, 'no CRS was read back');
      assert.equal(maxProjectionError(def, dataset.info.crs_string) < 1e-6, true,
        'read back as ' + dataset.info.crs_string);
    });

    // The sidecar is the last resort for a projection, so a raster written with
    // one has to come back with its CRS when the pair is read together.
    it('reads back a projection it wrote to a sidecar', async function () {
      var out = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE +
        ' -proj dymaxion -o out.tif');
      var dataset = await importFilePair(out, 'out.tif');
      assert(dataset.info.crs, 'no CRS was read back');
      assert.equal(maxProjectionError('+proj=dymaxion +ellps=WGS84',
        dataset.info.crs_string) < 1e-6, true,
        'read back as ' + dataset.info.crs_string);
      // Writing the raster out again reuses the sidecar's own wording.
      assert(String(dataset.info.wkt1).includes('dymaxion'));
    });

    it('writes the sidecar again when a raster read with one is re-exported', async function () {
      var first = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE +
        ' -proj dymaxion -o out.tif');
      var second = await api.applyCommands('-i out.tif -o again.tif', {
        'out.tif': first['out.tif'],
        'out.tif.aux.xml': String(first['out.tif.aux.xml'])
      });
      assert.deepEqual(Object.keys(second).sort(), ['again.tif', 'again.tif.aux.xml']);
      assert(String(second['again.tif.aux.xml']).includes('dymaxion'));
    });

    // A raster whose own geo keys name a CRS is not second-guessed by a sidecar
    // sitting beside it, matching how GDAL treats the two.
    it('prefers the CRS in the file to the one in the sidecar', async function () {
      var out = await api.applyCommands('-i ' + WGS84_GEOTIFF_FIXTURE + ' -o out.tif');
      var dataset = await api.internal.importFileAsync('out.tif', {input: {
        'out.tif': out['out.tif'],
        'out.tif.aux.xml': api.internal.formatAuxXml(
          'PROJCS["x",GEOGCS["y",DATUM["z",SPHEROID["WGS 84",6378137,298.257223563]],' +
          'PRIMEM["Greenwich",0],UNIT["degree",0.017453292519943295]],' +
          'PROJECTION["custom_proj4"],UNIT["Meter",1],' +
          'EXTENSION["PROJ4","+proj=moll +ellps=WGS84 +wktext"]]')
      }});
      assert(dataset.info.crs_string.includes('+proj=longlat'),
        'read as ' + dataset.info.crs_string);
    });
  });
});

// Writes a GeoTIFF and its sidecar to a temp directory and imports them the way
// a user would, by naming the .tif.
async function importFilePair(output, name) {
  var file = path.join(os.tmpdir(), 'mapshaper-aux-test-' + name);
  var auxFile = file + '.aux.xml';
  fs.writeFileSync(file, output[name]);
  fs.writeFileSync(auxFile, output[name + '.aux.xml']);
  try {
    return await api.internal.importFileAsync(file, {});
  } finally {
    fs.unlinkSync(file);
    fs.unlinkSync(auxFile);
  }
}

function getGeoKeys(def) {
  return api.internal.getCrsGeoKeys(api.internal.getCrsInfo(def).crs);
}

// Compares two CRSes by what they do to a scatter of points, rather than by how
// they are spelled: an equivalent projection can be written many ways.
// Returns the largest difference in projected coordinates, in meters.
function maxProjectionError(a, b) {
  var wgs84 = api.internal.getCrsInfo('wgs84').crs;
  var fwdA = api.internal.getProjTransform(wgs84, api.internal.getCrsInfo(a).crs || a);
  var fwdB = api.internal.getProjTransform(wgs84, api.internal.getCrsInfo(b).crs || b);
  var max = 0;
  for (var lon = -170; lon <= 170; lon += 20) {
    for (var lat = -80; lat <= 80; lat += 20) {
      var p1 = tryProject(fwdA, lon, lat);
      var p2 = tryProject(fwdB, lon, lat);
      // Points outside a projection's range are skipped, but the two CRSes have
      // to agree on which those are.
      if (!p1 !== !p2) return Infinity;
      if (!p1) continue;
      max = Math.max(max, Math.abs(p1[0] - p2[0]), Math.abs(p1[1] - p2[1]));
    }
  }
  return max;
}

function tryProject(fwd, lon, lat) {
  try {
    return fwd(lon, lat);
  } catch(e) {
    return null;
  }
}

function makeGrid(opts) {
  var grid = Object.assign({
    width: 2,
    height: 2,
    bands: 1,
    samples: new Uint8Array([1, 2, 3, 4]),
    nodata: null,
    bbox: [0, 0, 2, 2]
  }, opts);
  grid.transform = [
    (grid.bbox[2] - grid.bbox[0]) / grid.width, 0, grid.bbox[0],
    0, (grid.bbox[1] - grid.bbox[3]) / grid.height, grid.bbox[3]
  ];
  return grid;
}

function encode(grid, geoKeys, opts) {
  return encodeGeoTIFF(grid, Object.assign({geoKeys: geoKeys}, opts || {}));
}

async function decode(grid, geoKeys, opts) {
  return decodeBytes(encode(grid, geoKeys, opts));
}

// This build of geotiff.js resolves tags lazily, so a tag has to be read
// through the file directory's accessor rather than as a property.
function getTag(image, name) {
  return image.getFileDirectory().getValue(name);
}

async function decodeBytes(bytes) {
  var buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
  var tiff = await fromArrayBuffer(buf);
  return tiff.getImage();
}

// Returns every sample in the image, in the band-interleaved order that
// mapshaper's grids use.
async function readSamples(image) {
  var arr = await image.readRasters({interleave: true});
  return Array.from(arr);
}
