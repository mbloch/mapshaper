export function initVariableClick(node, cb) {
  var downEvent = null;
  var downTime = 0;

  node.addEventListener('mousedown', function(e) {
    downEvent = e;
    downTime = Date.now();
  });

  node.addEventListener('mouseup', function(upEvent) {
    if (!downEvent) return;
    var shift = Math.abs(downEvent.pageX - upEvent.pageX) +
        Math.abs(downEvent.pageY - upEvent.pageY);
    var elapsed = Date.now() - downTime;
    if (shift > 5 || elapsed > 1000) return;
    downEvent = null;
    cb({time: elapsed});
  });
}
