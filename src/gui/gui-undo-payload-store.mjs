import require from '../mapshaper-require';
import { createTempSessionLifecycle } from './gui-temp-session-lifecycle';

var idb = require('idb-keyval');
var DEFAULT_INDEX_KEY = 'msu_index';
var DEFAULT_SESSION_KEY = 'mapshaper_undo_sessions';
var DEFAULT_KEY_PREFIX = 'msu';
var HEARTBEAT_INTERVAL_MS = 30 * 1000;
var STALE_THRESHOLD_MS = 5 * 60 * 1000;

export function createUndoPayloadStore(opts) {
  opts = opts || {};
  var win = opts.window || getWindow();
  var backend = opts.backend || createBackend(win);
  var sessionId = opts.sessionId || getUniqId('undo');
  var indexKey = opts.indexKey || DEFAULT_INDEX_KEY;
  var sessionKey = opts.sessionKey || DEFAULT_SESSION_KEY;
  var keyPrefix = opts.keyPrefix || DEFAULT_KEY_PREFIX;
  var heartbeatInterval = opts.heartbeatInterval || HEARTBEAT_INTERVAL_MS;
  var staleThreshold = opts.staleThreshold || STALE_THRESHOLD_MS;
  var lifecycle = createTempSessionLifecycle({
    window: win,
    sessionId: sessionId,
    sessionKey: sessionKey,
    heartbeatInterval: heartbeatInterval,
    staleThreshold: staleThreshold
  });
  var maxBytes = opts.maxBytes || 0;
  var maxPayloadBytes = opts.maxPayloadBytes || 0;
  var payloadCount = 0;
  var ownKeys = new Set();
  var ownPayloadSizes = {};
  var ownPayloadItems = {};
  var ownBytes = 0;
  var lifecycleStarted = false;

  return {
    put: put,
    get: get,
    del: del,
    delMany: delMany,
    clear: clear,
    startLifecycle: startLifecycle,
    cleanupStaleSessions: cleanupStaleSessions,
    getSessionId: function() { return sessionId; },
    getOwnKeys: function() { return Array.from(ownKeys); },
    getOwnPayloads: getOwnPayloads,
    getStats: getStats,
    isPersistent: function() { return backend.persistent; }
  };

  async function put(value, meta) {
    var key = makePayloadKey();
    var size = estimatePayloadSize(value);
    var item = Object.assign({}, meta || {}, {
      key: key,
      sessionId: sessionId,
      createdAt: Date.now(),
      size: size
    });
    validatePayloadSize(size);
    await backend.set(key, value);
    notePayloadStored(item);
    lifecycle.touch();
    try {
      await updateIndex(function(index) {
        index.payloads.push(item);
      });
    } catch(e) {
      await backend.del(key);
      notePayloadRemoved(key);
      throw e;
    }
    return item;
  }

  function get(ref) {
    return backend.get(getPayloadKey(ref));
  }

  async function del(ref) {
    var key = getPayloadKey(ref);
    await backend.del(key);
    notePayloadRemoved(key);
    await removeIndexKeys([key]);
  }

  async function delMany(refs) {
    var keys = refs.map(getPayloadKey).filter(Boolean);
    if (keys.length === 0) return;
    await backend.delMany(keys);
    keys.forEach(function(key) {
      notePayloadRemoved(key);
    });
    await removeIndexKeys(keys);
  }

  async function clear() {
    var keys = Array.from(ownKeys);
    if (keys.length > 0) {
      await backend.delMany(keys);
      keys.forEach(notePayloadRemoved);
      await removeIndexKeys(keys);
    }
    lifecycle.removeOwnSession();
  }

  function startLifecycle() {
    if (lifecycleStarted) return;
    lifecycleStarted = true;
    lifecycle.start(attemptOwnDataDeletion);
  }

  async function cleanupStaleSessions() {
    var liveSessions = lifecycle.getLiveSessions();
    var keys = await backend.keys();
    var doomedSessions = new Set();
    var sizeBytes = 0;
    var doomedKeys = keys.filter(function(key) {
      var sid = getSessionFromPayloadKey(key, keyPrefix);
      var stale = sid && !liveSessions[sid];
      if (stale) doomedSessions.add(sid);
      return stale;
    });
    if (doomedKeys.length > 0) {
      await backend.delMany(doomedKeys);
    }
    await updateIndex(function(index) {
      var doomedKeyIndex = keyArrayToIndex(doomedKeys);
      index.payloads = index.payloads.filter(function(item) {
        if (!liveSessions[item.sessionId]) {
          if (doomedKeyIndex[item.key] && typeof item.size == 'number') {
            sizeBytes += item.size;
          }
          return false;
        }
        return true;
      });
    });
    return {
      keys: doomedKeys,
      sessionCount: doomedSessions.size,
      sizeBytes: sizeBytes
    };
  }

  function attemptOwnDataDeletion() {
    var keys = Array.from(ownKeys);
    keys.forEach(notePayloadRemoved);
    if (keys.length === 0) return;
    try {
      backend.delMany(keys).catch(function() {});
    } catch(e) {}
    try {
      removeIndexKeys(keys).catch(function() {});
    } catch(e) {}
  }

  function makePayloadKey() {
    payloadCount++;
    return keyPrefix + ':' + sessionId + ':' + payloadCount;
  }

  function validatePayloadSize(size) {
    if (maxPayloadBytes > 0 && size > maxPayloadBytes) {
      throw new Error('Undo payload exceeds per-payload limit');
    }
    if (maxBytes > 0 && ownBytes + size > maxBytes) {
      throw new Error('Undo payload store exceeds session limit');
    }
  }

  function notePayloadStored(item) {
    var key = item.key;
    ownKeys.add(key);
    ownPayloadItems[key] = copyPayloadItem(item);
    ownPayloadSizes[key] = item.size;
    ownBytes += item.size;
  }

  function notePayloadRemoved(key) {
    if (key in ownPayloadSizes) {
      ownBytes -= ownPayloadSizes[key];
      delete ownPayloadSizes[key];
    }
    delete ownPayloadItems[key];
    ownKeys.delete(key);
  }

  function getOwnPayloads() {
    return Array.from(ownKeys).map(function(key) {
      return copyPayloadItem(ownPayloadItems[key]);
    });
  }

  function getStats() {
    return {
      persistent: backend.persistent,
      ownPayloadCount: ownKeys.size,
      ownBytes: ownBytes,
      maxBytes: maxBytes,
      maxPayloadBytes: maxPayloadBytes
    };
  }

  async function fetchIndex() {
    var index = await backend.get(indexKey);
    if (!index || !Array.isArray(index.payloads)) {
      index = {payloads: []};
    }
    return index;
  }

  async function updateIndex(action) {
    var index = await fetchIndex();
    action(index);
    await backend.set(indexKey, index);
    return index;
  }

  function removeIndexKeys(keys) {
    var index = {};
    keys.forEach(function(key) {
      index[key] = true;
    });
    return updateIndex(function(data) {
      data.payloads = data.payloads.filter(function(item) {
        return !index[item.key];
      });
    });
  }

}

