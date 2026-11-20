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

describe('-classify land-colors=', function() {
  // in the Sahara
  var sahara = [5, 24];

  it('colors a raster with a preset, at its elevations', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var palette;
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=tropical');
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
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=atlas');
    palette = getPalette(catalog);
    assert.equal(palette.hypsometric, 'Atlas');
    assert(palette.continuous);
    assert.deepEqual(palette.breaks, [0, 200, 500, 1000, 2000, 4000]);
    await runCommand(catalog, '-classify land-colors=lowland');
    assert.deepEqual(getPalette(catalog).breaks, [0, 125, 250, 500, 750, 1000, 2000]);
    await runCommand(catalog, '-classify land-colors=highland');
    assert.deepEqual(getPalette(catalog).breaks, [0, 500, 1000, 1500, 2000, 3000, 4000]);
  });

  it('converts the elevations to the band\'s units', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    catalog.getActiveLayer().layer.raster.grid.verticalUnits = 'ft';
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=Polar');
    assert.equal(getPalette(catalog).breaks[1], +(internal.getHypsometricStops('Polar')[1].elevation / 0.3048).toPrecision(6));
  });

  it('rejects other values, options that classify another way, and vector layers', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var point = {'in.json': {type: 'Point', coordinates: [0, 0]}};
    await assert.rejects(runCommand(catalog, '-classify land-colors=tundra'), /Unknown land-colors= value/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=red'), /two or more colors, or the name of a preset/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert method=quantile'), /do not work with method=/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert continuous'), /do not work with continuous/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert outer-breaks=0,10'), /land-breaks= gives every elevation/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert breaks=0,10'), /land-breaks= gives every elevation/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert colors=red,blue'), /both give the land's colors/);
    await assert.rejects(runCommand(catalog, '-classify field=band1 colors=red,blue land-classed'), /land-classed works with land-colors=/);
    await assert.rejects(runCommand(catalog, '-classify land-breaks=0,10'), /land-breaks= works with land-colors=/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert sea-colors=blue'), /two ways of giving elevation colors/);
    await assert.rejects(api.applyCommands('-i in.json -classify land-colors=desert', point), /land-colors= works with raster layers/);
    await assert.rejects(api.applyCommands('-i in.json -classify colors=red,blue sea-classed', point), /sea-classed works with raster layers/);
    await assert.rejects(api.applyCommands('-i in.json -classify colors=red,sea:blue', point), /Named lists .* work with raster layers/);
  });

  it('land-breaks= moves a preset\'s elevations, every one', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=atlas land-breaks=0,100,200,300,400,500');
    assert.equal(getPalette(catalog).hypsometric, 'Atlas');
    assert.deepEqual(getPalette(catalog).breaks, [0, 100, 200, 300, 400, 500]);
    await assert.rejects(runCommand(catalog, '-classify land-colors=atlas land-breaks=1,2'), /land-breaks= needs 6 elevations/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=atlas land-breaks=5,4,3,2,1,0'), /ascending/);
  });

  it('a list of colors is a custom ramp, at the elevations of land-breaks=', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var palette;
    await runCommand(catalog, '-classify land-colors=#111111,#222222,#333333 land-breaks=0,10,20');
    palette = getPalette(catalog);
    assert.equal(palette.hypsometric, 'custom');
    assert(palette.continuous);
    assert.deepEqual(palette.colors, ['#111111', '#222222', '#333333']);
    assert.deepEqual(palette.breaks, [0, 10, 20]);
    assert.equal(palette.sea, 'transparent');
    await assert.rejects(runCommand(catalog, '-classify land-colors=#111111,#222222,#333333'), /needs land-breaks=/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=red,blue land-breaks=1,2,3'), /same number/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=red,blue land-breaks=2,1'), /ascending/);
  });

  it('land-classed: classes from each elevation up to the next', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var palette;
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=atlas land-classed');
    palette = getPalette(catalog);
    assert.equal(palette.continuous, false);
    assert.deepEqual(palette.breaks, [200, 500, 1000, 2000, 4000]);
    assert.deepEqual(palette.stops, [0, 200, 500, 1000, 2000, 4000]);
    assert.equal(palette.colors.length, 6);
    await runCommand(catalog, '-classify land-colors=#111111,#222222,#333333 land-breaks=5,10,20 land-classed');
    palette = getPalette(catalog);
    assert.deepEqual(palette.breaks, [10, 20]);
    assert.deepEqual(palette.stops, [5, 10, 20]);
    await assert.rejects(runCommand(catalog, '-classify land-colors=blended land-classed'), /one preset/);
  });

  it('blended: the presets weighted across the raster, with the main one as its colors', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var palette, field;
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=blended');
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
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=desert:' + desert.join(',') +
      ' land-breaks=' + breaks.join(','));
    palette = getPalette(catalog);
    assert.equal(palette.hypsometric, 'blended');
    assert.deepEqual(palette.blend.ramps[0].colors, desert);
    assert.deepEqual(palette.blend.ramps.find(function(o) { return o.name == 'Tropical'; }).colors, colorsOf('Tropical'));
    palette.blend.ramps.forEach(function(ramp) { assert.deepEqual(ramp.breaks, breaks); });
    // Desert has the most weight here, so it is the palette's own ramp
    assert.deepEqual(palette.colors, desert);
    assert.deepEqual(palette.breaks, breaks);
    // the same, after the name of the blend
    await runCommand(catalog, '-classify land-colors=blended,desert:' + desert.join(','));
    assert.deepEqual(getPalette(catalog).blend.ramps[0].colors, desert);
  });

  it('blended: its colors need one at each elevation, by preset', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var tropical = internal.getHypsometricStops('Tropical').map(function(o) { return o.color; }).join(',');
    var n = internal.getHypsometricStops('Tropical').length;
    await runCommand(catalog, '-proj init=wgs84');
    await assert.rejects(runCommand(catalog, '-classify land-colors=tropical:red,blue'), new RegExp('land-colors=tropical: needs ' + n + ' colors'));
    await assert.rejects(runCommand(catalog, '-classify land-colors=tropical:red,blue,temperate:' + tropical),
      new RegExp('land-colors=tropical: needs ' + n + ' colors'));
    await assert.rejects(runCommand(catalog, '-classify land-colors=atlas,tropical:' + tropical), /colors by preset for a blend/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=tropical:' + tropical + ',foo:red'), /Unknown name in land-colors=: foo/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=blended land-breaks=1,2'), new RegExp('needs ' + n + ' elevations'));
    await assert.rejects(runCommand(catalog, '-classify land-colors=tropical:' + tropical + ',tropical:' + tropical),
      /given twice/);
  });

  it('blended needs to know where the raster is', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, [-150, 1])); // the Pacific
    await assert.rejects(runCommand(catalog, '-proj init=wgs84 -classify land-colors=blended'), /known projection, on land/);
  });

  it('blended: its weights are made again by -proj', async function() {
    var catalog = await importRaster(makeGeoTIFF([0, 500, 1500, 3000], 2, sahara));
    var before, after, grid;
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=blended');
    before = getPalette(catalog).blend.field;
    await runCommand(catalog, '-proj +proj=merc');
    after = getPalette(catalog).blend.field;
    grid = catalog.getActiveLayer().layer.raster.grid;
    assert.deepEqual(after.bbox, grid.bbox);
    assert.notEqual(after.key, before.key);
    assert(after.weights[0] > 200);
  });

  it('blended works in projections without an inverse, before or after -proj', async function() {
    var europe = [], i;
    for (i = 0; i < 60 * 30; i++) europe.push(500);
    for (var proj of ['dymaxion', 'butterfly']) {
      var catalog = await importRaster(makeGeoTIFF(europe, 60, [-10, 60]));
      var field;
      await runCommand(catalog, '-proj init=wgs84 -proj ' + proj + ' -classify land-colors=blended');
      field = getPalette(catalog).blend.field;
      assert.deepEqual(field.bbox, catalog.getActiveLayer().layer.raster.grid.bbox);
      catalog = await importRaster(makeGeoTIFF(europe, 60, [-10, 60]));
      await runCommand(catalog, '-proj init=wgs84 -classify land-colors=blended -proj ' + proj);
      assert(getPalette(catalog).blend, proj + ' kept the blend');
    }
  });
});

