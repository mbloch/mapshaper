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
gui.queueSync = function() {
  var tasks = [];
  function runTasks(done) {
    runNext();
    function runNext() {
      var task = tasks.shift();
      if (task) {
        setTimeout(function() {
          task();
          runNext();
        }, 10);
      } else {
        done();
      }
    }
  }
  return {
    defer: function(task) {tasks.push(task); return this;},
    await: runTasks
  };
};
