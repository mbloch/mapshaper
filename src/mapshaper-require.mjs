// Several dependencies are loaded via require() ... this module returns a
// stub function when require() does not exist as a global function,
// to avoid runtime errors (this should only happen in some tests when single
// modules are imported)
var f;
if (typeof require == 'function') {
  f = require;
} else {
  f = function() {
    // console.error('Unable to load module', name);
  };
}
export default f;
