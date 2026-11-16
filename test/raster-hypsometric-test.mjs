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
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=tropical');
    palette = getPalette(catalog);
    assert.equal(palette.hypsometric, 'Tropical');
    assert(palette.continuous);
    assert.deepEqual(palette.breaks, internal.getHypsometricStops('Tropical').map(function(o) { return o.elevation; }));
    assert.deepEqual(palette.colors, internal.getHypsometricStops('Tropical').map(function(o) { return o.color; }));
    assert.equal(palette.blend, undefined);
  });

  it('has presets outside the climate blend, with elevations of their own', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var palette;
    assert(internal.getHypsometricSchemeNames().includes('Atlas'));
    assert(!internal.getClimateSchemeNames().includes('Atlas'));
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=atlas');
    palette = getPalette(catalog);
    assert.equal(palette.hypsometric, 'Atlas');
    assert(palette.continuous);
    assert.deepEqual(palette.breaks, [0, 200, 500, 1000, 2000, 4000]);
    await runCommand(catalog, '-classify hypsometric=lowland');
    assert.deepEqual(getPalette(catalog).breaks, [0, 125, 250, 500, 750, 1000, 2000]);
    await runCommand(catalog, '-classify hypsometric=highland');
    assert.deepEqual(getPalette(catalog).breaks, [0, 500, 1000, 1500, 2000, 3000, 4000]);
  });

  it('converts the elevations to the band\'s units', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    catalog.getActiveLayer().layer.raster.grid.verticalUnits = 'ft';
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=Polar');
    assert.equal(getPalette(catalog).breaks[1], +(internal.getHypsometricStops('Polar')[1].elevation / 0.3048).toPrecision(6));
  });

  it('rejects other values, options that classify another way, and vector layers', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    await assert.rejects(runCommand(catalog, '-classify hypsometric=tundra'), /Unknown hypsometric=/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert method=quantile'), /does not work with method=/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert outer-breaks=0,10'), /breaks= gives every elevation/);
    await assert.rejects(runCommand(catalog, '-classify field=band1 colors=red,blue classed'), /classed works with hypsometric=/);
    await assert.rejects(api.applyCommands('-i in.json -classify hypsometric=desert',
      {'in.json': {type: 'Point', coordinates: [0, 0]}}), /raster layers/);
    await assert.rejects(api.applyCommands('-i in.json -classify colors=red,sea:blue',
      {'in.json': {type: 'Point', coordinates: [0, 0]}}), /Named lists .* work with raster layers/);
  });

  it('colors= and breaks= give a preset other colors and elevations, every one', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var palette;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=atlas colors=#111111,#222222,#333333,#444444,#555555,#666666');
    palette = getPalette(catalog);
    assert.equal(palette.hypsometric, 'Atlas');
    assert.deepEqual(palette.colors, ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']);
    assert.deepEqual(palette.breaks, [0, 200, 500, 1000, 2000, 4000]);
    // the preset's name is the same as no name
    await runCommand(catalog, '-classify hypsometric=atlas breaks=atlas:0,100,200,300,400,500');
    assert.deepEqual(getPalette(catalog).breaks, [0, 100, 200, 300, 400, 500]);
    // with both, any number of stops
    await runCommand(catalog, '-classify hypsometric=atlas colors=#111111,#222222,#333333 breaks=0,10,20');
    assert.deepEqual(getPalette(catalog).breaks, [0, 10, 20]);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=atlas colors=red,blue'), /needs 6 colors/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=atlas breaks=1,2'), /needs 6 elevations/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=atlas colors=red,blue breaks=1,2,3'), /same number/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=atlas breaks=5,4,3,2,1,0'), /ascending/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=atlas colors=desert:red'), /works with hypsometric=blended/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=atlas colors=foo:red'), /Unknown name in colors=: foo/);
  });

  it('classed: one preset as classes, from each elevation up to the next', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var palette;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=atlas classed');
    palette = getPalette(catalog);
    assert.equal(palette.continuous, false);
    assert.deepEqual(palette.breaks, [200, 500, 1000, 2000, 4000]);
    assert.equal(palette.colors.length, 6);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended classed'), /one preset/);
  });

  it('blended: the presets weighted across the raster, with the main one as its colors', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var palette, field;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=blended');
    palette = getPalette(catalog);
    field = palette.blend.field;
    assert.equal(palette.hypsometric, 'blended');
    assert.deepEqual(palette.colors, internal.getHypsometricStops('Desert').map(function(o) { return o.color; }));
    assert.deepEqual(palette.blend.ramps.map(function(o) { return o.name; }), ['Desert', 'Steppe', 'Tropical', 'Temperate', 'Boreal', 'Polar']);
    assert.deepEqual(field.bbox, [5, 22, 7, 24]);
    assert.equal(field.weights.length, field.width * field.height * 5);
    assert(field.weights[0] > 200); // mostly Desert
  });

  it('blended: a preset can be recolored, and the elevations of all of them moved', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var colorsOf = function(name) { return internal.getHypsometricStops(name).map(function(o) { return o.color; }); };
    var desert = colorsOf('Desert').map(function(c, i) { return i == 2 ? '#ff0000' : c; });
    var breaks = internal.getHypsometricStops('Desert').map(function(o, i, arr) {
      return i === 0 ? -10 : i == arr.length - 1 ? 6500 : o.elevation + 5;
    });
    var palette;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=blended colors=desert:' + desert.join(',') +
      ' breaks=' + breaks.join(','));
    palette = getPalette(catalog);
    assert.deepEqual(palette.blend.ramps[0].colors, desert);
    assert.deepEqual(palette.blend.ramps.find(function(o) { return o.name == 'Tropical'; }).colors, colorsOf('Tropical'));
    palette.blend.ramps.forEach(function(ramp) { assert.deepEqual(ramp.breaks, breaks); });
    // Desert has the most weight here, so it is the palette's own ramp
    assert.deepEqual(palette.colors, desert);
    assert.deepEqual(palette.breaks, breaks);
  });

  it('blended: its colors need one at each elevation, and only a blend takes them', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var tropical = internal.getHypsometricStops('Tropical').map(function(o) { return o.color; }).join(',');
    var n = internal.getHypsometricStops('Tropical').length;
    await runCommand(catalog, '-proj init=wgs84');
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended colors=tropical:red,blue'), new RegExp('needs ' + n + ' colors'));
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended colors=tropical:red,blue,temperate:' + tropical),
      new RegExp('colors=tropical: needs ' + n + ' colors'));
    await assert.rejects(runCommand(catalog, '-classify hypsometric=tropical colors=tropical:' + tropical + ',desert:' + tropical),
      /works with hypsometric=blended/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended colors=' + tropical), /colors for each preset/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended breaks=1,2'), new RegExp('needs ' + n + ' elevations'));
    // a blend's presets share their elevations, so its breaks have no name
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended breaks=desert:1,2,3,4,5,6'), /share their elevations/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended colors=tropical:' + tropical + ',tropical:' + tropical),
      /given twice/);
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
    // the Pacific, west of California and north of Hawaii: columns 0-35
    // (to 128W) are open sea
    var field = internal.getClimateWeightField([-155, 28, -110, 46], internal.parseCrsString('wgs84'), 60);
    var zones = field.weights.length / field.width / field.height;
    var step = 0;
    for (var y = 0; y < field.height; y++) {
      for (var x = 1; x < 36; x++) {
        for (var k = 0; k < zones; k++) {
          step = Math.max(step, Math.abs(field.weights[(y * field.width + x) * zones + k] -
            field.weights[(y * field.width + x - 1) * zones + k]));
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

  // the basin's pixels (7 and 8) are centered at [2.5, 2.5] and [3.5, 2.5]
  it('an inland sea is the basin around one of its seeds', function() {
    var mask = internal.getRasterSeaMask(makeGrid(), 0, [[3.5, 2.5, 0]]);
    assert.deepEqual(Array.from(mask), [
      1, 0, 0, 0, 0,
      1, 0, 1, 1, 0,
      1, 1, 0, 0, 0,
      0, 0, 0, 1, 0]);
  });

  it('an inland sea is the part of a basin at or below its level', function() {
    var grid = makeGrid();
    grid.samples[7] = -20;
    var mask = internal.getRasterSeaMask(grid, 0, [[2.5, 2.5, -10]]);
    assert.equal(mask[7], 1);
    assert.equal(mask[8], 0); // -5 is above the level
    grid = makeGrid();
    grid.samples[7] = -20;
    grid.verticalUnits = 'ft'; // -20 ft is above -10 m
    assert.equal(internal.getRasterSeaMask(grid, 0, [[2.5, 2.5, -10]])[7], 0);
  });

  it('a seed on a pixel above sea level starts from a neighbor', function() {
    var mask = internal.getRasterSeaMask(makeGrid(), 0, [[1.5, 2.5, 0]]);
    assert.equal(mask[6], 0); // the seed's pixel, at 10
    assert.equal(mask[7], 1);
    assert.equal(mask[8], 1);
  });

  it('seeds outside the grid are ignored', function() {
    var mask = internal.getRasterSeaMask(makeGrid(), 0, [[50, 50, 0], [-3, 2.5, 0]]);
    assert.equal(mask[7], 0);
  });

  it('without seeds (an unknown CRS), an enclosed basin deeper than 500 m is sea', function() {
    var grid = makeGrid();
    grid.samples[8] = -600; // the basin at -5 deepens to -600
    assert.deepEqual(Array.from(internal.getRasterSeaMask(grid, 0)), [
      1, 0, 0, 0, 0,
      1, 0, 1, 1, 0,
      1, 1, 0, 0, 0,
      0, 0, 0, 1, 0]);
    grid = makeGrid();
    grid.samples[8] = -600;
    grid.verticalUnits = 'ft'; // -600 ft is about -183 m
    assert.equal(internal.getRasterSeaMask(grid, 0)[8], 0);
    // with seeds (a known CRS), only the inland seas are
    grid = makeGrid();
    grid.samples[8] = -600;
    assert.equal(internal.getRasterSeaMask(grid, 0, [])[8], 0);
  });

  it('-classify gives the palette the inland seas\' seeds in the raster\'s CRS, and -proj updates them', async function() {
    var count = internal.getInlandSeas().reduce(function(memo, sea) { return memo + sea.points.length; }, 0);
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var seeds;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=desert');
    seeds = getPalette(catalog).seaSeeds;
    assert.equal(seeds.length, count);
    assert(Math.abs(seeds[0][0] - -3) < 1e-9 && Math.abs(seeds[0][1] - 36) < 1e-9, String(seeds[0]));
    await runCommand(catalog, '-proj merc');
    seeds = getPalette(catalog).seaSeeds;
    assert.equal(seeds.length, count);
    assert(Math.abs(seeds[0][0] - -333958) < 1, String(seeds[0][0])); // 3 degrees W
  });

  it('the sea is open to pixels without a value', function() {
    var grid = makeGrid();
    grid.samples[14] = -9999;
    grid.samples[13] = -1;
    assert.equal(internal.getRasterSeaMask(grid, 0)[13], 1);
  });

  it('a sea of 0, as many DEMs give it, is sea too, and so is a basin at 0 that it reaches', function() {
    var grid = makeGrid();
    grid.samples = Float32Array.from(values.map(function(v) { return v == -10 ? 0 : v; }));
    grid.samples[6] = 0; // next to the sea, so the basin beyond it at -5 opens to the sea
    var mask = internal.getRasterSeaMask(grid, 0);
    assert.deepEqual(Array.from(mask), [
      1, 0, 0, 0, 0,
      1, 1, 1, 1, 0,
      1, 1, 0, 0, 0,
      0, 0, 0, 1, 0]);
  });

  it('hypsometric tints leave out the sea, and keep the basins', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var palette, preview;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=desert');
    palette = getPalette(catalog);
    assert.equal(palette.sea, 'transparent');
    preview = internal.renderRasterPreview(catalog.getActiveLayer().layer.raster.grid, {palette: palette}, 5, 4);
    assert.equal(preview.pixels[0 * 4 + 3], 0); // sea
    assert.equal(preview.pixels[7 * 4 + 3], 255); // basin
    assert.equal(hex(preview.pixels, 7), internal.getHypsometricStops('Desert')[0].color);
  });

  it('sea=land colors everything, and other palettes take sea=transparent', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=desert sea=land');
    assert.equal(getPalette(catalog).sea, undefined);
    await runCommand(catalog, '-classify field=band1 colors=greens classes=3 sea=transparent');
    assert.equal(getPalette(catalog).sea, 'transparent');
    await runCommand(catalog, '-classify field=band1 colors=greens classes=3');
    assert.equal(getPalette(catalog).sea, undefined);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert sea=green'), /sea=/);
  });

  it('a bathymetric preset colors the sea by depth, and not the basins', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var stops = internal.getBathymetricStops('Blue');
    var palette, preview;
    await runCommand(catalog, '-proj init=wgs84 -classify hypsometric=desert sea=blue');
    palette = getPalette(catalog);
    assert.equal(palette.sea, 'Blue');
    assert.deepEqual(palette.seaRamp.breaks, stops.map(function(o) { return o.elevation; }));
    preview = internal.renderRasterPreview(catalog.getActiveLayer().layer.raster.grid, {palette: palette}, 5, 4);
    assert.equal(preview.pixels[0 * 4 + 3], 255);
    // -10 m, between the -50 and 0 m stops
    assert.notEqual(hex(preview.pixels, 0), internal.getHypsometricStops('Desert')[0].color);
    assert.equal(hex(preview.pixels, 7), internal.getHypsometricStops('Desert')[0].color);
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

  it('colors=sea: and breaks=sea: give custom sea colors, or change a preset\'s', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var pale = internal.getBathymetricStops('Pale');
    var palette, preview;
    await runCommand(catalog, '-classify hypsometric=desert sea=pale colors=sea:' + pale.map(function() { return '#000000'; }).join(','));
    palette = getPalette(catalog);
    assert.equal(palette.sea, 'custom');
    assert.deepEqual(palette.seaRamp.breaks, pale.map(function(o) { return o.elevation; }));
    assert.equal(palette.seaRamp.colors[0], '#000000');
    await runCommand(catalog, '-classify hypsometric=desert colors=sea:#000000,#0000ff breaks=sea:-20,0');
    palette = getPalette(catalog);
    assert.equal(palette.sea, 'custom');
    assert.deepEqual(palette.seaRamp, {breaks: [-20, 0], colors: ['#000000', '#0000ff']});
    preview = internal.renderRasterPreview(catalog.getActiveLayer().layer.raster.grid, {palette: palette}, 5, 4);
    // -10 m, between the two colors
    assert(preview.pixels[2] > 0 && preview.pixels[2] < 255);
    // with land colors and stops too, the sea's lists come after the land's
    await runCommand(catalog, '-classify hypsometric=desert colors=#111111,#222222,#333333,#444444,#555555,#666666,sea:#000000,#0000ff' +
      ' breaks=sea:-20,0');
    assert.equal(getPalette(catalog).colors[0], '#111111');
    assert.deepEqual(getPalette(catalog).seaRamp.colors, ['#000000', '#0000ff']);
    // and they work without hypsometric=
    await runCommand(catalog, '-classify field=band1 breaks=100,sea:-20,0 colors=red,blue,sea:#000000,#0000ff');
    assert.deepEqual(getPalette(catalog).breaks, [100]);
    assert.deepEqual(getPalette(catalog).seaRamp.breaks, [-20, 0]);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert colors=sea:red,blue breaks=sea:0,-20'), /ascending/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert colors=sea:red breaks=sea:-20,0'), /same number/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert colors=sea:red,blue'), /needs colors=sea:... and breaks=sea:/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert sea=pale colors=sea:red,blue'), /needs 12 colors/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert sea=transparent colors=sea:red,blue breaks=sea:-20,0'),
      /work with a bathymetric sea=/);
  });

  it('a bathymetric preset is converted to the band\'s units', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    catalog.getActiveLayer().layer.raster.grid.verticalUnits = 'ft';
    await runCommand(catalog, '-classify hypsometric=desert sea=Pale');
    assert.equal(getPalette(catalog).seaRamp.breaks[0], -36089.2);
  });
});

