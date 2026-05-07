// Diagnostic-only scaffolding for app-wide undo/redo R&D.
// It is intentionally dormant unless explicitly enabled.

var DEFAULT_POLICY = {
  maxStates: 20,
  maxBytes: 256 * 1024 * 1024,
  largeChangeBytes: 64 * 1024 * 1024,
  captureMode: 'diagnostic',
  sessionHistory: 'audit-log'
};

var EDITOR_UNDO_INVENTORY = [
  {
    name: 'attributes',
    events: ['data_preupdate', 'data_postupdate'],
    capture: 'record copies',
    reusable: true
  },
  {
    name: 'labels',
    events: ['label_dragstart', 'label_dragend'],
    capture: 'record copies',
    reusable: true
  },
  {
    name: 'points and symbols',
    events: ['symbol_dragend', 'point_add', 'feature_delete'],
    capture: 'coordinate and feature inserts/deletes',
    reusable: true
  },
  {
    name: 'vertices and rectangles',
    events: ['vertex_dragend', 'vertex_delete', 'rectangle_dragend'],
    capture: 'coordinate and vertex inserts/deletes',
    reusable: true
  },
  {
    name: 'path drawing',
    events: ['path_add', 'path_extend'],
    capture: 'editor events replayed through drawing mode',
    reusable: false
  }
];

export function createUndoFeasibilityMonitor(gui, opts) {
  opts = Object.assign({}, DEFAULT_POLICY, opts || {});
  var tracker = createRuntimeIdTracker();
  var enabled = isUndoFeasibilityEnabled(gui);
  var lastReport = null;

  return {
    beforeCommand,
    afterCommand,
    isEnabled: function() { return enabled; },
    setEnabled: function(val) { enabled = !!val; },
    getPolicy: function() { return Object.assign({}, opts); },
    getLastReport: function() { return lastReport; },
    getEditorUndoInventory: function() { return EDITOR_UNDO_INVENTORY.slice(); }
  };

  function beforeCommand(commands, commandString) {
    var start, before;
    if (!enabled || !gui.model || gui.model.isEmpty()) return null;
    start = Date.now();
    before = captureModelState(gui.model, tracker);
    return {
      commandString: commandString || '',
      commandNames: commands.map(function(cmd) { return cmd.name; }),
      before: before,
      beforeCaptureMillis: Date.now() - start,
      startedAt: start
    };
  }

  function afterCommand(token, o) {
    var start, after, report;
    if (!token) return null;
    start = Date.now();
    after = captureModelState(gui.model, tracker);
    report = diffModelStates(token.before, after, {
      commandString: token.commandString,
      commandNames: token.commandNames,
      error: o && o.error,
      flags: o && o.flags,
      policy: opts,
      timings: {
        beforeCaptureMillis: token.beforeCaptureMillis,
        afterCaptureMillis: Date.now() - start,
        elapsedMillis: Date.now() - token.startedAt
      }
    });
    lastReport = report;
    gui.dispatchEvent('undo_feasibility_change', report);
    logUndoFeasibilityReport(report);
    return report;
  }
}

