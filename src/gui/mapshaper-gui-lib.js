/* @requires
mapshaper-gui-utils
mapshaper-common
mapshaper-file-types
*/

var gui = api.gui = {};
window.mapshaper = api;

gui.isReadableFileType = function(filename) {
  return !!MapShaper.guessInputFileType(filename);
};

// Run a series of tasks in sequence. Each task can be run after a timeout.
// TODO: add node-style error handling
gui.queueSync = function() {
  var tasks = [],
      timeouts = [];
  return {
    defer: function(task, timeout) {
      tasks.push(task);
      timeouts.push(timeout | 0);
      return this;
    },
    await: function(done) {
      var retn;
      runNext();
      function runNext() {
        var task = tasks.shift(),
            ms = timeouts.shift();
        if (task) {
          setTimeout(function() {
            retn = task(retn);
            runNext();
          }, ms);
        } else {
          done(retn);
        }
      }
    } // await()
  };
};
