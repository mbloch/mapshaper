
function Timer2() {
  var self = this;
  var interval = 25;
  var id, duration, start;

  this.start = function(ms) {
    duration = ms;
    start = +new Date();
    startTick();
  };

  this.stop = function() {
    clearTimeout(id);
    id = null;
  };

  function startTick() {
    id = setTimeout(onTick, interval);
  }

  function onTick() {
    var elapsed = +new Date() - start,
        pct = Math.min((elapsed + 10) / duration, 1),
        done = pct >= 1;
    if (done) {
      id = null;
    } else {
      startTick();
    }
    self.dispatchEvent('tick', {done: done, pct: pct});
  }
}

utils.inherit(Timer2, EventDispatcher);

function Tween2(ease) {
  var self = this,
      timer = new Timer2(),
      start, end;

  timer.on('tick', onTick);

  this.start = function(a, b, duration) {
    start = a;
    end = b;
    timer.start(duration || 500);
  };

  function onTick(e) {
    var pct = ease ? ease(e.pct) : e.pct,
        val = end * pct + start * (1 - pct);
    self.dispatchEvent('change', {value: val});
  }
}

utils.inherit(Tween2, EventDispatcher);
