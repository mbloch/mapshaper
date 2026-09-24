import api from '../mapshaper.js';
import assert from 'assert';
import { getCalloutShape, getControlPoint, getLabelTextBox,
  getCalloutGap, getDefaultCalloutEndSize } from '../src/svg/svg-label-callout.mjs';
import { renderPoint } from '../src/svg/svg-symbols.mjs';
import { setTextMeasureFunction,
  clearTextWidthCache } from '../src/svg/svg-label-metrics.mjs';

// A block of text above and to the right of the anchor
var BOX = {xmin: 20, xmax: 80, ymin: -40, ymax: -20, midline: -35};

function shape(o) {
  return getCalloutShape(Object.assign({type: 'line', box: BOX, padding: 0,
    gap: 0, end: 'none', width: 1}, o));
}

function near(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' expected ' + b + ', got ' + a);
}

function nearPoint(p, q) {
  near(p[0], q[0], 'x');
  near(p[1], q[1], 'y');
}

// The angle at @p between the lines to @a and @b, in degrees
function angleAt(p, a, b) {
  var t = Math.atan2(a[1] - p[1], a[0] - p[0]) - Math.atan2(b[1] - p[1], b[0] - p[0]);
  var deg = Math.abs(t) * 180 / Math.PI;
  return deg > 180 ? 360 - deg : deg;
}

function bezierPoint(c, t) {
  var u = 1 - t;
  return [
    u * u * c[0][0] + 2 * u * t * c[1][0] + t * t * c[2][0],
    u * u * c[0][1] + 2 * u * t * c[1][1] + t * t * c[2][1]
  ];
}

function findChild(o, fn) {
  var found = null;
  (o.children || []).forEach(function(child) {
    if (!found && fn(child)) found = child;
  });
  return found;
}

function isCallout(o) {
  return o.properties && o.properties.class == 'label-callout';
}

