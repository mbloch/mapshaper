// Support for timing using T.start() and T.stop()
export var T = {
  stack: [],
  start: function() {
    T.stack.push(Date.now());
  },
  stop: function() {
    return (Date.now() - T.stack.pop()) + 'ms';
  }
};

export function tick(msg) {
  var now = Date.now();
  var elapsed = tickTime ? ' - ' + (now - tickTime) + 'ms' : '';
  tickTime = now;
  console.log((msg || '') + elapsed);
}

var tickTime = 0;
