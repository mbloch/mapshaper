import { runningInBrowser } from '../mapshaper-env';
import { getTransferList } from './mapshaper-worker-messages';

// Starts @n workers running @scriptName, a bundle in www/ (in the browser, a
// URL relative to the page). See mapshaper-worker-messages.mjs for what the
// script does.
// Returns a pool, or null if the workers can't be started here (e.g. the
// script is missing, or this is Node with mapshaper's source modules loaded
// directly rather than the bundle)
export async function startWorkerPool(scriptName, n) {
  var workers = [];
  var i;
  try {
    for (i = 0; i < n; i++) {
      workers.push(createWorker(scriptName));
    }
    await Promise.all(workers.map(function(w) { return w.ready; }));
  } catch (e) {
    workers.forEach(function(w) { w.terminate(); });
    return null;
  }
  return {
    size: n,
    // Runs @task in worker @i, one task at a time per worker. Typed arrays in
    // @task are transferred, so they can't be used afterwards.
    run: function(i, task) {
      return workers[i].run(task);
    },
    close: function() {
      workers.forEach(function(w) { w.terminate(); });
    }
  };
}

export function getProcessorCount() {
  var os;
  if (runningInBrowser()) {
    return typeof navigator != 'undefined' && navigator.hardwareConcurrency || 1;
  }
  try {
    os = require('os');
    return os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  } catch (e) {
    return 1;
  }
}

function createWorker(scriptName) {
  var worker = runningInBrowser() ? createBrowserWorker(scriptName) : createNodeWorker(scriptName);
  var pending = null;
  var onReady, onLoadError;
  var ready = new Promise(function(resolve, reject) {
    onReady = resolve;
    onLoadError = reject;
  });
  worker.listen(function(msg) {
    var p = pending;
    if (msg.ready) {
      onReady();
      return;
    }
    pending = null;
    if (!p) return;
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  }, function(err) {
    var p = pending;
    pending = null;
    onLoadError(err);
    if (p) p.reject(err);
  });
  return {
    ready: ready,
    terminate: worker.terminate,
    run: function(task) {
      return new Promise(function(resolve, reject) {
        pending = {resolve: resolve, reject: reject};
        worker.post(task, getTransferList(task));
      });
    }
  };
}

function createBrowserWorker(scriptName) {
  var w = new Worker(scriptName);
  return {
    post: function(msg, transfer) { w.postMessage(msg, transfer); },
    listen: function(onMessage, onError) {
      w.onmessage = function(e) { onMessage(e.data); };
      w.onerror = function(e) {
        e.preventDefault();
        onError(new Error(e.message || 'Unable to run ' + scriptName));
      };
    },
    terminate: function() { w.terminate(); }
  };
}

function createNodeWorker(scriptName) {
  var path = findNodeWorkerScript(scriptName);
  var w;
  if (!path) throw new Error('Missing worker script: ' + scriptName);
  w = new (require('worker_threads').Worker)(path);
  return {
    post: function(msg, transfer) { w.postMessage(msg, transfer); },
    listen: function(onMessage, onError) {
      w.on('message', onMessage);
      w.on('error', onError);
      w.on('exit', function(code) {
        if (code !== 0) onError(new Error('Worker stopped with exit code ' + code));
      });
    },
    terminate: function() { w.terminate(); }
  };
}

// Worker scripts are in www/, next to mapshaper.js in the package (or in the
// same directory, for the copy of mapshaper.js in www/)
function findNodeWorkerScript(scriptName) {
  var path, fs;
  if (typeof require != 'function' || typeof __dirname != 'string') return null;
  path = require('path');
  fs = require('fs');
  return [path.join(__dirname, 'www', scriptName), path.join(__dirname, scriptName)].find(function(p) {
    return fs.existsSync(p);
  }) || null;
}