describe('climate weight fields', function() {
  it('projected forward, for a CRS without an inverse, match those of the inverse', function() {
    var crs = internal.parseCrsString('robinson');
    var bbox = [-2e6, -4e6, 6e6, 4.5e6]; // Africa and Europe
    var inv = internal.getClimateWeightField(bbox, crs);
    var fwd = internal.getForwardClimateWeightField(bbox, crs, inv.width, inv.height);
    var diffs = inv.weights.map(function(w, i) { return Math.abs(w - fwd.weights[i]); }).sort(function(a, b) { return a - b; });
    assert.equal(fwd.preset, inv.preset);
    assert.equal(diffs[diffs.length >> 1], 0);
    assert(diffs[Math.floor(diffs.length * 0.99)] <= 2);
  });

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

  it('are kept for the same bbox, CRS and size, and made again for others', function() {
    var bbox = [-20, 30, 40, 60];
    var field = internal.getClimateWeightField(bbox, internal.parseCrsString('wgs84'), 50);
    var other = internal.getClimateWeightField([-20, 30, 40, 61], internal.parseCrsString('wgs84'), 50);
    // another CRS object with the same definition
    assert.equal(internal.getClimateWeightField(bbox.concat(), internal.parseCrsString('wgs84'), 50), field);
    assert.notEqual(other, field);
    assert.notEqual(internal.getClimateWeightField(bbox, internal.parseCrsString('wgs84'), 51), field);
    assert.notEqual(internal.getClimateWeightField(bbox, internal.parseCrsString('+proj=merc +datum=WGS84'), 50), field);
  });
});

