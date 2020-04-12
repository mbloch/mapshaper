export default [{
  input: 'src/mapshaper.js',
  output: [{
    strict: false,
    format: 'iife',
    file: 'mapshaper.js',
    intro: 'var VERSION = "' + require('./package.json').version + '";\n'
  }]
}, {
  input: 'src/gui/gui.js',
  output: [{
    strict: false,
    format: 'iife',
    file: 'www/mapshaper-gui.js'
  }]
}];
