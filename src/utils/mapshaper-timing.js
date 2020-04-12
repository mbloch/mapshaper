import { verbose } from '../utils/mapshaper-logging';

// Support for timing using T.start() and T.stop("message")
export var T = {
  stack: [],
  start: function() {
    T.stack.push(+new Date());
  },
  stop: function(note) {
    var elapsed = (+new Date() - T.stack.pop());
    var msg = elapsed + 'ms';
    if (note) {
      msg = note + " " + msg;
    }
    verbose(msg);
    return elapsed;
  }
};

