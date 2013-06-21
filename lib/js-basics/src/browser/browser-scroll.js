
/* @requires browser, events */

// TODO: maybe handle orientation change (ipad, etc)
//


// watch a list of nodes; fire events when they become visible, etc.
//
Browser.watch = function(ref) {
  var obj = new EventDispatcher();

  var watching = false;
  var elements = [];


  function evaluate() {


  }

  function start() {
    if (watching) return;
    watching = false;

    Browser.on(window, 'resize', evaluate);
    Browser.on(window, 'scroll', evaluate);

  }

  function stop() {
    if (!watching) return;
    watching = false;

    Browser.removeEventListener(window, 'resize', evaluate);
    Browser.removeEventListener(window, 'scroll', evaluate);
  }


  obj.start = function() {
    start();
  };
  obj.stop = function() {
    stop();
  }

  return obj;
}