/* @requires mapshaper-gui-lib */

gui.runAsync = function(task, done, msg) {
  var delay = 25, // timeout in ms; should be long enough for Firefox to refresh.
      el;
  if (!msg) {
    task();
    done();
  } else {
    el = gui.showProgressMessage(msg);
    // Run task with a delay, so browser can display the message
    gui.queueSync()
      .defer(task, delay)
      .await(function() {
        el.remove();
        done();
      });
  }
};

gui.showProgressMessage = function(msg) {
  var el = El('div').addClass('progress-message').appendTo('body');
  El('div').text(msg).appendTo(el);
  return el;
};