describe('svg-label-callout.mjs', function () {

  describe('getCalloutShape()', function () {
    it('reports the points the shape was worked out from, for the GUI\'s handles', function () {
      var o = shape({type: 'elbow', padding: 2, gap: 5});
      assert.deepEqual(o.box, {xmin: 18, xmax: 82, ymin: -42, ymax: -18, midline: -35});
      nearPoint(o.attach, [18, -35]);
      nearPoint(o.via, [0, -35]);
      near(Math.hypot(o.tip[0], o.tip[1]), 5);
      assert.strictEqual(shape({}).via, null);
    });

    it('aims a straight line at the middle of the text and stops at its edge', function () {
      var o = shape({});
      assert.equal(o.kind, 'polyline');
      assert.equal(o.coords.length, 2);
      nearPoint(o.coords[0], [0, 0]);
      // the segment to the centre (50,-30) enters the box at its bottom edge
      nearPoint(o.coords[1], [100 / 3, -20]);
    });

    it('stops short of the text by the padding', function () {
      var o = shape({padding: 5});
      near(o.coords[1][1], -15);
    });

    it('draws nothing when the anchor is inside the padded text box', function () {
      assert.strictEqual(shape({box: {xmin: -10, xmax: 10, ymin: -5, ymax: 5, midline: 0}}), null);
      assert.strictEqual(shape({padding: 25}), null);
    });

    it('meets an elbow at the side facing the anchor, level with the first line', function () {
      var o = shape({type: 'elbow'});
      nearPoint(o.coords[2], [20, -35]);
      // too close horizontally for 45 degrees, so the first leg is vertical
      nearPoint(o.coords[1], [0, -35]);
    });

    it('rises at 45 degrees to a horizontal landing when there is room', function () {
      var o = shape({type: 'elbow', box: {xmin: 100, xmax: 160, ymin: -40, ymax: -20, midline: -35}});
      nearPoint(o.coords[1], [35, -35]);
      nearPoint(o.coords[2], [100, -35]);
    });

    it('meets text on the left of the anchor on its right side', function () {
      var o = shape({type: 'elbow', box: {xmin: -160, xmax: -100, ymin: -40, ymax: -20, midline: -35}});
      nearPoint(o.coords[2], [-100, -35]);
      nearPoint(o.coords[1], [-35, -35]);
    });

    it('turns an elbow at its via point', function () {
      var o = shape({type: 'elbow', via: [-10, -60]});
      nearPoint(o.coords[1], [-10, -60]);
      // the via point is left of the text, so the line meets its left side
      nearPoint(o.coords[2], [20, -35]);
    });

    it('meets text above the anchor at its bottom edge, leaving the anchor horizontally', function () {
      // the anchor is under the block, so a side landing would cross it
      var o = shape({type: 'elbow', box: {xmin: -30, xmax: 50, ymin: -60, ymax: -20, midline: -55}});
      assert.equal(o.coords.length, 3);
      nearPoint(o.coords[1], [10, 0]);
      nearPoint(o.coords[2], [10, -20]);
    });

    it('meets text below the anchor at its top edge', function () {
      var o = shape({type: 'elbow', box: {xmin: -50, xmax: 10, ymin: 20, ymax: 60, midline: 25}});
      nearPoint(o.coords[1], [-20, 0]);
      nearPoint(o.coords[2], [-20, 20]);
    });

    it('goes straight up to text centred over the anchor', function () {
      var o = shape({type: 'elbow', end: 'arrow',
        box: {xmin: -40, xmax: 40, ymin: -60, ymax: -20, midline: -55}});
      assert.equal(o.coords.length, 2);
      nearPoint(o.coords[1], [0, -20]);
      assert.ok(o.head, 'an arrowhead has a direction to point in');
    });

    it('goes straight up instead of taking a jog too short for its marker', function () {
      var box = {xmin: -30, xmax: 50, ymin: -60, ymax: -20, midline: -55};
      assert.equal(shape({type: 'elbow', box: box}).coords.length, 3);
      var o = shape({type: 'elbow', box: box, end: 'arrow', endSize: 8});
      assert.equal(o.coords.length, 2);
      nearPoint(o.coords[1], [0, -20]);
      box = {xmin: -34, xmax: 46, ymin: -60, ymax: -20, midline: -55};
      assert.equal(shape({type: 'elbow', box: box}).coords.length, 2);
    });

    it('lands vertically from a via point under the text', function () {
      var o = shape({type: 'elbow', via: [30, 10],
        box: {xmin: -30, xmax: 50, ymin: -60, ymax: -20, midline: -55}});
      nearPoint(o.coords[1], [30, 10]);
      nearPoint(o.coords[2], [30, -20]);
    });

    it('leaves the anchor horizontally toward an attachment on the bottom edge', function () {
      var o = shape({type: 'elbow', attach: [0.5, 1]});
      nearPoint(o.coords[2], [50, -20]);
      nearPoint(o.coords[1], [50, 0]);
    });

    it('passes a curve through its via point', function () {
      var o = shape({type: 'curve', via: [10, -50]});
      assert.equal(o.kind, 'bezier');
      nearPoint(bezierPoint(o.coords, 0.5), [10, -50]);
      nearPoint(o.coords[0], [0, 0]);
    });

    it('bows an automatic curve to text on its right upward', function () {
      var o = shape({type: 'curve', box: {xmin: 100, xmax: 160, ymin: -10, ymax: 10, midline: -5}});
      var mid = bezierPoint(o.coords, 0.5);
      assert.ok(mid[1] < -10, 'midpoint is above the chord: ' + mid[1]);
    });

    it('meets the text where callout-attach says, on the padded box', function () {
      var o = shape({attach: [0, 0.5], padding: 2});
      nearPoint(o.coords[1], [18, -30]);
      o = shape({attach: [1, 1]});
      nearPoint(o.coords[1], [80, -20]);
    });

    it('clamps attach fractions to the box', function () {
      var o = shape({attach: [-1, 2]});
      nearPoint(o.coords[1], [20, -20]);
    });

    it('stops the gap short of the anchor, on a circle around it', function () {
      var o = shape({box: {xmin: -10, xmax: 10, ymin: -120, ymax: -100, midline: -115}, gap: 5});
      nearPoint(o.coords[0], [0, -5]);
      o = shape({type: 'curve', via: [30, -50], gap: 5});
      near(Math.hypot(o.coords[0][0], o.coords[0][1]), 5);
      // trimming keeps the rest of the curve where it was
      nearPoint(o.coords[2], shape({type: 'curve', via: [30, -50]}).coords[2]);
    });

    it('carries an elbow\'s gap past a first leg shorter than it', function () {
      var o = shape({type: 'elbow', via: [0, -3], gap: 5});
      assert.equal(o.coords.length, 2);
      near(Math.hypot(o.coords[0][0], o.coords[0][1]), 5);
    });

    it('draws nothing when the gap leaves no line', function () {
      assert.strictEqual(shape({gap: 500}), null);
    });

    it('puts an arrowhead\'s tip at the anchor end and stops the line inside it', function () {
      var o = shape({box: {xmin: -10, xmax: 10, ymin: -120, ymax: -100, midline: -115},
        end: 'arrow', gap: 4});
      nearPoint(o.head[0], [0, -4]);
      // pointing down at the anchor: the base is above the tip
      assert.ok(o.head[1][1] < -4 && o.head[2][1] < -4);
      near(o.head[1][1], o.head[2][1]);
      assert.ok(o.coords[0][1] < -4 && o.coords[0][1] > o.head[1][1]);
    });

    it('sizes the arrowhead from the line width', function () {
      var thin = shape({end: 'arrow', width: 1});
      var thick = shape({end: 'arrow', width: 3});
      var len = function(o) { return Math.hypot(o.head[1][0] - o.head[0][0], o.head[1][1] - o.head[0][1]); };
      assert.ok(len(thick) > len(thin));
    });

    it('sizes an arrowhead by callout-end-size, as the length of its sides', function () {
      var o = shape({box: {xmin: -10, xmax: 10, ymin: -120, ymax: -100, midline: -115},
        end: 'arrow', endSize: 12});
      near(Math.hypot(o.head[1][0] - o.head[0][0], o.head[1][1] - o.head[0][1]), 12);
      near(angleAt(o.head[0], o.head[1], o.head[2]), 44);
    });

    it('runs a curve into the middle of a solid arrowhead\'s base, along its axis', function () {
      var o = shape({type: 'curve', end: 'arrow', endSize: 14, via: [-40, -40],
        box: {xmin: 20, xmax: 80, ymin: -120, ymax: -100, midline: -115}});
      var tip = o.head[0];
      var mid = [(o.head[1][0] + o.head[2][0]) / 2, (o.head[1][1] + o.head[2][1]) / 2];
      var headLen = Math.hypot(mid[0] - tip[0], mid[1] - tip[1]);
      var axis = [(mid[0] - tip[0]) / headLen, (mid[1] - tip[1]) / headLen];
      var c = o.coords;
      var along = function(p) { return (p[0] - tip[0]) * axis[0] + (p[1] - tip[1]) * axis[1]; };
      var across = function(p) { return (p[0] - tip[0]) * axis[1] - (p[1] - tip[1]) * axis[0]; };
      assert.equal(o.kind, 'bezier');
      // starts at the middle of the base, heading along the head's axis
      nearPoint(c[0], mid);
      near(across(c[1]), 0);
      assert.ok(along(c[1]) > headLen);
      // and still arrives at the text from the same direction
      var plain = shape({type: 'curve', via: [-40, -40],
        box: {xmin: 20, xmax: 80, ymin: -120, ymax: -100, midline: -115}});
      var dirIn = function(q) {
        var d = Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]);
        return [(q[2][0] - q[1][0]) / d, (q[2][1] - q[1][1]) / d];
      };
      nearPoint(c[2], plain.coords[2]);
      nearPoint(dirIn(c), dirIn(plain.coords));
    });

    it('gives the default line a 10px arrowhead', function () {
      assert.equal(getDefaultCalloutEndSize('arrow', 1), 10);
    });

    it('draws an open arrowhead as a wider chevron the line runs into', function () {
      var o = shape({box: {xmin: -10, xmax: 10, ymin: -120, ymax: -100, midline: -115},
        end: 'open-arrow', endSize: 10, width: 2});
      assert.strictEqual(o.head, null);
      assert.equal(o.openHead.length, 3);
      // the point is set back half a line width, where the round join ends
      nearPoint(o.openHead[1], [0, -1]);
      nearPoint(o.coords[0], [0, -1]);
      near(o.openHead[0][1], o.openHead[2][1]);
      near(o.openHead[0][0], -o.openHead[2][0]);
      near(angleAt(o.openHead[1], o.openHead[0], o.openHead[2]), 70);
      // the join and the far cap each add half a line width to what is drawn
      near(Math.hypot(o.openHead[0][0] - o.openHead[1][0],
        o.openHead[0][1] - o.openHead[1][1]) + 2, 10);
    });

  });

  describe('getControlPoint()', function () {
    it('is the control point of the quadratic through the via point at t=0.5', function () {
      var a = [0, 0], v = [5, -20], t = [40, -10];
      nearPoint(bezierPoint([a, getControlPoint(a, v, t), t], 0.5), v);
    });
  });

  describe('getCalloutGap()', function () {
    it('runs a plain line to the edge of the symbol at the anchor by default', function () {
      assert.equal(getCalloutGap({}, 4.5), 4.5);
      assert.equal(getCalloutGap({'callout-end': 'none'}, 4.5), 4.5);
      assert.equal(getCalloutGap({}, 0), 0);
    });

    it('stops an arrowhead clear of the symbol by default', function () {
      assert.equal(getCalloutGap({'callout-end': 'arrow'}, 4.5), 6.5);
      assert.equal(getCalloutGap({'callout-end': 'open-arrow'}, 4.5), 6.5);
      assert.equal(getCalloutGap({'callout-end': 'arrow'}, 0), 0);
    });

    it('uses callout-gap when set, including 0', function () {
      assert.equal(getCalloutGap({'callout-gap': 0}, 4.5), 0);
      assert.equal(getCalloutGap({'callout-gap': 8}, 4.5), 8);
    });
  });

  describe('getLabelTextBox()', function () {
    beforeEach(function () {
      setTextMeasureFunction(function () { return 60; });
      clearTextWidthCache();
    });
    afterEach(function () {
      setTextMeasureFunction(null);
      clearTextWidthCache();
    });

    it('places the measured block by the drawn offset and justification', function () {
      var box = getLabelTextBox({'label-text': 'Hello', 'font-size': 10,
        dx: 30, dy: -20, 'text-anchor': 'start'});
      near(box.xmin, 30);
      near(box.xmax, 90);
      near(box.ymin, -28);
      near(box.ymax, -18);
    });

    it('centres on the inherited middle anchor when none is set', function () {
      var box = getLabelTextBox({'label-text': 'Hello', 'font-size': 10});
      near(box.xmin, -30);
      near(box.xmax, 30);
    });

    it('grows downward by one line height per extra line, soft or hard', function () {
      var one = getLabelTextBox({'label-text': 'a', 'font-size': 10});
      var three = getLabelTextBox({'label-text': 'a <wbr>b\\nc', 'font-size': 10,
        'line-height': 15});
      near(three.ymin, one.ymin);
      near(three.ymax - one.ymax, 30);
    });

    it('falls back on label-width when the text cannot be measured', function () {
      setTextMeasureFunction(null);
      var box = getLabelTextBox({'label-text': 'Hello', 'label-width': 100,
        'text-anchor': 'start'});
      near(box.xmax - box.xmin, 100);
      box = getLabelTextBox({'label-text': 'Hello', 'text-anchor': 'start', dx: 5});
      near(box.xmin, 5);
      near(box.xmax, 5);
    });
  });

  describe('renderPoint()', function () {
    beforeEach(function () {
      setTextMeasureFunction(function () { return 60; });
      clearTextWidthCache();
    });
    afterEach(function () {
      setTextMeasureFunction(null);
      clearTextWidthCache();
    });

    var rec = {'label-text': 'Hello', 'text-anchor': 'start', dx: 40, dy: -40,
      callout: 'line'};

    it('draws the callout beneath the text', function () {
      var o = renderPoint(rec);
      assert.equal(o.tag, 'g');
      assert.ok(isCallout(o.children[0]));
      assert.equal(o.children[1].tag, 'text');
      var line = o.children[0].children[0];
      assert.equal(line.tag, 'path');
      assert.equal(line.properties.fill, 'none');
      assert.equal(line.properties.stroke, 'black');
      assert.equal(line.properties['stroke-width'], 1);
      assert.ok(/ L 0 0$/.test(line.properties.d), line.properties.d);
    });

    it('draws it beneath the icon too', function () {
      var o = renderPoint(Object.assign({icon: 'circle', 'icon-size': 10}, rec));
      assert.ok(isCallout(o.children[0]));
      assert.equal(o.children[1].tag, 'circle');
      assert.equal(o.children[2].tag, 'text');
    });

    it('runs a plain line to the icon\'s edge, and stops an arrow clear of it', function () {
      function endDistance(props) {
        var d = renderPoint(Object.assign({icon: 'circle', 'icon-size': 10}, rec, props))
          .children[0].children[0].properties.d;
        var end = d.split(' L ').pop().split(' ').map(Number);
        return Math.hypot(end[0], end[1]);
      }
      // icon radius 4.5, to the nearest tenth
      assert.ok(Math.abs(endDistance({}) - 4.5) < 0.1);
      // plus 2px of clearance to the arrowhead's point, which an open one's
      // round join reaches half the 1px line past
      assert.ok(Math.abs(endDistance({'callout-end': 'open-arrow'}) - 7) < 0.1);
    });

    it('takes the text colour unless it has its own', function () {
      var o = renderPoint(Object.assign({fill: 'red'}, rec));
      assert.equal(o.children[0].children[0].properties.stroke, 'red');
      o = renderPoint(Object.assign({fill: 'red', 'callout-color': 'blue'}, rec));
      assert.equal(o.children[0].children[0].properties.stroke, 'blue');
    });

    it('fades with the label unless it has its own opacity', function () {
      assert.equal(renderPoint(Object.assign({opacity: 0.5}, rec)).children[0].properties.opacity, 0.5);
      assert.equal(renderPoint(Object.assign({opacity: 0.5, 'callout-opacity': 0.8}, rec))
        .children[0].properties.opacity, 0.8);
      assert.equal('opacity' in renderPoint(rec).children[0].properties, false);
    });

    it('draws a solid arrowhead as a filled shape', function () {
      var o = renderPoint(Object.assign({'callout-end': 'arrow'}, rec)).children[0];
      assert.equal(o.children.length, 2);
      assert.ok(/ Z$/.test(o.children[1].properties.d));
      assert.equal(o.children[1].properties.fill, 'black');
    });

    it('draws an open arrowhead as a stroked path in the line\'s width', function () {
      var o = renderPoint(Object.assign({'callout-end': 'open-arrow', 'callout-width': 2}, rec))
        .children[0];
      var head = o.children[1].properties;
      assert.equal(o.children.length, 2);
      assert.equal(head.fill, 'none');
      assert.equal(head.stroke, 'black');
      assert.equal(head['stroke-width'], 2);
      assert.ok(!/Z/.test(head.d));
    });

    it('draws a curve as a quadratic', function () {
      var o = renderPoint(Object.assign({}, rec, {callout: 'curve'}));
      assert.ok(/^M [-.0-9]+ [-.0-9]+ Q /.test(o.children[0].children[0].properties.d));
    });

    it('draws nothing for callout=none, or for a label without text', function () {
      assert.equal(renderPoint(Object.assign({}, rec, {callout: 'none'})).tag, 'text');
      assert.strictEqual(renderPoint({'label-text': '', callout: 'line'}), null);
    });

    it('leaves a label without a callout as it was', function () {
      var o = renderPoint({'label-text': 'Hello', 'callout-color': 'red'});
      assert.equal(o.tag, 'text');
    });
  });

  describe('-style', function () {
    var POINT = JSON.stringify({type: 'Feature', properties: {'label-text': 'Hi'},
      geometry: {type: 'Point', coordinates: [0, 0]}});

    async function styled(opts) {
      var out = await api.applyCommands('-i point.json -style ' + opts + ' -o out.json',
        {'point.json': POINT});
      return JSON.parse(out['out.json']).features[0].properties;
    }

    it('stores callout properties in their own types', async function () {
      var p = await styled('callout=Elbow callout-end=arrow callout-via="10.5,-20" ' +
        'callout-attach=0,0.5 callout-gap=3 callout-width=1.5 callout-color=#333 ' +
        'label-width=150');
      assert.equal(p.callout, 'elbow');
      assert.equal(p['callout-end'], 'arrow');
      assert.equal(p['callout-via'], '10.5,-20');
      assert.equal(p['callout-attach'], '0,0.5');
      assert.strictEqual(p['callout-gap'], 3);
      assert.strictEqual(p['callout-width'], 1.5);
      assert.equal(p['callout-color'], '#333');
      assert.strictEqual(p['label-width'], 150);
    });

    it('accepts an open arrowhead and a marker size', async function () {
      var p = await styled('callout=line callout-end=open-arrow callout-end-size=9');
      assert.equal(p['callout-end'], 'open-arrow');
      assert.strictEqual(p['callout-end-size'], 9);
    });

    it('normalizes a point pair', async function () {
      var p = await styled('callout-via=" 10 , -20.50 "');
      assert.equal(p['callout-via'], '10,-20.5');
    });

    it('rejects an unknown callout shape or end', async function () {
      await assert.rejects(styled('callout=zigzag'));
      await assert.rejects(styled('callout-end=star'));
      // a dot at the anchor is the label's icon
      await assert.rejects(styled('callout-end=dot'));
    });

    it('removes a callout with an empty value', async function () {
      var p = await styled('callout=line callout-via=1,2 -style callout= callout-via=');
      assert.equal('callout' in p, false);
      assert.equal('callout-via' in p, false);
    });
  });

  describe('SVG export', function () {
    it('writes the callout into the label\'s group', async function () {
      var point = JSON.stringify({type: 'Feature', properties: {'label-text': 'Hi',
        dx: 30, dy: -30, callout: 'line', 'callout-end': 'arrow'},
        geometry: {type: 'Point', coordinates: [0, 0]}});
      var out = await api.applyCommands('-i point.json -o out.svg', {'point.json': point});
      var svg = String(out['out.svg']);
      assert.ok(/<g class="label-callout">\s*<path d="M [^"]+ L [^"]+" fill="none" stroke="black"/.test(svg), svg);
      assert.ok(/<path d="M 0 0 L [^"]+ Z" fill="black"\/>/.test(svg), svg);
      assert.ok(svg.indexOf('label-callout') < svg.indexOf('<text'));
    });
  });
});