export function captureModelState(model, tracker) {
  tracker = tracker || createRuntimeIdTracker();
  var datasets = model.getDatasets();
  var active = model.getActiveLayer && model.getActiveLayer();
  var targets = model.getDefaultTargets ? model.getDefaultTargets() : [];
  var state = {
    datasets: [],
    datasetsById: {},
    layersById: {},
    activeLayerId: active && active.layer ? tracker.layerId(active.layer) : null,
    activeDatasetId: active && active.dataset ? tracker.datasetId(active.dataset) : null,
    targetHash: hashStableValue(targets.map(function(target) {
      return {
        dataset: tracker.datasetId(target.dataset),
        layers: target.layers.map(function(lyr) {
          return tracker.layerId(lyr);
        })
      };
    })),
    editorUndo: EDITOR_UNDO_INVENTORY.slice(),
    policy: Object.assign({}, DEFAULT_POLICY)
  };

  datasets.forEach(function(dataset, i) {
    var datasetState = captureDatasetState(dataset, i, tracker);
    state.datasets.push(datasetState);
    state.datasetsById[datasetState.id] = datasetState;
    datasetState.layers.forEach(function(layerState) {
      state.layersById[layerState.id] = layerState;
    });
  });
  state.catalogHash = hashStableValue({
    datasets: state.datasets.map(function(dataset) {
      return {
        id: dataset.id,
        index: dataset.index,
        layers: dataset.layerIds
      };
    }),
    activeLayerId: state.activeLayerId,
    activeDatasetId: state.activeDatasetId,
    targetHash: state.targetHash
  });
  state.bytes = estimateStateBytes(state);
  return state;
}

export function diffModelStates(before, after, opts) {
  opts = opts || {};
  var changes = {
    catalog: before.catalogHash != after.catalogHash,
    selection: before.activeLayerId != after.activeLayerId ||
      before.activeDatasetId != after.activeDatasetId ||
      before.targetHash != after.targetHash,
    datasets: [],
    layers: []
  };
  var ids = mergeKeys(before.datasetsById, after.datasetsById);
  var layerIds = mergeKeys(before.layersById, after.layersById);

  ids.forEach(function(id) {
    var a = before.datasetsById[id];
    var b = after.datasetsById[id];
    var change = diffDatasetState(a, b);
    if (change) changes.datasets.push(change);
  });

  layerIds.forEach(function(id) {
    var a = before.layersById[id];
    var b = after.layersById[id];
    var change = diffLayerState(a, b);
    if (change) changes.layers.push(change);
  });

  return {
    type: 'undo-feasibility',
    command: opts.commandString || '',
    commandNames: opts.commandNames || [],
    failed: !!(opts.error),
    error: opts.error ? String(opts.error.message || opts.error) : null,
    changes: changes,
    storage: estimateUndoStorage(before, after, changes, opts.policy || DEFAULT_POLICY),
    timings: opts.timings || null,
    restore: getRestoreContract(changes),
    policy: getUndoPolicy(opts.policy || DEFAULT_POLICY)
  };
}

export function getUndoPolicy(policy) {
  policy = Object.assign({}, DEFAULT_POLICY, policy || {});
  return {
    optIn: true,
    enableWith: ['gui option undoFeasibility', 'URL parameter undo=diagnostic', 'localStorage mapshaper.undo=diagnostic'],
    stackLimits: {
      maxStates: policy.maxStates,
      maxBytes: policy.maxBytes,
      largeChangeBytes: policy.largeChangeBytes
    },
    coexistence: 'Existing editor undo remains event-based; app-wide command undo should use the same UI state events after it graduates from diagnostics.',
    sessionHistory: 'Session history remains an audit log and is not rewound by undo/redo.'
  };
}

export function getRestoreContract(changes) {
  var flags = {
    select: changes.selection || changes.catalog,
    arc_count: false
  };
  var levels = [];

  changes.datasets.forEach(function(change) {
    if (change.status != 'changed') {
      levels.push('catalog');
    } else {
      if (change.arcs) {
        levels.push('dataset');
        flags.arc_count = true;
      }
      if (change.info) levels.push('dataset-info');
      if (change.layerOrder) levels.push('layer-order');
    }
  });
  changes.layers.forEach(function(change) {
    if (change.status != 'changed') {
      levels.push('catalog');
    } else {
      if (change.shapes) levels.push('layer-shapes');
      if (change.data) levels.push('layer-data');
      if (change.meta) levels.push('layer-meta');
    }
  });

  return {
    levels: unique(levels),
    updateFlags: flags,
    redoInvalidation: 'Discard redo entries when a new command report contains data, catalog, or selection changes.',
    failureHandling: 'Capture starts before command execution, so partial success after an error can still be rolled back.'
  };
}

