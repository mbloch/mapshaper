
const onBundle = {
  name: 'onbundle',
  buildEnd() {
    // copy mapshaper.js to www/
    const fs = require('fs');
    fs.writeFileSync('www/mapshaper.js', fs.readFileSync('mapshaper.js'));
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
