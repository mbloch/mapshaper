// Several dependencies are loaded via require()
var f;
if (typeof require == 'function') {
  // Node.js context: native require() function
  f = require;
} else if (typeof window == 'object' && window.modules) {
  // running in web GUI
  f = function(name) {
    return window.modules[name];
  };
} else {
  // stub to avoid runtime error in a handful of tests
  f = function() {};
}
export default f;