describe('sea-colors=', function() {
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
  function render(catalog) {
    return internal.renderRasterPreview(catalog.getActiveLayer().layer.raster.grid, {palette: getPalette(catalog)}, 5, 4);
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
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=desert');
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

  it('land colors leave out the sea, and keep the basins', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var preview;
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=desert');
    assert.equal(getPalette(catalog).sea, 'transparent');
    preview = render(catalog);
    assert.equal(preview.pixels[0 * 4 + 3], 0); // sea
    assert.equal(preview.pixels[7 * 4 + 3], 255); // basin
    assert.equal(hex(preview.pixels, 7), internal.getHypsometricStops('Desert')[0].color);
  });

  it('sea-colors=land colors everything, and other palettes take sea-colors=transparent', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=desert sea-colors=land');
    assert.equal(getPalette(catalog).sea, undefined);
    await runCommand(catalog, '-classify field=band1 colors=greens classes=3 sea-colors=transparent');
    assert.equal(getPalette(catalog).sea, 'transparent');
    await runCommand(catalog, '-classify field=band1 colors=greens classes=3');
    assert.equal(getPalette(catalog).sea, undefined);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert sea-colors=green'), /sea-colors= needs two or more colors/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert sea-colors=foo'), /Unknown sea-colors= value/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert sea-colors=transparent sea-classed'),
      /sea-classed works with sea colors/);
  });

  it('a bathymetric preset colors the sea by depth, and not the basins', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var stops = internal.getBathymetricStops('Blue');
    var palette, preview;
    await runCommand(catalog, '-proj init=wgs84 -classify land-colors=desert sea-colors=blue');
    palette = getPalette(catalog);
    assert.equal(palette.sea, 'Blue');
    assert.deepEqual(palette.seaRamp.breaks, stops.map(function(o) { return o.elevation; }));
    preview = render(catalog);
    assert.equal(preview.pixels[0 * 4 + 3], 255);
    // -10 m, between the -200 and 0 m stops
    assert.notEqual(hex(preview.pixels, 0), internal.getHypsometricStops('Desert')[0].color);
    assert.equal(hex(preview.pixels, 7), internal.getHypsometricStops('Desert')[0].color);
  });

  it('sea colors without land colors color only the sea', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var palette, preview;
    await runCommand(catalog, '-classify sea-colors=pale');
    palette = getPalette(catalog);
    assert.equal(palette.land, 'transparent');
    assert.equal(palette.hypsometric, 'none');
    assert.deepEqual(palette.colors, palette.seaRamp.colors);
    preview = render(catalog);
    assert.equal(preview.pixels[0 * 4 + 3], 255); // sea
    assert.equal(preview.pixels[1 * 4 + 3], 0); // land
    assert.equal(preview.pixels[7 * 4 + 3], 0); // basin
    await assert.rejects(runCommand(catalog, '-classify sea-colors=transparent'), /only the sea needs sea colors/);
  });

  it('a list of colors gives a custom sea, at the depths of sea-breaks=, which also move a preset\'s', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var palette, preview;
    await runCommand(catalog, '-classify land-colors=desert sea-colors=#000000,#0000ff sea-breaks=-20,0');
    palette = getPalette(catalog);
    assert.equal(palette.sea, 'custom');
    assert.deepEqual(palette.seaRamp, {breaks: [-20, 0], colors: ['#000000', '#0000ff']});
    preview = render(catalog);
    // -10 m, between the two colors
    assert(preview.pixels[2] > 0 && preview.pixels[2] < 255);
    await runCommand(catalog, '-classify land-colors=desert sea-colors=pale sea-breaks=-1000,-500,-100,-50,0');
    palette = getPalette(catalog);
    assert.equal(palette.sea, 'custom');
    assert.deepEqual(palette.seaRamp.breaks, [-1000, -500, -100, -50, 0]);
    assert.deepEqual(palette.seaRamp.colors, internal.getBathymetricStops('Pale').map(function(o) { return o.color; }));
    // and with other colors for the land
    await runCommand(catalog, '-classify field=band1 breaks=100 colors=red,blue sea-colors=#000000,#0000ff sea-breaks=-20,0');
    assert.deepEqual(getPalette(catalog).breaks, [100]);
    assert.deepEqual(getPalette(catalog).seaRamp.breaks, [-20, 0]);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert sea-colors=red,blue sea-breaks=0,-20'), /ascending/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert sea-colors=red,blue,green sea-breaks=-20,0'), /same number/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert sea-colors=red,blue'), /needs sea-breaks=/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert sea-colors=pale sea-breaks=-20,0'), /needs 5 depths/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert sea-colors=transparent sea-breaks=-20,0'),
      /sea-breaks= works with sea colors/);
    await assert.rejects(runCommand(catalog, '-classify land-colors=desert sea-breaks=-20,0'), /sea-breaks= works with sea-colors=/);
  });

  it('sea-classed: classes from each depth down to the next, as the land\'s go up', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    var palette, preview;
    await runCommand(catalog, '-classify land-colors=desert sea-colors=#000000,#0000ff,#00ff00 sea-breaks=-10,-5,0 sea-classed');
    palette = getPalette(catalog);
    assert.equal(palette.seaRamp.classed, true);
    preview = render(catalog);
    // -10, at the deepest stop, takes its color; -3 takes the shallowest's
    assert.equal(hex(preview.pixels, 0), '#000000');
    assert.equal(hex(preview.pixels, 18), '#00ff00');
    await runCommand(catalog, '-classify land-colors=desert sea-colors=#000000,#0000ff,#00ff00 sea-breaks=-20,-3,0 sea-classed');
    preview = render(catalog);
    // -10 is between the deepest stop and the next, and -3 is at a stop
    assert.equal(hex(preview.pixels, 0), '#0000ff');
    assert.equal(hex(preview.pixels, 18), '#0000ff');
    // a palette of only the sea has its classes
    await runCommand(catalog, '-classify sea-colors=blue sea-classed');
    palette = getPalette(catalog);
    assert.equal(palette.continuous, false);
    assert.equal(palette.breaks.length, palette.colors.length - 1);
  });

  it('a bathymetric preset is converted to the band\'s units', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 5, [5, 24]));
    catalog.getActiveLayer().layer.raster.grid.verticalUnits = 'ft';
    await runCommand(catalog, '-classify land-colors=desert sea-colors=Pale');
    assert.equal(getPalette(catalog).seaRamp.breaks[0], -32808.4);
  });
});

