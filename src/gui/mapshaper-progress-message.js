/* @requires mapshaper-gui-lib */

// Show a progress message while running a task, if optional @msg is passed
gui.runWithMessage = function(task, done, msg) {
  var delay = 0, el;
  if (msg) {
    delay = 35; // timeout should be long enough for Firefox to refresh.
    el = gui.showProgressMessage(msg);
  }
  gui.queueSync()
    .defer(task, delay)
    .defer(function() {if (el) el.remove();})
    .defer(done)
    .run();
};

gui.showProgressMessage = function(msg) {
  var el = El('div').addClass('progress-message').appendTo('body');
  El('div').text(msg).appendTo(el);
  return el;
};

// Run a series of tasks in sequence. Each task can be run after a timeout.
gui.queueSync = function() {
  var tasks = [],
      timeouts = [];
  function runNext() {
    if (tasks.length > 0) {
      setTimeout(function() {
        tasks.shift()();
        runNext();
      }, timeouts.shift());
    }
  }
  return {
    defer: function(task, timeout) {
      tasks.push(task);
      timeouts.push(timeout | 0);
      return this;
    },
    run: runNext
  };
};