export function createRuntimeIdTracker() {
  var datasetIds = new WeakMap();
  var layerIds = new WeakMap();
  var datasetId = 0;
  var layerId = 0;
  return {
    datasetId: function(dataset) {
      if (!datasetIds.has(dataset)) datasetIds.set(dataset, 'd' + (++datasetId));
      return datasetIds.get(dataset);
    },
    layerId: function(layer) {
      if (!layerIds.has(layer)) layerIds.set(layer, 'l' + (++layerId));
      return layerIds.get(layer);
    }
  };
}

function captureDatasetState(dataset, i, tracker) {
  var layers = dataset.layers.map(function(lyr, j) {
    return captureLayerState(lyr, j, tracker, dataset);
  });
  var arcs = captureArcsState(dataset.arcs);
  var info = captureValueState(dataset.info || null);
  var state = {
    id: tracker.datasetId(dataset),
    index: i,
    layerIds: layers.map(function(lyr) { return lyr.id; }),
    layerOrderHash: hashStableValue(layers.map(function(lyr) { return lyr.id; })),
    arcs: arcs,
    info: info,
    layers: layers
  };
  state.bytes = arcs.bytes + info.bytes + layers.reduce(function(memo, lyr) {
    return memo + lyr.bytes;
  }, 0);
  return state;
}

function captureLayerState(lyr, i, tracker, dataset) {
  var data = captureDataState(lyr.data);
  var shapes = captureValueState(lyr.shapes || null);
  var meta = captureValueState(getLayerMeta(lyr));
  return {
    id: tracker.layerId(lyr),
    datasetId: tracker.datasetId(dataset),
    index: i,
    name: lyr.name || '',
    geometry_type: lyr.geometry_type || null,
    data: data,
    shapes: shapes,
    meta: meta,
    bytes: data.bytes + shapes.bytes + meta.bytes
  };
}

function captureDataState(data) {
  var records = data ? data.getRecords() : null;
  var state = captureValueState(records);
  state.recordCount = data ? data.size() : 0;
  state.fields = data ? data.getFields() : [];
  return state;
}

function captureArcsState(arcs) {
  var data, bytes;
  if (!arcs) {
    return {
      exists: false,
      arcCount: 0,
      pointCount: 0,
      retainedInterval: 0,
      hash: 'null',
      bytes: 0
    };
  }
  data = arcs.getVertexData();
  bytes = typedBytes(data.nn) + typedBytes(data.xx) + typedBytes(data.yy) + typedBytes(data.zz);
  return {
    exists: true,
    arcCount: arcs.size(),
    pointCount: arcs.getPointCount(),
    retainedInterval: arcs.getRetainedInterval(),
    hash: hashStableValue({
      nn: hashTypedArray(data.nn),
      xx: hashTypedArray(data.xx),
      yy: hashTypedArray(data.yy),
      zz: data.zz ? hashTypedArray(data.zz) : null,
      zlimit: arcs.getRetainedInterval()
    }),
    bytes: bytes
  };
}

function captureValueState(obj) {
  var str = stableStringify(obj);
  return {
    hash: hashString(str),
    bytes: estimateStringBytes(str)
  };
}

function diffDatasetState(a, b) {
  if (!a) return {id: b.id, status: 'added', bytes: b.bytes};
  if (!b) return {id: a.id, status: 'removed', bytes: a.bytes};
  var change = {
    id: a.id,
    status: 'changed',
    index: a.index != b.index,
    layerOrder: a.layerOrderHash != b.layerOrderHash,
    arcs: a.arcs.hash != b.arcs.hash,
    info: a.info.hash != b.info.hash,
    beforeBytes: a.bytes,
    afterBytes: b.bytes
  };
  return change.index || change.layerOrder || change.arcs || change.info ? change : null;
}

