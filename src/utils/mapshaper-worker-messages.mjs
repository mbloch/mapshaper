// Messaging shared by worker scripts and startWorkerPool(). No imports, so
// that worker bundles stay small.
//
// A worker posts {ready: true} once it has loaded, then answers each task
// with {result} or {error}.

// Connects a worker script to its parent, in a browser worker or a Node
// worker thread. @handler receives each task and returns its result.
export function serveWorkerTasks(handler) {
  var port = getParentPort();
  port.listen(function(task) {
    var result;
    try {
      result = handler(task);
    } catch (e) {
      port.post({error: e && e.message || String(e)});
      return;
    }
    port.post({result: result}, getTransferList(result));
  });
  port.post({ready: true});
}

// Buffers of the typed arrays in @obj and its plain objects and arrays, for
// transferring rather than copying them
export function getTransferList(obj) {
  var buffers = [];
  collectBuffers(obj, buffers);
  return buffers;
}

function collectBuffers(obj, buffers) {
  if (!obj || typeof obj != 'object') return;
  if (ArrayBuffer.isView(obj)) {
    if (obj.buffer instanceof ArrayBuffer && buffers.indexOf(obj.buffer) == -1) {
      buffers.push(obj.buffer);
    }
    return;
  }
  Object.keys(obj).forEach(function(key) {
    collectBuffers(obj[key], buffers);
  });
}

function getParentPort() {
  var port;
  if (typeof importScripts == 'function') {
    return {
      post: function(msg, transfer) { self.postMessage(msg, transfer || []); },
      listen: function(fn) { self.onmessage = function(e) { fn(e.data); }; }
    };
  }
  port = require('worker_threads').parentPort;
  return {
    post: function(msg, transfer) { port.postMessage(msg, transfer || []); },
    listen: function(fn) { port.on('message', fn); }
  };
}