describe('older elevation options (hypsometric=, sea=, classed, named lists)', function() {
  var values = [-10, 10, 500, 1500, -10, -10, 3000, 10];
  function palettesMatch(a, b) {
    var strip = function(o) { o = Object.assign({}, o); delete o.command; return o; };
    assert.deepEqual(strip(a), strip(b));
  }

  it('give the palettes of the newer options', async function() {
    var desert = internal.getHypsometricStops('Desert').map(function(o) { return o.color; });
    var pairs = [
      ['hypsometric=atlas', 'land-colors=atlas'],
      ['hypsometric=atlas classed', 'land-colors=atlas land-classed'],
      ['hypsometric=atlas breaks=0,100,200,300,400,500', 'land-colors=atlas land-breaks=0,100,200,300,400,500'],
      ['hypsometric=desert sea=blue', 'land-colors=desert sea-colors=blue'],
      ['hypsometric=desert sea=land', 'land-colors=desert sea-colors=land'],
      ['hypsometric=none sea=pale', 'sea-colors=pale'],
      ['hypsometric=desert colors=sea:#000000,#0000ff breaks=sea:-20,0',
        'land-colors=desert sea-colors=#000000,#0000ff sea-breaks=-20,0'],
      ['field=band1 colors=red,blue,sea:#000000,#0000ff breaks=100,sea:-20,0',
        'field=band1 colors=red,blue breaks=100 sea-colors=#000000,#0000ff sea-breaks=-20,0'],
      ['-proj init=wgs84 -classify hypsometric=blended colors=desert:' + desert.join(','),
        '-proj init=wgs84 -classify land-colors=desert:' + desert.join(',')]
    ];
    for (var pair of pairs) {
      var a = await importRaster(makeGeoTIFF(values, 4, [5, 24]));
      var b = await importRaster(makeGeoTIFF(values, 4, [5, 24]));
      await runCommand(a, /^-/.test(pair[0]) ? pair[0] : '-classify ' + pair[0]);
      await runCommand(b, /^-/.test(pair[1]) ? pair[1] : '-classify ' + pair[1]);
      palettesMatch(getPalette(a), getPalette(b));
    }
  });

  it('colors= recolors a preset, at its elevations', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 4, [5, 24]));
    var palette;
    await runCommand(catalog, '-classify hypsometric=atlas colors=#111111,#222222,#333333,#444444,#555555,#666666');
    palette = getPalette(catalog);
    assert.equal(palette.hypsometric, 'Atlas');
    assert.deepEqual(palette.colors, ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']);
    assert.deepEqual(palette.breaks, [0, 200, 500, 1000, 2000, 4000]);
    await runCommand(catalog, '-classify hypsometric=atlas breaks=atlas:0,100,200,300,400,500');
    assert.deepEqual(getPalette(catalog).breaks, [0, 100, 200, 300, 400, 500]);
    await runCommand(catalog, '-classify hypsometric=desert sea=pale colors=sea:' +
      internal.getBathymetricStops('Pale').map(function() { return '#000000'; }).join(','));
    assert.equal(getPalette(catalog).sea, 'custom');
    assert.equal(getPalette(catalog).seaRamp.colors[0], '#000000');
  });

  it('give their own messages', async function() {
    var catalog = await importRaster(makeGeoTIFF(values, 4, [5, 24]));
    await assert.rejects(runCommand(catalog, '-classify hypsometric=tundra'), /Unknown hypsometric=/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert method=quantile'), /hypsometric= sets the colors .* method=/);
    await assert.rejects(runCommand(catalog, '-classify field=band1 colors=red,blue classed'), /classed works with hypsometric=/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended classed'), /one preset/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=atlas colors=red,blue'), /needs 6 colors/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=atlas colors=desert:red'), /works with hypsometric=blended/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=blended colors=red,blue'), /colors for each preset/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert colors=sea:red,blue'), /needs colors=sea:... and breaks=sea:/);
    await assert.rejects(runCommand(catalog, '-classify hypsometric=desert sea=green'), /Unsupported sea=/);
  });
});
