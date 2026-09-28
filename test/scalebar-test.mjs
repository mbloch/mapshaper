import api from '../mapshaper.js';
import assert from 'assert';
import {
  formatDistanceLabel,
  parseScalebarLabelToKm
} from '../src/commands/mapshaper-scalebar';


describe('mapshaper-scalebar.js', function () {
  it('parseScalebarLabelToKm()', function () {
    var toKm = 1.60934;
    var parse = parseScalebarLabelToKm;
    assert.equal(parse('1 mile'), toKm);
    assert.equal(parse('1 MILE'), toKm);
    assert.equal(parse('50 mi'), 50 * toKm);
    assert.equal(parse('1 / 2 MILE'), 1 / 2 * toKm);
    assert.equal(parse('1/2 MILE'), 1 / 2 * toKm);
    assert.equal(parse('0.5 MILE'), 0.5 * toKm);
    assert.equal(parse('1km'), 1);
    assert.equal(parse('5 k.m.'), 5);
    assert.equal(parse('1 kilometer'), 1);
    assert.equal(parse('5 kilometres'), 5);
    assert.equal(parse('5 kilomètres'), 5);
    assert.equal(parse('250 公里'), 250);
    assert.equal(parse('2英里'), 2 * toKm);
    assert.equal(parse('1,000 KILOMETERS'), 1000);
    assert.equal(parse('500 m'), 0.5);
    assert.equal(parse('500m'), 0.5);
    assert.equal(parse('250 meters'), 0.25);
    assert.equal(parse('250 METRES'), 0.25);
    assert(Math.abs(parse('1000 ft') - 0.3048) < 1e-12);
    assert(Math.abs(parse('1,000 FEET') - 0.3048) < 1e-12);
    assert(isNaN(parse('100 leagues')));
  })

  it('parseUnitsOption()', function() {
    var parse = api.internal.parseUnitsOption;
    assert.equal(parse('km'), 'km');
    assert.equal(parse('metric'), 'km');
    assert.equal(parse('miles'), 'mile');
    assert.equal(parse('imperial'), 'mile');
    assert.equal(parse('furlongs'), '');
  })

  it('formatDistanceLabel()', function() {
    var format = formatDistanceLabel;
    assert.equal(format('1,000', 'mile'), '1,000 MILES')
    assert.equal(format('1', 'mile'), '1 MILE')
    assert.equal(format('1.5', 'mile'), '1.5 MILES')
    assert.equal(format('1/8', 'mile'), '1/8 MILE')
    assert.equal(format('1/8', 'km'), '1/8 KM')
    assert.equal(format('500', 'm'), '500 METERS')
    assert.equal(format('1', 'ft'), '1 FOOT')
  })

  describe('-scalebar command', function() {
    it ('works without initial data', async function() {
      var file = 'test/data/geojson/two_states.json';
      var cmd = `-scalebar -i ${file} -proj lcc -target * -o map.svg`;
      var out = await api.applyCommands(cmd);
      assert(!!out['map.svg']);
    })

    it ('supports custom labels', async function() {
      var file = 'test/data/geojson/two_states.json';
      var cmd = `-scalebar "100 k.m." -i ${file} -proj lcc -target * -o map.svg`;
      var out = await api.applyCommands(cmd);
      assert(out['map.svg'].includes("100 k.m."));
    })

    it('error thrown when map is unprojected', async function() {
      var file = 'test/data/geojson/two_states.json';
      var cmd = `-scalebar "100 k.m." -i ${file} -target * -o map.svg`;
      assert.rejects(async function() {
        var out = await api.applyCommands(cmd);
      })
    })

    it('scalebar layers are skipped in GeoJSON output', async function() {
      var file = 'test/data/geojson/two_states.json';
      var cmd = `-scalebar -i ${file} -proj lcc -target * -o format=geojson`;
      var out = await api.applyCommands(cmd);
      assert.deepEqual(Object.keys(out), ['two_states.json']);
    });

    it('exporting only a scalebar to GeoJSON is an error', async function() {
      var cmd = `-scalebar -o format=geojson`;
      await assert.rejects(api.applyCommands(cmd), /only be exported as SVG/);
    });
  })

  describe('scalebars in a map frame', function() {
    var file = 'test/data/geojson/two_states.json';
    var framed = `-i ${file} -proj lcc -frame width=600`;

    it('the scalebar is added to the frame dataset, not the default target', async function() {
      var job = await runJob(`${framed} -target two_states -scalebar`);
      var frame = api.internal.getActiveFrame(job.catalog);
      assert.deepEqual(frame.dataset.layers.map(lyr => lyr.name), ['frame', 'scalebar']);
      assert.equal(job.catalog.getActiveLayer().layer.name, 'two_states');
      var scalebar = frame.dataset.layers[1];
      assert(api.internal.isFrameComponentLayer(scalebar, frame.dataset));
      assert(api.internal.isFrameComponentLayer(frame.layer, frame.dataset));
      assert.equal(api.internal.findFrameFurnitureLayer(frame.dataset, 'scalebar'), scalebar);
    });

    it('running -scalebar again replaces the scalebar', async function() {
      var cmd = `${framed} -scalebar "100 km" -scalebar "50 km" -o target=* map.svg`;
      var svg = String((await api.applyCommands(cmd))['map.svg']);
      assert(svg.includes('50 km'));
      assert(!svg.includes('100 km'));
      assert.equal(svg.match(/id="scalebar"/g).length, 1);
    });

    it('-scalebar remove removes the scalebar', async function() {
      var job = await runJob(`${framed} -scalebar -scalebar remove`);
      var frame = api.internal.getActiveFrame(job.catalog);
      assert.deepEqual(frame.dataset.layers.map(lyr => lyr.name), ['frame']);
    });

    it('-scalebar remove is an error if there is no scalebar', async function() {
      await assert.rejects(runJob(`${framed} -scalebar remove`), /no scalebar/);
    });

    it('-frame replace keeps the scalebar', async function() {
      var job = await runJob(`${framed} -scalebar "100 km" -frame width=400 replace`);
      var frame = api.internal.getActiveFrame(job.catalog);
      var scalebar = api.internal.findFrameFurnitureLayer(frame.dataset, 'scalebar');
      assert.equal(scalebar.data.getRecordAt(0).label, '100 km');
      assert.equal(job.catalog.getActiveLayer().layer, frame.layer);
      assert.equal(job.catalog.getDatasets().filter(function(dataset) {
        return dataset.layers.some(api.internal.layerIsFurniture);
      }).length, 1);
    });

    it('the frame scalebar is not exported as GeoJSON', async function() {
      var out = await api.applyCommands(`${framed} -scalebar -o target=* format=geojson`);
      assert.deepEqual(Object.keys(out).sort(), ['frame.json', 'two_states.json']);
    });

    it('units=km gives an automatic metric label', async function() {
      var svg = String((await api.applyCommands(
        `${framed} -scalebar units=km -o target=* map.svg`))['map.svg']);
      assert(/\d KM</.test(svg));
    });

    it('large-scale maps get labels in meters or feet', async function() {
      var small = `-i ${file} -proj lcc -frame bbox=0,0,500,300 width=600`;
      var svg1 = String((await api.applyCommands(
        `${small} -scalebar units=km -o target=* map.svg`))['map.svg']);
      var svg2 = String((await api.applyCommands(
        `${small} -scalebar -o target=* map.svg`))['map.svg']);
      assert(/>\d+ METERS</.test(svg1));
      assert(/>\d+ FEET</.test(svg2));
    });

    it('a units-only label gets an automatic length', async function() {
      var svg = String((await api.applyCommands(
        `${framed} -scalebar km -o target=* map.svg`))['map.svg']);
      assert(/\d KM</.test(svg));
    });

    it('dual-units shows metric and imperial distances', async function() {
      var svg = String((await api.applyCommands(
        `${framed} -scalebar dual-units -o target=* map.svg`))['map.svg']);
      assert(/MILES?</.test(svg));
      assert(/\d KM</.test(svg));
    });

    it('color, font and corner position options', async function() {
      var svg = String((await api.applyCommands(
        `${framed} -scalebar "100 km" position=bottom-right color=#c00 font-family=Georgia font-style=italic font-weight=bold -o target=* map.svg`))['map.svg']);
      var dx = Number(/<g transform="translate\(([\d.]+) /.exec(svg)[1]);
      assert(svg.includes('stroke="#c00"'));
      assert(svg.includes('font-family="Georgia"'));
      assert(svg.includes('font-style="italic"'));
      assert(svg.includes('font-weight="bold"'));
      assert(dx > 300);
    });

    it('an automatic length is up to 20% of the frame width, and at least 70px', async function() {
      var getBarLength = async function(width) {
        var svg = await exportSvg(`-i ${file} -proj lcc -frame width=${width} -scalebar`);
        return Number(/<path d="M 0 0 ([\d.]+) 0"/.exec(svg)[1]);
      };
      var len = await getBarLength(1000);
      assert(len > 130 && len <= 200, String(len));
      len = await getBarLength(600);
      assert(len > 80 && len <= 120, String(len));
      len = await getBarLength(300);
      assert(len >= 70 && len < 110, String(len));
    });

    it('a bare number is a distance in the units= option', async function() {
      var svg = await exportSvg(`${framed} -scalebar 150 units=km`);
      assert(svg.includes('>150 KM<'));
      svg = await exportSvg(`${framed} -scalebar 300,000 units=feet`);
      assert(svg.includes('>300,000 FEET<'));
      svg = await exportSvg(`${framed} -scalebar 1`);
      assert(svg.includes('>1 MILE<'));
    });

    it('a bare second distance gets the other unit system', async function() {
      var svg = await exportSvg(`${framed} -scalebar "100 km,50" style=b`);
      assert(svg.includes('>100 km<'));
      assert(svg.includes('>50 MILES<'));
    });

    it('a comma inside a number does not split the label', async function() {
      var svg = await exportSvg(`${framed} -scalebar "1,000 km"`);
      assert(svg.includes('>1,000 km<'));
    });

    it('rejects labels without usable units', async function() {
      await assert.rejects(runJob(`${framed} -scalebar "100 leagues"`), /Expected a distance or units/);
    });
  });
})

async function exportSvg(cmd) {
  return String((await api.applyCommands(cmd + ' -o target=* map.svg'))['map.svg']);
}

async function runJob(cmd) {
  var job = new api.internal.Job();
  await api.internal.runParsedCommands(api.internal.parseCommands(cmd), job);
  return job;
}
