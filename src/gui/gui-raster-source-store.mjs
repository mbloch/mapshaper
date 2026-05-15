import require from '../mapshaper-require';
import { internal } from './gui-core';
import { createTempSessionLifecycle } from './gui-temp-session-lifecycle';
import { logStartupCleanup } from './gui-startup-cleanup-report';

var idb = require('idb-keyval');
var KEY_PREFIX = 'msr';
var SESSION_KEY = 'mapshaper_raster_source_sessions';
var lifecycle = createTempSessionLifecycle({
  prefix: 'raster',
  sessionKey: SESSION_KEY
});
var sessionId = lifecycle.getSessionId();
var ownKeys = new Set();
var sourceCount = 0;
var sampleCount = 0;
var lifecycleStarted = false;

export async function persistRasterSourceForDataset(dataset, group) {
  if (!idb) return;
  var source = getRasterSourceFile(group);
  var sourceKey = source && source.content ?
      await persistRasterSourceBytes(dataset, source) : null;
  await persistRasterLayerSamples(dataset);
  lifecycle.touch();
  return sourceKey;
}

function getRasterSourceFile(group) {
  return group && (group.geotiff || group.png || group.jpeg) || null;
}

export function startRasterSourceStoreLifecycle() {
  if (lifecycleStarted || !idb) return;
  lifecycleStarted = true;
  lifecycle.start(attemptOwnSourceDeletion);
  cleanupStaleRasterSources().then(function(result) {
    logStartupCleanup({
      count: result.keys.length,
      sessionCount: result.sessionCount,
      singular: 'raster temp file',
      plural: 'raster temp files'
    });
  }).catch(function() {});
}

export async function cleanupStaleRasterSources() {
  if (!idb) return {keys: [], sessionCount: 0};
  var liveSessions = lifecycle.getLiveSessions();
  var keys = await idb.keys();
  var doomedSessions = new Set();
  var doomedKeys = keys.filter(function(key) {
    var sid = getSessionFromKey(key);
    var stale = isRasterSourceKey(key) && !liveSessions[sid];
    if (stale && sid) doomedSessions.add(sid);
    return stale;
  });
  if (doomedKeys.length > 0) {
    await idb.delMany(doomedKeys);
  }
  return {
    keys: doomedKeys,
    sessionCount: doomedSessions.size
  };
}

function makeRasterSourceKey(filename) {
  sourceCount++;
  return [KEY_PREFIX, sessionId, 'source', sourceCount, filename || 'raster'].join(':');
}

function makeRasterSamplesKey(layerName) {
  sampleCount++;
  return [KEY_PREFIX, sessionId, 'samples', sampleCount, layerName || 'raster'].join(':');
}

async function persistRasterSourceBytes(dataset, sourceFile) {
  var key = makeRasterSourceKey(sourceFile.filename);
  await idb.set(key, sourceFile.content);
  ownKeys.add(key);
  if (dataset.info && dataset.info.raster_sources) {
    dataset.info.raster_sources.forEach(function(source) {
      source.storage = 'indexeddb';
      source.key = key;
    });
  }
  return key;
}

async function persistRasterLayerSamples(dataset) {
  var promises = [];
  dataset.layers.forEach(function(lyr) {
    var grid = lyr.raster && internal.getRasterGrid(lyr.raster);
    var key;
    if (!grid || !grid.samples) return;
    key = makeRasterSamplesKey(lyr.name);
    ownKeys.add(key);
    grid.storage = {
      type: 'indexeddb',
      key: key
    };
    promises.push(idb.set(key, grid.samples));
  });
  await Promise.all(promises);
}

function attemptOwnSourceDeletion() {
  var keys = Array.from(ownKeys);
  ownKeys.clear();
  if (keys.length === 0) return;
  try {
    idb.delMany(keys).catch(function() {});
  } catch(e) {}
}

function isRasterSourceKey(key) {
  return typeof key == 'string' && key.indexOf(KEY_PREFIX + ':') === 0;
}

function getSessionFromKey(key) {
  var parts = String(key).split(':');
  return parts.length > 4 && parts[0] == KEY_PREFIX ? parts[1] : null;
}