describe('blended raster palettes', function() {
  // two pixels at 0 m, the left one where the field is all Desert, the right
  // one where it is all Tropical
  var grid = {width: 2, height: 1, bands: 1, pixelType: 'float32', samples: Float32Array.from([0, 0]),
    nodata: null, bbox: [0, 0, 2, 1], transform: [1, 0, 0, 0, -1, 1]};
  var desert = internal.getHypsometricStops('Desert');
  var tropical = internal.getHypsometricStops('Tropical');
  function ramp(stops, name) {
    return {name: name, breaks: stops.map(function(o) { return o.elevation; }), colors: stops.map(function(o) { return o.color; })};
  }
  var palette = Object.assign({band: 1, type: 'sequential', continuous: true, interpolation: 'oklch',
    nullColor: null}, ramp(tropical), {
    blend: {
      ramps: [ramp(desert, 'Desert'), ramp(tropical, 'Tropical'), ramp(desert, 'Temperate'), ramp(desert, 'Polar')],
      field: {bbox: [0, 0, 2, 1], width: 2, height: 2, key: 'test',
        weights: [255, 0, 0, 0, 255, 0, 255, 0, 0, 0, 255, 0]}
    }
  });

  it('mix the ramps by the weights where each pixel is', function() {
    var preview = internal.renderRasterPreview(grid, {palette: palette}, 2, 1);
    assert.equal(hex(preview.pixels, 0), desert[0].color);
    assert.equal(hex(preview.pixels, 1), tropical[0].color);
  });

  it('take the palette\'s own colors without a field', function() {
    var preview = internal.renderRasterPreview(grid, {palette: palette}, 2, 1, null, {blendField: null});
    assert.equal(hex(preview.pixels, 0), tropical[0].color);
    assert.equal(hex(preview.pixels, 1), tropical[0].color);
  });
});
