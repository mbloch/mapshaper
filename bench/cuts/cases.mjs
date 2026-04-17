// Benchmark cases for addIntersectionCuts performance work.
// Each case is { id, label, argv, runs?, warmup? }.
// argv is fed straight to mapshaper.runCommands().
//
// The benchmark sample files live outside the repo. Set
// MAPSHAPER_BENCH_DATA in your environment, or copy `.env.example` to
// `.env` in this directory and put the absolute path there. `.env` is
// gitignored.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

var SELF_DIR = dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  var path = resolve(SELF_DIR, '.env');
  if (!existsSync(path)) return;
  var text = readFileSync(path, 'utf8');
  text.split(/\r?\n/).forEach(function(line) {
    var m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) return;
    var k = m[1];
    var v = m[2].replace(/^["'](.*)["']$/, '$1');
    if (!(k in process.env)) process.env[k] = v;
  });
}

loadDotEnv();

var DATA = process.env.MAPSHAPER_BENCH_DATA;
if (!DATA) {
  throw new Error(
    'MAPSHAPER_BENCH_DATA is not set. Copy bench/cuts/.env.example to ' +
    'bench/cuts/.env and set the path to your sample-file directory, or ' +
    'export the variable in your shell.'
  );
}

function f(name) {
  var p = DATA + '/' + name;
  if (!existsSync(p)) {
    throw new Error('Missing benchmark file: ' + p);
  }
  return p;
}

var COUNTIES = () => f('COUNTY_2019_US_SL050_Coast_Clipped.shp');
var PRECINCTS = () => f('srprec_061_g24_v01.shp');
var ROADS = () => f('roads.geojson');
var MASK = () => f('usa_land_area.geojson');
var TORTURE = () => f('torture-test.shp');

export var cases = [
  {
    id: 'A-precincts-clean',
    label: 'A. Smoke: precincts -clean',
    argv: () => `-i ${PRECINCTS()} -clean`
  },
  {
    id: 'B-precincts-dissolve',
    label: 'B. Polygon mosaic: precincts -dissolve2 COUNTY',
    argv: () => `-i ${PRECINCTS()} -dissolve2 COUNTY`
  },
  {
    id: 'C-counties-clean',
    label: 'C. Big clean polygons: counties -clean',
    argv: () => `-i ${COUNTIES()} -clean`
  },
  {
    id: 'D-counties-dissolve-states',
    label: 'D. Big dissolve: counties -dissolve2 STATEFP',
    argv: () => `-i ${COUNTIES()} -dissolve2 STATEFP`
  },
  {
    id: 'E-roads-clean',
    label: 'E. Polyline path: roads -clean',
    argv: () => `-i ${ROADS()} -clean`
  },
  {
    id: 'F-roads-buffer-dissolve',
    label: 'F. Dirty: roads -buffer 50m -dissolve2',
    argv: () => `-i ${ROADS()} -buffer 50 -dissolve2`,
    runs: 3
  },
  {
    id: 'H-counties-clip-mask',
    label: 'H. Two-input: counties -clip mask',
    argv: () => `-i ${COUNTIES()} -clip ${MASK()}`,
    runs: 3
  },
  {
    id: 'I-counties-erase-mask',
    label: 'I. Two-input: counties -erase mask',
    argv: () => `-i ${COUNTIES()} -erase ${MASK()}`,
    runs: 3
  },
  {
    id: 'J-torture-clean',
    label: 'J. Self-intersection torture: torture-test -clean',
    argv: () => `-i ${TORTURE()} -clean`,
    runs: 3
  }
];

export function findCase(id) {
  return cases.find(c => c.id === id || c.id.toLowerCase() === id.toLowerCase());
}
