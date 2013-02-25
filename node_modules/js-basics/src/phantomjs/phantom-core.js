/* @requires browser */

var Phantom = {

};

if (!Browser.inPhantom) {
  trace("[phantom-core.js] Warning: Not running in phantomjs.");
}
else {
  var system = require('system');
  Phantom.arguments = system.args || [];

  Phantom.exit = function(code) {
    phantom.exit(code || 0);
  };

  var fs = require('fs');

  Phantom.readFile = function(path) {
    return fs.read(path);
  }

  Phantom.fileExists = function(path) {
    return fs.exists(path) && fs.isFile(path);
  }

  Phantom.writeFile = function(path, content) {
    fs.write(path, content, 'w');
  }

  //Phantom.page = require('webpage').create();
}