function diffLayerState(a, b) {
  if (!a) return {id: b.id, datasetId: b.datasetId, status: 'added', bytes: b.bytes};
  if (!b) return {id: a.id, datasetId: a.datasetId, status: 'removed', bytes: a.bytes};
  var change = {
    id: a.id,
    datasetId: b.datasetId,
    status: 'changed',
    index: a.index != b.index,
    data: a.data.hash != b.data.hash,
    shapes: a.shapes.hash != b.shapes.hash,
    meta: a.meta.hash != b.meta.hash,
    beforeBytes: a.bytes,
    afterBytes: b.bytes,
    recordCount: b.data.recordCount,
    fields: b.data.fields
  };
  return change.index || change.data || change.shapes || change.meta ? change : null;
}

function estimateUndoStorage(before, after, changes, policy) {
  var bytes = 0;
  var strategy = 'none';
  var changedDatasets = {};
  var changedLayers = {};
  var alternatives = estimateStorageAlternatives(before, after, changes);

  changes.datasets.forEach(function(change) {
    var beforeState = before.datasetsById[change.id];
    var afterState = after.datasetsById[change.id];
    if (change.status != 'changed' || change.arcs || change.layerOrder) {
      bytes += (beforeState ? beforeState.bytes : 0) + (afterState ? afterState.bytes : 0);
      changedDatasets[change.id] = true;
    } else if (change.info) {
      bytes += (beforeState ? beforeState.info.bytes : 0) + (afterState ? afterState.info.bytes : 0);
      strategy = strategy == 'none' ? 'dataset-info' : strategy;
    }
  });
  changes.layers.forEach(function(change) {
    var beforeState = before.layersById[change.id];
    var afterState = after.layersById[change.id];
    if (changedDatasets[change.datasetId]) return;
    if (change.data && !change.shapes && !change.meta) {
      bytes += (beforeState ? beforeState.data.bytes : 0) + (afterState ? afterState.data.bytes : 0);
      strategy = strategy == 'none' ? 'table' : strategy;
    } else {
      bytes += (beforeState ? beforeState.bytes : 0) + (afterState ? afterState.bytes : 0);
      changedLayers[change.id] = true;
    }
  });

  if (Object.keys(changedDatasets).length > 0) {
    strategy = 'dataset';
  } else if (Object.keys(changedLayers).length > 0) {
    strategy = strategy == 'none' ? 'layer' : 'mixed';
  }

  return {
    strategy: strategy,
    estimatedBytes: bytes,
    displaySize: formatBytes(bytes),
    alternatives: alternatives,
    exceedsLargeChangeLimit: bytes > policy.largeChangeBytes,
    exceedsStackLimit: bytes > policy.maxBytes
  };
}

function estimateStorageAlternatives(before, after, changes) {
  var alternatives = {
    fullSession: before.bytes + after.bytes,
    changedDatasets: 0,
    changedLayers: 0,
    changedTables: 0,
    changedArcs: 0
  };
  var datasetIds = {};

  changes.datasets.forEach(function(change) {
    var beforeState = before.datasetsById[change.id];
    var afterState = after.datasetsById[change.id];
    var datasetBytes = (beforeState ? beforeState.bytes : 0) + (afterState ? afterState.bytes : 0);
    alternatives.changedDatasets += datasetBytes;
    datasetIds[change.id] = true;
    if (change.arcs) {
      alternatives.changedArcs += (beforeState ? beforeState.arcs.bytes : 0) +
        (afterState ? afterState.arcs.bytes : 0);
    }
  });
  changes.layers.forEach(function(change) {
    var beforeState = before.layersById[change.id];
    var afterState = after.layersById[change.id];
    if (datasetIds[change.datasetId]) return;
    alternatives.changedLayers += (beforeState ? beforeState.bytes : 0) +
      (afterState ? afterState.bytes : 0);
    if (change.data) {
      alternatives.changedTables += (beforeState ? beforeState.data.bytes : 0) +
        (afterState ? afterState.data.bytes : 0);
    }
  });
  Object.keys(alternatives).forEach(function(key) {
    alternatives[key] = {
      estimatedBytes: alternatives[key],
      displaySize: formatBytes(alternatives[key])
    };
  });
  return alternatives;
}

