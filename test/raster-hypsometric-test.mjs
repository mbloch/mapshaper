import assert from 'assert';
import api from '../mapshaper.js';

var internal = api.internal;

// A float raster of @values, @width pixels wide, with its top left corner at
// [lon, lat] and pixels of a degree
function makeGeoTIFF(values, width, corner) {
  var height = values.length / width;
  var grid = {
    width: width, height: height, bands: 1, pixelType: 'float32',
    samples: Float32Array.from(values), nodata: null,
    bbox: [corner[0], corner[1] - height, corner[0] + width, corner[1]],
    transform: [1, 0, corner[0], 0, -1, corner[1]]
  };
  return Buffer.from(internal.encodeGeoTIFF(grid, {}));
}

async function importRaster(content) {
  var catalog = new internal.Catalog();
  catalog.addDataset(await internal.importFileAsync('in.tif', {input: {'in.tif': content}}));
  return catalog;
}

async function runCommand(catalog, cmd) {
  await internal.runParsedCommands(internal.parseCommands(cmd), new internal.Job(catalog));
}

function getPalette(catalog) {
  return catalog.getActiveLayer().layer.raster.view.recipe.palette;
}

function hex(rgba, i) {
  return '#' + [0, 1, 2].map(function(j) { return ('0' + rgba[i * 4 + j].toString(16)).slice(-2); }).join('');
}

describe('-classify hypsometric=', function() {
  // in the Sahara
  var sahara = [5, 24];

  it('colors a raster with a preset, at its elevations', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var palette;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=lush');
    palette = getPalette(catalog);
    assert.equal(palette.hypsometric, 'Lush');
    assert(palette.continuous);
    assert.deepEqual(palette.breaks, internal.getHypsometricStops('Lush').map(function(o) { return o.elevation; }));
    assert.deepEqual(palette.colors, internal.getHypsometricStops('Lush').map(function(o) { return o.color; }));
    assert.equal(palette.blend, undefined);
  });

  it('converts the elevations to the band\'s units', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    catalog.getActiveLayer().layer.raster.grid.verticalUnits = 'ft';
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=Polar');
    assert.equal(getPalette(catalog).breaks[1], 164.042);
  });

  it('rejects other values, options that give colors or breaks, and vector layers', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    await assert.rejects(runCommand(catalog, '-classify hypsometric=tundra'), /Unknown hypsometric=/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=arid colors=red,blue'), /colors=/);
    await assert.rejects(api.applyCommands('-i in.json -classify hypsometric=arid',
      {'in.json': {type: 'Point', coordinates: [0, 0]}}), /raster layers/);
  });

  it('blended: the presets weighted across the raster, with the main one as its colors', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var palette, field;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=blended');
    palette = getPalette(catalog);
    field = palette.blend.field;
    assert.equal(palette.hypsometric, 'blended');
    assert.deepEqual(palette.colors, internal.getHypsometricStops('Arid').map(function(o) { return o.color; }));
    assert.deepEqual(palette.blend.ramps.map(function(o) { return o.name; }), ['Arid', 'Lush', 'Temperate', 'Polar']);
    assert.deepEqual(field.bbox, [5, 22, 7, 24]);
    assert.equal(field.weights.length, field.width * field.height * 3);
    assert(field.weights[0] > 200); // mostly Arid
  });

  it('blended: a preset can be recolored, and the elevations of all four moved', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var colorsOf = function(name) { return internal.getHypsometricStops(name).map(function(o) { return o.color; }); };
    var arid = colorsOf('Arid').map(function(c, i) { return i == 2 ? '#ff0000' : c; });
    var breaks = [-10, 10, 200, 600, 1000, 2000, 3000, 4000, 5000, 6500];
    var palette;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=blended arid-colors=' + arid.join(',') +
      ' breaks=' + breaks.slice(1, -1).join(',') + ' outer-breaks=-10,6500');
    palette = getPalette(catalog);
    assert.deepEqual(palette.blend.ramps[0].colors, arid);
    assert.deepEqual(palette.blend.ramps[1].colors, colorsOf('Lush'));
    palette.blend.ramps.forEach(function(ramp) { assert.deepEqual(ramp.breaks, breaks); });
    // Arid has the most weight here, so it is the palette's own ramp
    assert.deepEqual(palette.colors, arid);
    assert.deepEqual(palette.breaks, breaks);
  });

  it('blended: its colors need one at each elevation, and only a blend takes them', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var lush = internal.getHypsometricStops('Lush').map(function(o) { return o.color; }).join(',');
    await runCommand(catalog, '-proj init=wgs84');
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended lush-colors=red,blue'), /needs 10 colors/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=lush lush-colors=' + lush), /works with hypsometric=blended/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended breaks=1,2'), /outer-breaks=/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended breaks=1,2 outer-breaks=0,5'), /10 elevations/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=arid breaks=1,2'), /does not work with breaks=/);
  });

  it('blended needs to know where the raster is', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, [-150, 1])); // the Pacific
    await assert.rejects(runCommand(catalog, '-proj init=wgs84 -classify hypsometric=blended'), /known projection, on land/);
  });

  it('blended: its weights are made again by -proj', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var before, after, grid;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=blended');
    before = getPalette(catalog).blend.field;
    await runCommand(catalog, '-proj +proj=merc');
    after = getPalette(catalog).blend.field;
    grid = catalog.getActiveLayer().layer.raster.grid;
    assert.deepEqual(after.bbox, grid.bbox);
    assert.notEqual(after.key, before.key);
    assert(after.weights[0] > 200);
  });
});

