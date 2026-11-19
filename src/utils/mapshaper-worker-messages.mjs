// Messaging shared by worker scripts and startWorkerPool(). No imports, so
// that worker bundles stay small.
//
// A worker posts {ready: true} once it has loaded, then answers each task
// with {result} or {error}, after any number of {progress} messages.

// Connects a worker script to its parent, in a browser worker or a Node
// worker thread. @handler receives each task and a function for reporting
// its progress (any value that can be posted), and returns its result (or a
// promise of it).
export function serveWorkerTasks(handler) {
  var port = getParentPort();
  function report(value) {
    port.post({progress: value});
  }
  function fail(e) {
    port.post({error: e && e.message || String(e)});
  }
  port.listen(function(task) {
    var result;
    try {
      result = handler(task, report);
    } catch (e) {
      fail(e);
      return;
    }
    Promise.resolve(result).then(function(result) {
      port.post({result: result}, getTransferList(result));
    }, fail);
  });
  port.post({ready: true});
}

// Answers the requests that arrive on @port (a MessagePort, e.g. from a task)
// with {id, result} or {id, error}; @handler receives each request and
// returns its result
export function serveMessagePort(port, handler) {
  var p = wrapMessagePort(port);
  p.listen(function(msg) {
    var result;
    try {
      result = handler(msg.request);
    } catch (e) {
      p.post({id: msg.id, error: e && e.message || String(e)});
      return;
    }
    p.post({id: msg.id, result: result}, getTransferList(result));
  });
}

// Sends requests to serveMessagePort() on the other end of @port
// Returns {request, close}: request() returns a promise of the result; typed
// arrays in requests are copied, not transferred
export function getMessagePortClient(port) {
  var p = wrapMessagePort(port), pending = {}, nextId = 0;
  p.listen(function(msg) {
    var o = pending[msg.id];
    delete pending[msg.id];
    if (!o) return;
    if ('error' in msg) o.reject(new Error(msg.error));
    else o.resolve(msg.result);
  });
  return {
    request: function(request) {
      var id = nextId++;
      return new Promise(function(resolve, reject) {
        pending[id] = {resolve: resolve, reject: reject};
        p.post({id: id, request: request});
      });
    },
    close: function() { port.close(); }
  };
}

function wrapMessagePort(port) {
  return {
    post: function(msg, transfer) { port.postMessage(msg, transfer || []); },
    listen: function(fn) {
      // a Node MessagePort is an EventEmitter that passes the message itself
      if (typeof port.on == 'function') port.on('message', fn);
      else port.onmessage = function(e) { fn(e.data); };
    }
  };
}

// Buffers of the typed arrays in @obj and its plain objects and arrays, for
// transferring rather than copying them, and the MessagePorts in them, which
// can only be transferred
export function getTransferList(obj) {
  var buffers = [];
  collectBuffers(obj, buffers);
  return buffers;
}

function collectBuffers(obj, buffers) {
  if (!obj || typeof obj != 'object') return;
  if (typeof MessagePort != 'undefined' && obj instanceof MessagePort) {
    buffers.push(obj);
    return;
  }
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