function estimateStateBytes(state) {
  return state.datasets.reduce(function(memo, dataset) {
    return memo + dataset.bytes;
  }, 0);
}

function getLayerMeta(lyr) {
  var meta = {};
  Object.keys(lyr).sort().forEach(function(key) {
    if (key == 'data' || key == 'shapes') return;
    meta[key] = lyr[key];
  });
  return meta;
}

function isUndoFeasibilityEnabled(gui) {
  var opt = gui.options && gui.options.undoFeasibility;
  var query = getQueryValue('undo');
  if (opt === true || opt == 'diagnostic') return true;
  if (query == 'diagnostic' || query == 'debug') return true;
  try {
    return window.localStorage && window.localStorage.getItem('mapshaper.undo') == 'diagnostic';
  } catch(e) {
    return false;
  }
}

function getQueryValue(key) {
  var rxp, match;
  if (typeof window == 'undefined' || !window.location) return null;
  rxp = new RegExp('[?&]' + key + '=([^&]+)');
  match = rxp.exec(window.location.search);
  return match ? decodeURIComponent(match[1]) : null;
}

function logUndoFeasibilityReport(report) {
  if (typeof console == 'undefined' || !console.log) return;
  console.log('[mapshaper undo feasibility]', {
    command: report.command,
    failed: report.failed,
    changes: report.changes,
    storage: report.storage,
    restore: report.restore
  });
}

function mergeKeys(a, b) {
  var index = {};
  Object.keys(a).forEach(function(key) { index[key] = true; });
  Object.keys(b).forEach(function(key) { index[key] = true; });
  return Object.keys(index);
}

function unique(arr) {
  var index = {};
  arr.forEach(function(item) { index[item] = true; });
  return Object.keys(index);
}

function hashStableValue(obj) {
  return hashString(stableStringify(obj));
}

function stableStringify(obj) {
  var seen = [];
  return stringify(obj, 0);

  function stringify(val, depth) {
    var keys;
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val == 'number') return Number.isNaN(val) ? 'NaN' : String(val);
    if (typeof val == 'string') return JSON.stringify(val);
    if (typeof val == 'boolean') return String(val);
    if (typeof val == 'function') return '[Function]';
    if (ArrayBuffer.isView(val)) return hashTypedArray(val);
    if (seen.indexOf(val) > -1) return '[Circular]';
    if (depth > 8) return '[MaxDepth]';
    seen.push(val);
    if (Array.isArray(val)) {
      return '[' + val.map(function(item) {
        return stringify(item, depth + 1);
      }).join(',') + ']';
    }
    keys = Object.keys(val).sort();
    return '{' + keys.map(function(key) {
      return JSON.stringify(key) + ':' + stringify(val[key], depth + 1);
    }).join(',') + '}';
  }
}

function hashTypedArray(arr) {
  var hash, view;
  if (!arr) return 'null';
  view = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  hash = hashBytes(view);
  return arr.constructor.name + ':' + arr.length + ':' + hash;
}

function hashBytes(bytes) {
  var hash = 2166136261;
  for (var i=0, n=bytes.length; i<n; i++) {
    hash ^= bytes[i];
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function hashString(str) {
  var hash = 2166136261;
  for (var i=0, n=str.length; i<n; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function typedBytes(arr) {
  return arr ? arr.byteLength : 0;
}

function estimateStringBytes(str) {
  return str.length * 2;
}

function formatBytes(bytes) {
  if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  if (bytes > 1024) return Math.round(bytes / 1024) + 'KB';
  return bytes + 'B';
}
