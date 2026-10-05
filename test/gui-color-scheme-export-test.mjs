import assert from 'assert';
import {
  getDefaultScheme, getDefaultSchemeOfType, getDefaultCategoricalScheme, setTileCount, setSchemeContinuous,
  setSchemeNeutral, updateDivergingLayout, choosePreset, formatSchemeCommand, getAppliedColors,
  getCategories, setSchemeMethod
} from '../src/gui/gui-color-scheme-model';
import {
  getExportClasses, getSchemeExportData, formatSchemeJSON, formatSchemeCPT, getSchemeExportFileName
} from '../src/gui/gui-color-scheme-export';
import api from '../mapshaper.js';

var internal = api.internal;
var values = [-40, -30, -20, -10, 5, 10, 20, 30, 40, 50, 60, 70];

function makeLayer(records) {
  return {name: 'counties', geometry_type: 'polygon', shapes: records.map(function() { return null; }),
    data: new internal.DataTable(records)};
}

function testLayer() {
  return makeLayer(values.map(function(v) { return {change: v, name: v < 0 ? 'down' : 'up'}; })
    .concat([{change: null, name: ''}]));
}

function hex(color) {
  return internal.formatColor(internal.parseColor(color));
}

// Enough of the MapLibre expression language for the exported expressions
function evaluate(expr, props) {
  var op, input, i;
  if (!Array.isArray(expr)) return expr;
  op = expr[0];
  if (op == 'get') return props[expr[1]];
  if (op == 'typeof') {
    input = evaluate(expr[1], props);
    return input === null || input === undefined ? 'null' : typeof input;
  }
  if (op == 'to-string') {
    input = evaluate(expr[1], props);
    return input === null || input === undefined ? '' : String(input);
  }
  if (op == '!=') return evaluate(expr[1], props) != evaluate(expr[2], props);
  if (op == '<') return evaluate(expr[1], props) < evaluate(expr[2], props);
  if (op == 'case') {
    for (i=1; i<expr.length - 1; i+=2) {
      if (evaluate(expr[i], props)) return evaluate(expr[i + 1], props);
    }
    return evaluate(expr[expr.length - 1], props);
  }
  if (op == 'match') {
    input = evaluate(expr[1], props);
    for (i=2; i<expr.length - 1; i+=2) {
      if ([].concat(expr[i]).includes(input)) return expr[i + 1];
    }
    return expr[expr.length - 1];
  }
  if (op == 'step') {
    input = evaluate(expr[1], props);
    var out = expr[2];
    for (i=3; i<expr.length; i+=2) {
      if (input >= expr[i]) out = expr[i + 1];
    }
    return out;
  }
  if (op == 'interpolate') {
    input = evaluate(expr[2], props);
    var stops = [];
    for (i=3; i<expr.length; i+=2) stops.push([expr[i], expr[i + 1]]);
    if (input <= stops[0][0]) return stops[0][1];
    for (i=1; i<stops.length; i++) {
      if (input <= stops[i][0]) {
        var t = (input - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return mixRGB(stops[i - 1][1], stops[i][1], t);
      }
    }
    return stops[stops.length - 1][1];
  }
  throw new Error('Unknown op: ' + op);
}

function mixRGB(a, b, t) {
  var ca = internal.parseColor(a), cb = internal.parseColor(b);
  return internal.formatColor({r: Math.round(ca.r + (cb.r - ca.r) * t),
    g: Math.round(ca.g + (cb.g - ca.g) * t), b: Math.round(ca.b + (cb.b - ca.b) * t)});
}

async function getFills(scheme, lyr) {
  var cmd = formatSchemeCommand(scheme, getAppliedColors(scheme, getCategories(lyr, scheme.field).length));
  var out = await api.applyCommands('-i data.json ' + cmd + ' -o', {'data.json': lyr.data.getRecords()});
  return JSON.parse(out['data.json']).map(function(d) { return hex(d.fill); });
}

function getExpressionFills(scheme, lyr) {
  var expr = getSchemeExportData(scheme, lyr).maplibre;
  return lyr.data.getRecords().map(function(rec) { return hex(evaluate(expr, rec)); });
}

function classed(lyr) {
  return setTileCount(Object.assign(getDefaultScheme('change'), {method: 'equal-interval'}), 4);
}

describe('gui-color-scheme-export.mjs', function() {

  it('classes run from the data min to the max', function() {
    var lyr = testLayer();
    var classes = getExportClasses(classed(lyr), lyr);
    assert.deepEqual(classes.map(function(c) { return [c.from, c.to]; }),
      [[-40, -12.5], [-12.5, 15], [15, 42.5], [42.5, 70]]);
    assert(classes.every(function(c) { return /^#[0-9a-f]{6}$/.test(c.color); }));
  });

  it('the JSON has breaks and colors for d3.scaleThreshold', function() {
    var lyr = testLayer();
    var scheme = choosePreset(classed(lyr), 'Blues');
    var data = JSON.parse(formatSchemeJSON(scheme, lyr));
    assert.equal(data.type, 'sequential');
    assert.equal(data.field, 'change');
    assert.equal(data.palette, 'Blues');
    assert.equal(data.continuous, false);
    assert.deepEqual(data.breaks, [-12.5, 15, 42.5]);
    assert.equal(data.colors.length, 4);
    assert.equal(data.nullColor, '#eeeeee');
    assert.equal(data.maplibre[0], 'case');
  });

  it('the MapLibre expression colors features as -classify does', async function() {
    var lyr = testLayer();
    var schemes = [
      classed(lyr),
      Object.assign(getDefaultScheme('change'), {method: 'quantile'}),
      updateDivergingLayout(getDefaultSchemeOfType('diverging', lyr), lyr),
      updateDivergingLayout(setSchemeNeutral(getDefaultSchemeOfType('diverging', lyr), false), lyr),
      setSchemeMethod(getDefaultCategoricalScheme(lyr), 'categorical', 'name', 2)
    ];
    for (var scheme of schemes) {
      assert.deepEqual(getExpressionFills(scheme, lyr), await getFills(scheme, lyr), scheme.type + ' ' + scheme.method);
    }
  });

  it('continuous colors: the stops\' colors, and a jump at a diverging pivot', function() {
    var lyr = testLayer();
    var seq = Object.assign(setSchemeContinuous(getDefaultScheme('change'), true), {method: 'equal-interval'});
    var classes = getExportClasses(seq, lyr);
    assert.equal(classes.length, 4);
    assert(classes.every(function(c) { return c.colors.length == 2; }));
    assert.equal(classes[0].colors[1], classes[1].colors[0]);
    var expr = getSchemeExportData(seq, lyr).maplibre[3];
    assert.equal(expr[0], 'interpolate');
    assert.deepEqual(expr.filter(function(v, i) { return i > 2 && i % 2 == 1; }), [-40, -12.5, 15, 42.5, 70]);

    var div = updateDivergingLayout(setSchemeContinuous(getDefaultSchemeOfType('diverging', lyr), true), lyr);
    classes = getExportClasses(div, lyr);
    var k = classes.findIndex(function(c) { return c.from === 0; });
    assert(k > 0);
    assert.notEqual(classes[k - 1].colors[1], classes[k].colors[0]);
    expr = getSchemeExportData(div, lyr).maplibre[3];
    assert.equal(expr[0], 'case');
    assert.deepEqual(expr[1], ['<', ['get', 'change'], 0]);
    // the stops are colored as the tiles
    var data = getSchemeExportData(div, lyr);
    assert.equal(hex(evaluate(data.maplibre, {change: -40})), classes[0].colors[0]);
    assert.equal(hex(evaluate(data.maplibre, {change: 70})), classes[classes.length - 1].colors[1]);
    assert.equal(evaluate(data.maplibre, {change: null}), '#eeeeee');
  });

  it('a continuous pivot class is a flat color between the sides', function() {
    var lyr = testLayer();
    var scheme = setSchemeNeutral(setSchemeContinuous(getDefaultSchemeOfType('diverging', lyr), true), true);
    scheme = updateDivergingLayout(scheme, lyr);
    var classes = getExportClasses(scheme, lyr);
    var neutral = classes.filter(function(c) { return c.color; });
    assert.equal(neutral.length, 1);
    var data = getSchemeExportData(scheme, lyr);
    var mid = (neutral[0].from + neutral[0].to) / 2;
    assert.equal(hex(evaluate(data.maplibre, {change: mid})), neutral[0].color);
  });

  it('a GMT palette table: a line per class, then B, F and N', function() {
    var lyr = testLayer();
    var scheme = choosePreset(classed(lyr), 'Blues');
    var cpt = formatSchemeCPT(scheme, lyr);
    var lines = cpt.trim().split('\n').filter(function(line) { return line[0] != '#'; });
    var classes = getExportClasses(scheme, lyr);
    assert.equal(lines.length, 7);
    var first = lines[0].split('\t');
    var rgb = internal.parseColor(classes[0].color);
    assert.deepEqual(first, ['-40', [rgb.r, rgb.g, rgb.b].join('/'), '-12.5', [rgb.r, rgb.g, rgb.b].join('/')]);
    assert.equal(lines[4].split('\t')[0], 'B');
    assert.equal(lines[5].split('\t')[0], 'F');
    assert.equal(lines[6], 'N\t238/238/238');
  });

  it('a categorical GMT table has a key, color and label per category', function() {
    var lyr = makeLayer([{kind: 'big city'}, {kind: 'town'}, {kind: 'big city'}]);
    var scheme = setSchemeMethod(getDefaultCategoricalScheme(lyr), 'categorical', 'kind', 2);
    var lines = formatSchemeCPT(scheme, lyr).trim().split('\n').filter(function(line) { return line[0] != '#'; });
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^big_city\t\d+\/\d+\/\d+\t;big city$/);
    assert.match(lines[1], /^town\t/);
  });

  it('non-adjacent colors have nothing to export', function() {
    var lyr = testLayer();
    var scheme = setSchemeMethod(getDefaultCategoricalScheme(lyr), 'non-adjacent');
    assert.equal(formatSchemeJSON(scheme, lyr), null);
    assert.equal(formatSchemeCPT(scheme, lyr), null);
  });

  it('file names are the layer and field', function() {
    assert.equal(getSchemeExportFileName({name: 'us counties'}, {field: 'pop'}, 'cpt'), 'us-counties-pop.cpt');
    assert.equal(getSchemeExportFileName({}, {field: null}, 'json'), 'palette.json');
  });
});
