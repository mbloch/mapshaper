import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

const onBundle = {
  name: 'onbundle',
  writeBundle() {
    // copy mapshaper.js to www/
    const fs = require('fs');
    const path = require('path');
    const src = path.join(__dirname, 'mapshaper.js');
    const dest = path.join(__dirname, 'www/mapshaper.js');
    fs.writeFileSync(dest, fs.readFileSync(src));
  }
};

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
    format: 'umd',
    name: 'modules' // Global variable name when loaded via script tag
  },
  plugins: [
    nodeResolve({
      browser: true,        // Use browser versions of packages when available
      preferBuiltins: false
    }),
    commonjs(),
    json()
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
