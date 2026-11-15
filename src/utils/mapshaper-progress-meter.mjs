// A progress line for a long task, which prints a dot each DOT_INTERVAL ms,
// or a dot for each step of the task. A task that is less than a quarter done
// at MARKS_TIME ms (or opts.marksTime) also prints 25%, 50% and 75% as it
// reaches them; one that is less than half done prints 50%; every task ends
// with 100%.
var DOT_INTERVAL = 1000;
var MARKS_TIME = 7000;
// the share done of the task of the latest meter, for the GUI's Stop link
var latestShare = 0;

export function getProgressShare() {
  return latestShare;
}

export function resetProgressShare() {
  latestShare = 0;
}

// @opts.steps true if the caller prints the dots, with dot()
// Returns {update, dot, finish}: functions returning the text to print at the
// time given (ms since the start), with update() also receiving the share of
// the task done (0 to 1)
export function getProgressMeter(opts) {
  var timed = !(opts && opts.steps);
  var marksTime = opts && opts.marksTime || MARKS_TIME;
  var dots = 0, share = 0, marks = null, prev = '';
  function dot() {
    var str = prev == '%' ? ' .' : '.';
    prev = '.';
    return str;
  }
  function mark(pct) {
    var str = (prev ? ' ' : '') + pct + '%';
    prev = '%';
    return str;
  }
  function update(elapsed, done) {
    var str = '';
    for (; timed && dots < Math.floor(elapsed / DOT_INTERVAL); dots++) str += dot();
    // the share before this update is the share done at marksTime
    if (!marks && elapsed >= marksTime) {
      marks = share < 0.25 ? [25, 50, 75] : share < 0.5 ? [50] : [];
    }
    share = Math.max(share, done || 0);
    latestShare = share;
    while (marks && marks.length > 0 && share >= marks[0] / 100) str += mark(marks.shift());
    return str;
  }
  return {
    update: update,
    dot: dot,
    finish: function(elapsed) {
      return update(elapsed, 1) + mark(100);
    }
  };
}