describe('climate weight fields', function() {
  it('fade across the sea, without steps where the climate grid ends', function() {
    // the Pacific, west of California: columns 0-39 are open sea
    var field = internal.getClimateWeightField([-160, 20, -110, 50], internal.parseCrsString('wgs84'), 60);
    var step = 0;
    for (var y = 0; y < field.height; y++) {
      for (var x = 1; x < 40; x++) {
        for (var k = 0; k < 3; k++) {
          step = Math.max(step, Math.abs(field.weights[(y * field.width + x) * 3 + k] -
            field.weights[(y * field.width + x - 1) * 3 + k]));
        }
      }
    }
    assert(step <= 24, 'step of ' + step);
  });
});

describe('sea=', function() {
  // a 5x4 grid: a basin below sea level in the middle of land (-5), and sea
  // reaching in from the left edge (-10), past a nodata pixel (-9999)
  var values = [
    -10, 10, 10, 10, 10,
    -10, 10, -5, -5, 10,
    -10, -10, 10, 10, -9999,
    10, 10, 10, -3, 10];
  function makeGrid() {
    return {width: 5, height: 4, bands: 1, pixelType: 'float32', samples: Float32Array.from(values),
      nodata: -9999, bbox: [0, 0, 5, 4], transform: [1, 0, 0, 0, -1, 4]};
  }

  it('finds the sea: below 0 and connected to the edge or to a pixel without a value', function() {
    var mask = internal.getRasterSeaMask(makeGrid(), 0);
    assert.deepEqual(Array.from(mask), [
      1, 0, 0, 0, 0,
      1, 0, 0, 0, 0,
      1, 1, 0, 0, 0,
      0, 0, 0, 1, 0]);
  });

  it('the sea is open to pixels without a value', function() {
    var grid = makeGrid();
    grid.samples[14] = -9999;
    grid.samples[13] = -1;
    assert.equal(internal.getRasterSeaMask(grid, 0)[13], 1);
  });

  it('hypsometric tints leave out the sea, and keep the basins', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var palette, preview;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=arid');
    palette = getPalette(catalog);
    assert.equal(palette.sea, 'transparent');
    preview = internal.renderRasterPreview(catalog.getActiveLayer().layer.raster.grid, {palette: palette}, 5, 4);
    assert.equal(preview.pixels[0 * 4 + 3], 0); // sea
    assert.equal(preview.pixels[7 * 4 + 3], 255); // basin
    assert.equal(hex(preview.pixels, 7), internal.getHypsometricStops('Arid')[0].color);
  });

  it('sea=land colors everything, and other palettes take sea=transparent', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=arid sea=land');
    assert.equal(getPalette(catalog).sea, undefined);
    await runCommand(catalog, '-classify field=band1 colors=greens classes=3 sea=transparent');
    assert.equal(getPalette(catalog).sea, 'transparent');
    await runCommand(catalog, '-classify field=band1 colors=greens classes=3');
    assert.equal(getPalette(catalog).sea, undefined);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=arid sea=green'), /sea=/);
  });

  it('a bathymetric preset colors the sea by depth, and not the basins', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var stops = internal.getBathymetricStops('Blue');
    var palette, preview;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=arid sea=blue');
    palette = getPalette(catalog);
    assert.equal(palette.sea, 'Blue');
    assert.deepEqual(palette.seaRamp.breaks, stops.map(function(o) { return o.elevation; }));
    preview = internal.renderRasterPreview(catalog.getActiveLayer().layer.raster.grid, {palette: palette}, 5, 4);
    assert.equal(preview.pixels[0 * 4 + 3], 255);
    // -10 m, between the -50 and 0 m stops
    assert.notEqual(hex(preview.pixels, 0), internal.getHypsometricStops('Arid')[0].color);
    assert.equal(hex(preview.pixels, 7), internal.getHypsometricStops('Arid')[0].color);
  });

  it('hypsometric=none colors only the sea', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var palette, preview;
    await runCommand(catalog, '-classify hypsometric=none sea=pale');
    palette = getPalette(catalog);
    assert.equal(palette.land, 'transparent');
    assert.deepEqual(palette.colors, palette.seaRamp.colors);
    preview = internal.renderRasterPreview(catalog.getActiveLayer().layer.raster.grid, {palette: palette}, 5, 4);
    assert.equal(preview.pixels[0 * 4 + 3], 255); // sea
    assert.equal(preview.pixels[1 * 4 + 3], 0); // land
    assert.equal(preview.pixels[7 * 4 + 3], 0); // basin
    await assert.rejects(runCommand(catalog, '-classify hypsometric=none'), /needs colors for the sea/);
  });

  it('sea-breaks= and sea-colors= give custom sea colors', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var palette, preview;
    await runCommand(catalog, '-classify hypsometric=arid sea-breaks=-20,0 sea-colors=#000000,#0000ff');
    palette = getPalette(catalog);
    assert.equal(palette.sea, 'custom');
    assert.deepEqual(palette.seaRamp, {breaks: [-20, 0], colors: ['#000000', '#0000ff']});
    preview = internal.renderRasterPreview(catalog.getActiveLayer().layer.raster.grid, {palette: palette}, 5, 4);
    // -10 m, between the two colors
    assert(preview.pixels[2] > 0 && preview.pixels[2] < 255);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=arid sea-breaks=0,-20 sea-colors=red,blue'), /ascending/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=arid sea-breaks=-20,0 sea-colors=red'), /one for each/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=arid sea=pale sea-breaks=-20,0 sea-colors=red,blue'), /sea=/);
  });

  it('a bathymetric preset is converted to the band\'s units', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    catalog.getActiveLayer().layer.raster.grid.verticalUnits = 'ft';
    await runCommand(catalog, '-classify hypsometric=arid sea=Pale');
    assert.equal(getPalette(catalog).seaRamp.breaks[0], -36089.2);
  });
});

