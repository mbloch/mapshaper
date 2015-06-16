/* @requires
mapshaper-gui-utils
mapshaper-common
mapshaper-file-types
*/

var gui = api.gui = {};

gui.isReadableFileType = function(filename) {
  return !!MapShaper.guessInputFileType(filename);
};

// Run a series of tasks in sequence
// Each task is run after a short timeout, so browser can update the DOM.
// TODO: add node-style error handling
gui.queueSync = function(delay) {
  var tasks = [];
  return {
    defer: function(task) {
      tasks.push(task);
      return this;
    },
    await: function(done) {
      var retn;
      runNext();
      function runNext() {
        var task = tasks.shift();
        if (task) {
          setTimeout(function() {
            retn = task(retn);
            runNext();
          }, delay | 0);
        } else {
          done(retn);
        }
      }
    } // await()
  };
};
