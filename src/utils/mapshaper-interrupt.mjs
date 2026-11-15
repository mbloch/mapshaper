import { stop } from './mapshaper-logging';

// Commands that wait on the network or a worker can be stopped from the GUI
// (see Job#interrupt()), which aborts the job's signal

export function commandCanBeInterrupted(name) {
  return name == 'fetch' || name == 'deshadow';
}

export function stopIfInterrupted(signal) {
  if (signal && signal.aborted) stop('Stopped');
}

// Resolves when @signal aborts (never, if it doesn't)
export function whenInterrupted(signal) {
  return new Promise(function(resolve) {
    if (!signal) return;
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', function() { resolve(); }, {once: true});
  });
}

// Waits @ms, or until @signal (optional) aborts
export function interruptibleDelay(ms, signal) {
  return Promise.race([
    new Promise(function(resolve) { setTimeout(resolve, ms); }),
    whenInterrupted(signal)
  ]);
}

// The signal of a network request, which aborts after @ms or when @signal
// (optional) does
// Returns {signal, timedOut, end}: timedOut() tells whether the request
//   timed out; end() is called when the request is done
export function getRequestSignal(signal, ms) {
  var controller, timer, expired = false;
  if (typeof AbortController != 'function') {
    return {signal: undefined, timedOut: function() { return false; }, end: function() {}};
  }
  controller = new AbortController();
  timer = setTimeout(function() {
    expired = true;
    controller.abort();
  }, ms);
  function onAbort() { controller.abort(); }
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort);
  }
  return {
    signal: controller.signal,
    timedOut: function() { return expired; },
    end: function() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  };
}