function getPayloadKey(ref) {
  return ref && (ref.key || ref);
}

function keyArrayToIndex(keys) {
  return keys.reduce(function(memo, key) {
    memo[key] = true;
    return memo;
  }, {});
}

function copyPayloadItem(item) {
  return Object.assign({}, item || {});
}

function getSessionFromPayloadKey(key, keyPrefix) {
  var parts = String(key).split(':');
  return parts.length == 3 && parts[0] == keyPrefix ? parts[1] : null;
}

function getUniqId(prefix) {
  return prefix + '_' + (Math.random() + 1).toString(36).substring(2, 8);
}

function getWindow() {
  return typeof window == 'undefined' ? null : window;
}

function createBackend(win) {
  if (win && win.indexedDB && idb) {
    return createIdbBackend();
  }
  return createMemoryBackend();
}

function createIdbBackend() {
  return {
    persistent: true,
    get: idb.get,
    set: idb.set,
    del: idb.del,
    keys: idb.keys,
    delMany: function(keys) {
      return idb.delMany ? idb.delMany(keys) :
        Promise.all(keys.map(function(key) { return idb.del(key); }));
    }
  };
}

export function createMemoryUndoPayloadBackend() {
  return createMemoryBackend();
}

function createMemoryBackend() {
  var data = new Map();
  return {
    persistent: false,
    get: function(key) {
      return Promise.resolve(data.get(key));
    },
    set: function(key, val) {
      data.set(key, val);
      return Promise.resolve();
    },
    del: function(key) {
      data.delete(key);
      return Promise.resolve();
    },
    keys: function() {
      return Promise.resolve(Array.from(data.keys()));
    },
    delMany: function(keys) {
      keys.forEach(function(key) {
        data.delete(key);
      });
      return Promise.resolve();
    }
  };
}

function estimatePayloadSize(value, seen) {
  var bytes = 0;
  if (!value) return 0;
  if (value.byteLength) return value.byteLength;
  if (value.buffer && value.buffer.byteLength) return value.buffer.byteLength;
  if (typeof value == 'string') return value.length * 2;
  if (typeof value == 'number') return 8;
  if (typeof value == 'boolean') return 4;
  if (typeof value != 'object') return 0;
  seen = seen || new Set();
  if (seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(function(item) {
      bytes += estimatePayloadSize(item, seen);
    });
  } else {
    Object.keys(value).forEach(function(key) {
      bytes += key.length * 2 + estimatePayloadSize(value[key], seen);
    });
  }
  return bytes;
}