describe('blended raster palettes', function() {
  // two pixels at 0 m, the left one where the field is all Arid, the right
  // one where it is all Lush
  var grid = {width: 2, height: 1, bands: 1, pixelType: 'float32', samples: Float32Array.from([0, 0]),
    nodata: null, bbox: [0, 0, 2, 1], transform: [1, 0, 0, 0, -1, 1]};
  var arid = internal.getHypsometricStops('Arid');
  var lush = internal.getHypsometricStops('Lush');
  function ramp(stops, name) {
    return {name: name, breaks: stops.map(function(o) { return o.elevation; }), colors: stops.map(function(o) { return o.color; })};
  }
  var palette = Object.assign({band: 1, type: 'sequential', continuous: true, interpolation: 'oklch',
    nullColor: null}, ramp(lush), {
    blend: {
      ramps: [ramp(arid, 'Arid'), ramp(lush, 'Lush'), ramp(arid, 'Temperate'), ramp(arid, 'Polar')],
      field: {bbox: [0, 0, 2, 1], width: 2, height: 2, weights: [255, 0, 0, 0, 255, 0, 255, 0, 0, 0, 255, 0], key: 'test'}
    }
  });

  it('mix the ramps by the weights where each pixel is', function() {
    var preview = internal.renderRasterPreview(grid, {palette: palette}, 2, 1);
    assert.equal(hex(preview.pixels, 0), arid[0].color);
    assert.equal(hex(preview.pixels, 1), lush[0].color);
  });

  it('take the palette\'s own colors without a field', function() {
    var preview = internal.renderRasterPreview(grid, {palette: palette}, 2, 1, null, {blendField: null});
    assert.equal(hex(preview.pixels, 0), lush[0].color);
    assert.equal(hex(preview.pixels, 1), lush[0].color);
  });
});
