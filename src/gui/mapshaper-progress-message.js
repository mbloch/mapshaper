/* @requires mapshaper-gui-lib */

gui.runWithMessage = function(task, done, msg) {
  var delay = 35, // timeout in ms; should be long enough for Firefox to refresh.
      el;
  if (!msg) {
    task();
    done();
  } else {
    el = gui.showProgressMessage(msg);
    // Run task with a delay, so browser can update dom
    gui.queueSync()
      .defer(task, delay)
      .defer(function() {el.remove(); done();})
      .run();
  }
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
