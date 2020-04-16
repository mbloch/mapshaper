
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
  input: 'src/gui/gui.js',
  output: [{
    strict: false,
    format: 'iife',
    file: 'www/mapshaper-gui.js'
  }]
}, {
  treeshake: false,
  input: 'src/mapshaper.js',
  output: [{
    strict: false,
    format: 'iife',
    file: 'mapshaper.js',
    intro: 'var VERSION = "' + require('./package.json').version + '";\n'
  }],
  plugins: [onBundle]
}];
