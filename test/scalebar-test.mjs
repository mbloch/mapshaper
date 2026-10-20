import api from '../mapshaper.js';
import assert from 'assert';
import {
  formatDistanceLabel,
  getSteppedScalebarLabel,
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
      var frame = api.internal.getDefaultFrame(job.catalog);
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
      var frame = api.internal.getDefaultFrame(job.catalog);
      assert.deepEqual(frame.dataset.layers.map(lyr => lyr.name), ['frame']);
    });

    it('-scalebar remove is an error if there is no scalebar', async function() {
      await assert.rejects(runJob(`${framed} -scalebar remove`), /no scalebar/);
    });

    it('-frame replace keeps the scalebar', async function() {
      var job = await runJob(`${framed} -scalebar "100 km" -frame width=400 replace`);
      var frame = api.internal.getDefaultFrame(job.catalog);
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

    it('does not render a distance that rounds to zero pixels', async function() {
      var svg = await exportSvg(`${framed} -scalebar "0.001 m"`);
      assert(/<g id="scalebar"[^>]*>\s*<\/g>/.test(svg));
    });

    it('a units-only label gets an automatic length', async function() {
      var svg = String((await api.applyCommands(
        `${framed} -scalebar km -o target=* map.svg`))['map.svg']);
      assert(/\d km</.test(svg));
    });

    it('dual-units shows metric and imperial distances', async function() {
      var svg = String((await api.applyCommands(
        `${framed} -scalebar dual-units -o target=* map.svg`))['map.svg']);
      assert(/MILES?</.test(svg));
      assert(/\d KM</.test(svg));
    });

    it('style a with dual units has a shorter second bar below the first', async function() {
      var svg = await exportSvg(`${framed} -scalebar "100 km" style=a dual-units label-position=top-right`);
      var bars = /<path d="M 0 0 ([\d.]+) 0 M 0 ([\d.]+) ([\d.]+) [\d.]+"/.exec(svg).slice(1).map(Number);
      var texts = Array.from(svg.matchAll(/<text[^>]*transform="translate\(([\d.]+) ([\d.-]+)\)"[^>]*>([^<]*)</g),
        m => ({x: Number(m[1]), y: Number(m[2]), text: m[3]}));
      assert(bars[2] < bars[0]);
      assert(bars[1] > 0);
      assert.deepEqual(texts.map(o => o.text), ['100 km', '50 miles']);
      assert.equal(texts[0].x, bars[0]);
      assert.equal(texts[1].x, bars[2]);
      assert(texts[0].y < 0 && texts[1].y > bars[1]);
    });

    it('drops a zero label that is too close to the distance label', async function() {
      // Other test files in this worker may replace the bundle's measurer.
      api.internal.fonts.initNodeTextMeasurement();
      api.internal.svg.clearTextWidthCache();
      var world = '-i test/data/geojson/world_land.json -proj markley -frame width=800';
      var short = await exportSvg(`${world} -scalebar "100 miles" style=b`);
      var long = await exportSvg(`${world} -scalebar "5,000 miles" style=b`);
      assert(!short.includes('>0</text>'));
      assert(long.includes('>0</text>'));
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

    it('supports top-center and bottom-center positions', async function() {
      var getPosition = async function(position) {
        var svg = await exportSvg(`${framed} -scalebar "100 km" position=${position}`);
        var transform = /<g transform="translate\(([\d.]+) ([\d.]+)\)/.exec(svg);
        var length = Number(/<path d="M 0 0 ([\d.]+) 0"/.exec(svg)[1]);
        return {x: Number(transform[1]), y: Number(transform[2]), length: length};
      };
      var top = await getPosition('top-center');
      var bottom = await getPosition('bottom-center');
      assert.equal(top.x, (600 - top.length) / 2);
      assert.equal(bottom.x, (600 - bottom.length) / 2);
      assert(bottom.y > top.y);
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
      assert(svg.includes('>50 miles<'));
    });

    it('label-case= sets the case of every label', async function() {
      var svg = await exportSvg(`${framed} -scalebar "100 km" dual-units style=b label-case=upper`);
      assert(svg.includes('>100 KM<'));
      assert(/>\d+ MILES</.test(svg));
      svg = await exportSvg(`${framed} -scalebar dual-units label-case=lower`);
      assert(/>[\d,]+ km</.test(svg));
      assert(/>[\d,]+ miles?</.test(svg));
      svg = await exportSvg(`${framed} -scalebar "400 km" style=c dual-units label-case=upper`);
      assert(svg.includes('>400 KM<'));
      assert(svg.includes('>200 MILES<'));
    });

    it('a label in lower case gives lower case to the distances generated for it', async function() {
      var svg = await exportSvg(`${framed} -scalebar "100 km" dual-units style=b`);
      assert(svg.includes('>100 km<'));
      assert(/>\d+ miles</.test(svg));
      assert.equal(getSteppedScalebarLabel({label: '100 km', label_case: 'upper'}, null, 1), '150 KM');
    });

    it('rejects an unsupported label case', async function() {
      await assert.rejects(runJob(`${framed} -scalebar label-case=title`), /label case/);
    });

    it('a comma inside a number does not split the label', async function() {
      var svg = await exportSvg(`${framed} -scalebar "1,000 km"`);
      assert(svg.includes('>1,000 km<'));
    });

    it('rejects labels without usable units', async function() {
      await assert.rejects(runJob(`${framed} -scalebar "100 leagues"`), /Expected a distance or units/);
    });
  });

  describe('getSteppedScalebarLabel()', function() {
    var step = getSteppedScalebarLabel;

    it('steps a given length to the next automatic length', function() {
      assert.equal(step({label: '100 km'}, null, 1), '150 km');
      assert.equal(step({label: '100 km'}, null, -1), '75 km');
      assert.equal(step({label: '120 km'}, null, 1), '150 km');
      assert.equal(step({label: '120 km'}, null, -1), '100 km');
      assert.equal(step({label: '1 mile'}, null, -1), '1/2 mile');
    });

    it('a bare number is in the units option', function() {
      assert.equal(step({label: '150', units: 'km'}, null, 1), '200 KM');
      assert.equal(step({label: '150'}, null, 1), '200 MILES');
    });

    it('steps across units in the same system', function() {
      assert.equal(step({label: '1 km'}, null, -1), '500 meters');
      assert.equal(step({label: '500 m'}, null, 1), '1 km');
      assert.equal(step({label: '1/8 mile'}, null, -1), '500 feet');
      assert.equal(step({label: '500 feet'}, null, 1), '1/8 mile');
    });

    it('returns null past the ends of the list', function() {
      assert.strictEqual(step({label: '10,000 km'}, null, 1), null);
      assert.strictEqual(step({label: '5 m'}, null, -1), null);
    });

    it('keeps a second distance that is still shorter', function() {
      assert.equal(step({label: '100 km,50 miles'}, null, 1), '150 km,50 miles');
      assert.equal(step({label: '100 km,50 miles'}, null, -1), '75 km');
    });

    it('steps from the automatic length', async function() {
      // the bundle's copy, which has the projection library
      var step = api.internal.getSteppedScalebarLabel;
      var job = await runJob('-i test/data/geojson/two_states.json -proj lcc -frame width=600 -scalebar');
      var frame = api.internal.getDefaultFrame(job.catalog);
      var data = api.internal.getFrameLayerData(frame.layer, frame.dataset.arcs,
        api.internal.getDatasetCRS(frame.dataset));
      var svg = await exportSvg('-i test/data/geojson/two_states.json -proj lcc -frame width=600 -scalebar');
      var auto = /<text[^>]*>([^<]+ MILES)</.exec(svg)[1];
      var up = step({}, data, 1);
      var down = step({}, data, -1);
      assert(parseScalebarLabelToKm(up) > parseScalebarLabelToKm(auto));
      assert(parseScalebarLabelToKm(down) < parseScalebarLabelToKm(auto));
      assert.equal(step({label: up}, null, -1), auto);
      assert.strictEqual(step({}, null, 1), null);
    });
  });

  describe('style c', function() {
    var framed = '-i test/data/geojson/two_states.json -proj lcc -frame width=600';

    function getTexts(svg) {
      return Array.from(svg.matchAll(/<text[^>]*>([^<]*)</g), m => m[1]);
    }

    // [x1, x2] of each bar's outline, from top to bottom
    function getBars(svg) {
      return Array.from(svg.matchAll(/<path d="M ([\d.-]+) [\d.-]+ ([\d.-]+) [^"]*" fill="white"/g),
        m => [Number(m[1]), Number(m[2])]);
    }

    // the number of filled segments in each bar
    function getFilledCounts(svg) {
      return Array.from(svg.matchAll(/<path d="([^"]*)"[^>]* fill="black"/g),
        m => m[1].split('Z').length - 1);
    }

    it('a single bar has two segments, labeled at each division', async function() {
      var svg = await exportSvg(`${framed} -scalebar "50 miles" style=c`);
      assert.deepEqual(getTexts(svg), ['0', '25', '50 miles']);
      assert.deepEqual(getFilledCounts(svg), [1]);
    });

    it('a metric distance gets four segments over an imperial bar of two', async function() {
      var svg = await exportSvg(`${framed} -scalebar "400 km" style=c dual-units`);
      var bars = getBars(svg);
      var km = bars[0][1] - bars[0][0], mi = bars[1][1] - bars[1][0];
      assert.deepEqual(getTexts(svg), ['0', '100', '200', '300', '400 km', '0', '100', '200 miles']);
      assert.deepEqual(getFilledCounts(svg), [2, 1]);
      assert(Math.abs(mi / km - 200 * 1.60934 / 400) < 0.01);
      assert(Math.abs(bars[1][0] - (km - mi) / 2) <= 0.5); // centered
    });

    it('an imperial distance gets the same interval in km', async function() {
      var svg = await exportSvg(`${framed} -scalebar "100 miles" style=c dual-units`);
      var bars = getBars(svg);
      assert.deepEqual(getTexts(svg), ['0', '50', '100 km', '0', '50', '100 miles']);
      assert.deepEqual(getFilledCounts(svg), [1, 1]);
      assert(bars[0][1] - bars[0][0] < bars[1][1] - bars[1][0]);
    });

    it('align= lines up the shorter bar with the longer one', async function() {
      var left = getBars(await exportSvg(`${framed} -scalebar "400 km" style=c dual-units align=left`));
      var right = getBars(await exportSvg(`${framed} -scalebar "400 km" style=c dual-units align=right`));
      assert.equal(left[1][0], left[0][0]);
      assert.equal(right[1][1], right[0][1]);
    });

    it('rejects an unsupported alignment', async function() {
      await assert.rejects(runJob(`${framed} -scalebar style=c dual-units align=middle`), /alignment/);
    });

    it('dual-unit lengths get longer at every step, alternating four and two metric segments', function() {
      var d = {style: 'c', dual_units: true, label: '0.02 MILE,0.02 KM'};
      var labels = [d.label];
      var label;
      while ((label = getSteppedScalebarLabel(d, null, 1))) {
        labels.push(label);
        d = Object.assign({}, d, {label: label});
      }
      var split = api.internal.splitScalebarLabel;
      var getLongest = function(label) {
        return Math.max.apply(null, split(label).map(parseScalebarLabelToKm));
      };
      assert.equal(labels.length, 36);
      labels.forEach(function(label, i) {
        assert.equal(/KM$/.test(split(label)[0]), i % 2 == 1, label);
        if (i > 0) {
          assert(getLongest(label) > getLongest(labels[i - 1]), `${labels[i - 1]} -> ${label}`);
        }
      });
      assert.equal(getSteppedScalebarLabel({style: 'c', dual_units: true, label: '400 km'}, null, 1),
        '500 miles,500 km');
      assert.equal(getSteppedScalebarLabel({style: 'c', dual_units: true, label: '400 km'}, null, -1),
        '200 miles,200 km');
    });

    it('a single bar steps through twice the intervals', function() {
      assert.equal(getSteppedScalebarLabel({style: 'c', label: '100 km'}, null, 1), '200 km');
      assert.equal(getSteppedScalebarLabel({style: 'c', label: '100 km'}, null, -1), '50 km');
      assert.equal(getSteppedScalebarLabel({style: 'c', label: '1 mile'}, null, -1), '0.4 mile');
    });

    it('an automatic length fits within 20% of the frame width', async function() {
      var svg = await exportSvg(`${framed} -scalebar style=c dual-units`);
      var bars = getBars(svg);
      var longest = Math.max(bars[0][1] - bars[0][0], bars[1][1] - bars[1][0]);
      assert(longest <= 120 && longest >= 70, String(longest));
    });
  });

  describe('projections without an inverse', function() {
    it('the numerical scale factor matches the inverse projection', function() {
      ['+proj=robin', '+proj=moll +lon_0=90', '+proj=robin +units=km'].forEach(function(str) {
        var P = api.internal.parseCrsString(str);
        var forwardOnly = Object.assign(Object.create(Object.getPrototypeOf(P)), P, {inv: null});
        [[0, 0], [3e6, 4e6], [-1.2e7, -5e6]].forEach(function(xy) {
          var x = xy[0] / P.to_meter, y = xy[1] / P.to_meter;
          var k = api.internal.getScaleFactorAtXY(x, y, P);
          var k2 = api.internal.getScaleFactorAtXY(x, y, forwardOnly);
          assert(Math.abs(k2 / k - 1) < 1e-4, `${str} ${xy}: ${k} ${k2}`);
        });
      });
    });

    it('tolerates noise in the forward projection', function() {
      // Markley's forward projection is off by up to half a meter in places;
      // this is several times that, and varies between calls
      var R = 6378137;
      var P = api.internal.parseCrsString('+proj=markley +ellps=WGS84');
      var fwd = P.fwd;
      var seed = 1;
      var noise = function() {
        seed = (seed * 16807) % 2147483647;
        return (seed / 2147483647 - 0.5) * 4 / R;
      };
      P.fwd = function(lp, xy) {
        fwd(lp, xy);
        xy.x += noise();
        xy.y += noise();
      };
      [[0, 0], [1e6, 2e6], [-8e6, 3e6]].forEach(function(xy, i) {
        var k = api.internal.getScaleFactorAtXY(xy[0], xy[1], P);
        assert(Math.abs(k / [1.25145, 1.25881, 1.55863][i] - 1) < 1e-3, `${xy}: ${k}`);
      });
    });

    it('inverts points beside the seam at the center of the Markley projection', function() {
      // the nearest round-numbered location, 20,0, is on the seam
      var P = api.internal.parseCrsString('+proj=markley +ellps=WGS84');
      [[0.039, 0], [-0.039, 0], [0.039, -0.033]].forEach(function(xy) {
        var k = api.internal.getScaleFactorAtXY(xy[0] * 6378137, xy[1] * 6378137, P);
        assert(k > 1.2 && k < 1.3, `${xy}: ${k}`);
      });
    });

    it('a world map in the Markley projection gets an automatic scalebar', async function() {
      var svg = await exportSvg('-i test/data/geojson/world_land.json -proj markley -frame width=800 -scalebar');
      assert(/>[\d,]+ MILES</.test(svg));
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
