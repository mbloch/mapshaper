import api from '../mapshaper.js';
import { convertTextStylesToClasses, formatTextClassesAsCss } from '../src/html/html-text-classes';
import { addFontFallbacks, applyWebFonts } from '../src/html/html-font-stacks';
import { getPointAtCurveLength } from '../src/curves/mapshaper-curve-fit';
import { PNG } from 'pngjs';
import assert from 'assert';

// A 200 x 100 px frame, filled red, matching its coordinates one to one
var FRAME = '-rectangle bbox=0,0,200,100 name=frame -each \'type="frame", width=200, fill="#ff0000"\'';

async function exportHTML(cmd, outOpts) {
  return api.applyCommands(cmd + ' -o target=* out.html ' + (outOpts || ''));
}

async function html(cmd, outOpts) {
  var out = await exportHTML(cmd, outOpts);
  return String(out['out.html']);
}

function anchors(str) {
  return (str.match(/<svg x="[^"]*" y="[^"]*"/g) || []).map(function(s) {
    var m = /x="([^"]*)" y="([^"]*)"/.exec(s);
    return [m[1], m[2]];
  });
}

describe('HTML output', function () {

  describe('files', function () {
    it('writes an HTML fragment and a PNG image', async function () {
      var out = await exportHTML(FRAME);
      assert.deepEqual(Object.keys(out).sort(), ['out.html', 'out.png']);
      assert.ok(out['out.png'].subarray(1, 4).equals(Buffer.from('PNG')));
      assert.ok(String(out['out.html']).includes('<img class="ms-image" src="out.png" width="200" height="100"'));
    });

    it('is inferred from a .htm extension', async function () {
      var out = await api.applyCommands(FRAME + ' -o target=* map.htm');
      assert.deepEqual(Object.keys(out).sort(), ['map.htm', 'map.png']);
    });

    it('image-format=jpg writes a JPEG image', async function () {
      var out = await exportHTML(FRAME, 'image-format=jpg');
      assert.deepEqual(Object.keys(out).sort(), ['out.html', 'out.jpg']);
      assert.equal(out['out.jpg'][0], 0xFF);
      assert.equal(out['out.jpg'][1], 0xD8);
      assert.ok(String(out['out.html']).includes('src="out.jpg"'));
    });

    it('the image is twice the frame size by default, or pixel-ratio= times', async function () {
      var png = PNG.sync.read((await exportHTML(FRAME))['out.png']);
      assert.deepEqual([png.width, png.height], [400, 200]);
      png = PNG.sync.read((await exportHTML(FRAME, 'pixel-ratio=1'))['out.png']);
      assert.deepEqual([png.width, png.height], [200, 100]);
    });

    it('the image shows the shapes in the map', async function () {
      var png = PNG.sync.read((await exportHTML(FRAME, 'pixel-ratio=1'))['out.png']);
      var i = (50 * png.width + 100) * 4; // center pixel
      assert.deepEqual(Array.from(png.data.subarray(i, i + 4)), [255, 0, 0, 255]);
    });

    it('rejects an unknown image format', async function () {
      await assert.rejects(exportHTML(FRAME, 'image-format=gif'), /image-format/);
    });
  });

  describe('responsiveness', function () {
    it('fixed is the default, and sizes the map in pixels', async function () {
      var str = await html(FRAME);
      assert.ok(str.includes('#ms-out {position:relative;overflow:hidden;width:200px;height:100px;}'));
    });

    it('dynamic fills the width of the container, keeping the aspect ratio', async function () {
      var str = await html(FRAME, 'responsiveness=dynamic');
      assert.ok(str.includes('#ms-out {position:relative;overflow:hidden;width:100%;aspect-ratio:200 / 100;}'));
    });

    it('rejects other values', async function () {
      await assert.rejects(exportHTML(FRAME, 'responsiveness=fluid'), /responsiveness/);
    });
  });

  describe('overlay', function () {
    it('anchors point symbols at percentages of the map size', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=50,25 text=A -add-label coordinates=200,100 text=B');
      assert.deepEqual(anchors(str), [['25%', '75%'], ['100%', '0%']]);
      assert.ok(str.includes('<svg x="25%" y="75%" overflow="visible">\n<text y="0" x="0" class="ms-text-0">A</text>'));
    });

    it('draws polygons in the image and not in the overlay', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=50,25 text=A');
      assert.ok(!str.includes('<path d='));
      assert.ok(str.includes('<g id="labels">'));
      assert.ok(!str.includes('<g id="frame"'));
    });

    it('omits the overlay when there are no point layers', async function () {
      assert.ok(!(await html(FRAME)).includes('ms-overlay"'));
    });

    it('draws each point of a multipoint symbol, giving the id to the first', async function () {
      var input = {
        'pts.json': JSON.stringify({type: 'Feature', id: 'p', properties: {r: 3},
          geometry: {type: 'MultiPoint', coordinates: [[0, 0], [200, 100]]}})
      };
      var out = await api.applyCommands(FRAME + ' -i pts.json -o target=* out.html id-field=id margin=0', input);
      var str = String(out['out.html']);
      assert.equal((str.match(/<circle/g) || []).length, 2);
      assert.equal((str.match(/id="p"/g) || []).length, 1);
    });

    it('draws a halo as paint-order on one text element, not as a copy', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=50,25 text=A -style halo-width=2');
      assert.equal((str.match(/<text/g) || []).length, 1);
      assert.ok(/\.ms-text-0 \{[^}]*stroke-width:4px;[^}]*paint-order:stroke fill;/.test(str));
    });

    it('adds data-* attributes to symbol containers with svg-data=', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=50,25 text=A -each \'name="Alpha"\'', 'svg-data=name');
      assert.ok(str.includes('<svg x="25%" y="75%" overflow="visible" data-name="Alpha">'));
    });
  });

  describe('path labels', function () {
    var CURVE = FRAME + ' -add-label + name=labels coordinates=0,50,100,90,200,50 text=Curve';

    it('are anchored where their text attaches, with the path relative to the anchor', async function () {
      var str = await html(CURVE);
      assert.deepEqual(anchors(str), [['50%', '10%']]);
      assert.ok(/<path id="label-path-\w+" d="M -100 40 C [^"]* 0 0 C [^"]* 100 40"\/>/.test(str));
      assert.ok(str.includes('<textPath startOffset="50%" xlink:href="#label-path-'));
    });

    it('text-anchor=start anchors a label at the start of its path', async function () {
      var str = await html(CURVE + ' text-anchor=start');
      assert.deepEqual(anchors(str), [['0%', '50%']]);
    });

    it('label-start-offset= in px anchors a label that far along its path', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=0,50,200,50 text=Line label-start-offset=50');
      assert.deepEqual(anchors(str), [['25%', '50%']]);
    });
  });

  describe('text style classes', function () {
    it('labels with the same style share a class; different styles get their own', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=10,10 text=A font-size=14' +
        ' -add-label coordinates=20,20 text=B font-size=14 -add-label coordinates=30,30 text=C font-size=20');
      assert.deepEqual(str.match(/class="ms-text-\d"/g),
        ['class="ms-text-0"', 'class="ms-text-0"', 'class="ms-text-1"']);
      assert.ok(str.includes('#ms-out .ms-text-0 {font-family:sans-serif;font-size:14px;text-anchor:middle;}'));
      assert.ok(str.includes('#ms-out .ms-text-1 {font-family:sans-serif;font-size:20px;text-anchor:middle;}'));
      assert.ok(!/<text[^>]*font-size/.test(str));
    });

    it('font families are given fallbacks', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=10,10 text=A font-family=Georgia');
      assert.ok(str.includes('{font-family:Georgia, "Times New Roman", Times, serif;'));
    });

    it('the NYT web fonts are listed before the installed NYT fonts', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=10,10 text=A font-family=NYTFranklin' +
        ' -add-label coordinates=20,20 text=B font-family=NYTCheltenham');
      assert.ok(str.includes('{font-family:nyt-franklin, NYTFranklin, Helvetica, Arial, sans-serif;'));
      assert.ok(str.includes('{font-family:nyt-cheltenham, NYTCheltenham, "Times New Roman", Times, serif;'));
    });

    it('an installed NYT family with a weight in its name is given that weight', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=10,10 text=A font-family="NYT Franklin Medium"');
      assert.ok(str.includes('{font-family:nyt-franklin, "NYT Franklin Medium", Helvetica, Arial, sans-serif;'));
      assert.ok(str.includes('font-weight:500;'));
    });

    it('other fonts are not given web fonts', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=10,10 text=A font-family="Acme Sans"');
      assert.ok(str.includes('{font-family:"Acme Sans", Helvetica, Arial, sans-serif;'));
    });

    it('SVG output keeps the font families of the labels as they are', async function () {
      var out = await api.applyCommands(FRAME + ' -add-label + name=labels coordinates=10,10 text=A font-family=NYTFranklin -o target=* out.svg');
      var svg = String(out['out.svg']);
      assert.ok(svg.includes('font-family="NYTFranklin"'));
      assert.ok(!svg.includes('Arial'));
    });

    it('values from data cannot escape the <style> element', async function () {
      var str = await html(FRAME + ' -add-label + name=labels coordinates=10,10 text=A -each \'this.properties["font-family"]="x}</style><b>"\'');
      assert.ok(str.includes('{font-family:"x/styleb", Helvetica, Arial, sans-serif;font-size:12px;'));
      assert.equal(str.match(/<\/style>/g).length, 1);
    });
  });

  describe('convertTextStylesToClasses()', function () {
    it('folds layer text defaults into the classes of its labels', function () {
      var lyr = {tag: 'g', properties: {id: 'a', 'font-size': '12', fill: 'none'}, children: [
        {tag: 'text', properties: {x: 0, fill: 'red'}, value: 'A'}
      ]};
      var classes = convertTextStylesToClasses([lyr], 'c');
      assert.deepEqual(classes, [{name: 'c0', style: {'font-size': '12', fill: 'red'}}]);
      assert.deepEqual(lyr.properties, {id: 'a', fill: 'none'});
      assert.deepEqual(lyr.children[0].properties, {x: 0, class: 'c0'});
    });

    it('gives a tspan its own class, without the layer defaults', function () {
      var lyr = {tag: 'g', properties: {'font-size': '12'}, children: [
        {tag: 'text', properties: {}, children: [{tag: 'tspan', properties: {'font-weight': 'bold'}, value: 'B'}]}
      ]};
      var classes = convertTextStylesToClasses([lyr], 'c');
      assert.deepEqual(classes.map(function(o) { return o.style; }),
        [{'font-size': '12'}, {'font-weight': 'bold'}]);
    });

    it('keeps a class the label already has', function () {
      var lyr = {tag: 'g', properties: {}, children: [
        {tag: 'text', properties: {class: 'big', fill: 'red'}, value: 'A'}
      ]};
      convertTextStylesToClasses([lyr], 'c');
      assert.equal(lyr.children[0].properties.class, 'big c0');
    });

    it('formats bare lengths as px', function () {
      var css = formatTextClassesAsCss([{name: 'c0', style: {'font-size': 12, 'letter-spacing': '0.1em', opacity: 0.5}}], '#m');
      assert.equal(css, '#m .c0 {font-size:12px;letter-spacing:0.1em;opacity:0.5;}');
    });
  });

  describe('addFontFallbacks()', function () {
    it('adds common sans-serif fonts and the generic family', function () {
      assert.equal(addFontFallbacks('Helvetica'), 'Helvetica, Arial, sans-serif');
      assert.equal(addFontFallbacks('Arial'), 'Arial, Helvetica, sans-serif');
      assert.equal(addFontFallbacks('nyt-franklin'), 'nyt-franklin, Helvetica, Arial, sans-serif');
    });

    it('adds serif and monospace fallbacks to fonts of those kinds', function () {
      assert.equal(addFontFallbacks('Times New Roman'), '"Times New Roman", Times, serif');
      assert.equal(addFontFallbacks('Source Serif 4'), '"Source Serif 4", "Times New Roman", Times, serif');
      assert.equal(addFontFallbacks('Roboto Slab'), '"Roboto Slab", "Times New Roman", Times, serif');
      assert.equal(addFontFallbacks('Courier'), 'Courier, Menlo, Consolas, "Courier New", monospace');
      assert.equal(addFontFallbacks('JetBrains Mono'), '"JetBrains Mono", Menlo, Consolas, "Courier New", monospace');
    });

    it('treats a sans font with "serif" in its name as sans-serif', function () {
      assert.equal(addFontFallbacks('Source Sans Serif'), '"Source Sans Serif", Helvetica, Arial, sans-serif');
    });

    it('leaves a list that ends in a generic family as it is', function () {
      assert.equal(addFontFallbacks('sans-serif'), 'sans-serif');
      assert.equal(addFontFallbacks("'Helvetica Neue', serif"), '"Helvetica Neue", serif');
    });

    it('adds fallbacks after the fonts already listed, without repeating them', function () {
      assert.equal(addFontFallbacks('Franklin, arial'), 'Franklin, arial, Helvetica, sans-serif');
    });
  });

  describe('applyWebFonts()', function () {
    it('inserts each web font before its installed font, ignoring case and spaces', function () {
      assert.deepEqual(applyWebFonts({'font-family': 'Georgia, nytfranklin'}),
        {'font-family': 'Georgia, nyt-franklin, nytfranklin'});
      assert.deepEqual(applyWebFonts({'font-family': 'NYT Franklin'}),
        {'font-family': 'nyt-franklin, "NYT Franklin"'});
      assert.deepEqual(applyWebFonts({'font-family': 'NYTCheltenham Book'}),
        {'font-family': 'nyt-cheltenham, "NYTCheltenham Book"', 'font-weight': '400'});
    });

    it('takes a weight only from the first font', function () {
      assert.deepEqual(applyWebFonts({'font-family': '"NYTFranklin Medium"', 'font-weight': 'bold'}),
        {'font-family': 'nyt-franklin, "NYTFranklin Medium"', 'font-weight': '500'});
      assert.deepEqual(applyWebFonts({'font-family': 'Georgia, NYTFranklin Medium'}),
        {'font-family': 'Georgia, nyt-franklin, "NYTFranklin Medium"'});
    });

    it('does not repeat a web font that is already listed', function () {
      assert.deepEqual(applyWebFonts({'font-family': 'nyt-franklin, NYTFranklin'}),
        {'font-family': 'nyt-franklin, NYTFranklin'});
    });

    it('leaves other fonts as they are', function () {
      assert.deepEqual(applyWebFonts({'font-family': 'Georgia'}), {'font-family': 'Georgia'});
    });
  });

  describe('getPointAtCurveLength()', function () {
    it('measures along a straight path, clamped to its ends', function () {
      var knots = [[0, 0], [100, 0]];
      assert.deepEqual(getPointAtCurveLength(knots, 25).map(Math.round), [25, 0]);
      assert.deepEqual(getPointAtCurveLength(knots, -5), [0, 0]);
      assert.deepEqual(getPointAtCurveLength(knots, 500), [100, 0]);
    });

    it('returns null for a path that collapses to a point', function () {
      assert.equal(getPointAtCurveLength([[1, 1], [1, 1]], 0), null);
    });
  });
});
