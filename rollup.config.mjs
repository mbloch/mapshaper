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

function onGeoPackageWarn(warning, warn) {
  // @ngageoint/geopackage includes eval() in bundled vendor code.
  // Ignore this warning to avoid printing the full minified library source.
  if (warning.code == 'EVAL') return;
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
  treeshake: true,
  context: 'null', // prevent a Rollup warning from msgpack
  input: 'src/mapshaper.mjs',
  output: [{
    strict: false,
    format: 'iife',
    file: 'mapshaper.js'
  }],
  plugins: [onBundle, nodeResolve(), json()]
}];
