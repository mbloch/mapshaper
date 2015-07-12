/* @requires mapshaper-gui-lib */

gui.runAsync = function(task, done, message) {
  var delay = 25, // timeout in ms; should be long enough for Firefox to refresh.
      el;
  if (!message) {
    task();
    done();
  } else {
    el = El('div').addClass('progress-message').appendTo('body');
    El('div').text(message).appendTo(el);
    // Run task with a delay, so browser can display the message
    gui.queueSync()
      .defer(task, delay)
      .await(function() {
        el.remove();
        done();
      });
  }
};
