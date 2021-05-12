// Support for timing using T.start() and T.stop()
export var T = {
  stack: [],
  start: function() {
    T.stack.push(+new Date());
  },
  stop: function() {
    return (+new Date() - T.stack.pop()) + 'ms';
  }
};
