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
