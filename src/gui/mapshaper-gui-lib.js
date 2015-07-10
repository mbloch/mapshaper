/* @requires
mapshaper-gui-utils
mapshaper-common
mapshaper-file-types
mapshaper-gui-error
*/

var gui = api.gui = {};

api.enableLogging();

error = function() { // replace default error() function
  stop.apply(null, utils.toArray(arguments));
};

// Show a popup error message, then throw an error
function stop() {
  var msg = gui.formatMessageArgs(arguments);
  gui.alert(msg);
  throw new Error(msg);
}

gui.browserIsSupported = function() {
  return typeof ArrayBuffer != 'undefined' &&
      typeof Blob != 'undefined' && typeof File != 'undefined';
};

gui.formatMessageArgs = function(args) {
  // remove cli annotation (if present)
  return MapShaper.formatLogArgs(args).replace(/^\[[^\]]+\] ?/, '');
};

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
