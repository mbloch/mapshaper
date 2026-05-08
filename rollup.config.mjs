import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const onBundle = {
  name: 'onbundle',
  writeBundle() {
    // copy mapshaper.js to www/
    const src = path.join(__dirname, 'mapshaper.js');
    const dest = path.join(__dirname, 'www/mapshaper.js');
    fs.writeFileSync(dest, fs.readFileSync(src));
  }
};

const onGeoPackageBundle = {
  name: 'ongeopackagebundle',
  writeBundle() {
    const src = path.join(__dirname, 'node_modules/@ngageoint/geopackage/dist/sql-wasm.wasm');
    const dest = path.join(__dirname, 'www/sql-wasm.wasm');
    fs.writeFileSync(dest, fs.readFileSync(src));
  }
};

const onGeoParquetBundle = {
  name: 'ongeoparquetbundle',
  writeBundle() {
    const src = path.join(__dirname, 'node_modules/@bokuweb/zstd-wasm/dist/web/zstd.wasm');
    const dest = path.join(__dirname, 'www/zstd.wasm');
    fs.writeFileSync(dest, fs.readFileSync(src));
  }
};

function onGeoPackageWarn(warning, warn) {
  // @ngageoint/geopackage includes eval() in bundled vendor code.
  // Ignore this warning to avoid printing the full minified library source.
  if (warning.code == 'EVAL') return;
  if (isVendorCircular(warning)) return;
  warn(warning);
}

// Filter out CIRCULAR_DEPENDENCY warnings whose cycle lies entirely inside
// third-party packages we don't control. Currently:
//   - polyfill-node._stream_{readable,writable,duplex}.js (Node streams
//     polyfill, well-known intentional internal circular). Rollup tags
//     these as virtual modules with a leading null byte.
//   - node_modules/d3-interpolate/src/{value,array,object}.js (d3 design).
function isVendorCircular(warning) {
  if (warning.code !== 'CIRCULAR_DEPENDENCY') return false;
  var ids = warning.ids || [];
  if (ids.length === 0) return false;
  return ids.every(function(p) {
    return /polyfill-node\b/.test(p) ||
      /\bnode_modules\/d3-interpolate\//.test(p);
  });
}

function onMainWarn(warning, warn) {
  if (isVendorCircular(warning)) return;
  warn(warning);
}

export default [{
  treeshake: false,
  input: 'src/gui/gui.mjs',
  output: [{
    strict: false,
    format: 'iife',
    file: 'www/mapshaper-gui.js'
  }]
}, {
  treeshake: false,
  input: 'src/mapshaper-gui-modules.mjs',
  onwarn: onMainWarn,
  output: {
    file: 'www/modules.js',
    format: 'iife',
    name: 'modules'
  },
  plugins: [
    nodeResolve({
      browser: true, // Use browser versions of packages when available
      preferBuiltins: false
    }),
    commonjs(),
    json(),
    nodePolyfills()
  ]
}, {
  treeshake: false,
  input: 'src/mapshaper-gui-geopackage.mjs',
  onwarn: onGeoPackageWarn,
  output: {
    file: 'www/geopackage.js',
    format: 'iife',
    name: 'mapshaperGeoPackage'
  },
  plugins: [
    onGeoPackageBundle,
    nodeResolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    json(),
    nodePolyfills()
  ]
}, {
  treeshake: false,
  input: 'src/mapshaper-gui-geoparquet.mjs',
  onwarn: onMainWarn,
  output: {
    file: 'www/geoparquet.js',
    format: 'iife',
    name: 'mapshaperGeoParquet'
  },
  plugins: [
    onGeoParquetBundle,
    nodeResolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    json(),
    nodePolyfills()
  ]
}, {
  treeshake: true,
  context: 'null', // prevent a Rollup warning from msgpack
  input: 'src/mapshaper.mjs',
  onwarn: onMainWarn,
  output: [{
    strict: false,
    format: 'iife',
    file: 'mapshaper.js'
  }],
  plugins: [onBundle, nodeResolve(), json()]
}];
