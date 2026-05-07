export function createUndoTestApi(gui) {
  return {
    getState: function() {
      return getUndoTestState(gui);
    },
    getModelChecksum: function() {
      return getModelChecksum(gui.model);
    },
    getSessionHistory: function() {
      return gui.session ? gui.session.getHistorySnapshot() : null;
    },
    getMessages: function() {
      return gui.getMessages ? gui.getMessages() : [];
    },
    runCommand: function(str) {
      return runConsoleCommand(gui, str);
    },
    saveSnapshot: function() {
      return gui.sessionSnapshots ? gui.sessionSnapshots.saveSnapshot() : null;
    },
    restoreLatestSnapshot: function() {
      return gui.sessionSnapshots ? gui.sessionSnapshots.restoreLatestSnapshot() : null;
    },
    clearUndoHistory: function() {
      if (gui.undo) gui.undo.clear();
    },
    setPanelMode: function(mode) {
      if (mode) {
        gui.enterMode(mode);
      } else {
        gui.clearMode();
      }
    },
    undo: function() {
      return gui.undo ? gui.undo.undo() : null;
    },
    redo: function() {
      return gui.undo ? gui.undo.redo() : null;
    },
    setInteractionMode: function(mode) {
      if (gui.interaction) gui.interaction.setMode(mode);
    },
    addPointToActiveLayer: function(coords) {
      var target = gui.model.getActiveLayer();
      var p = coords || [0, 0];
      if (!target || !target.layer || target.layer.geometry_type != 'point') {
        throw new Error('Active layer is not a point layer');
      }
      appendNewPointForTest(target.layer, p);
      gui.dispatchEvent('point_add', {target: target.layer, p: p});
      gui.dispatchEvent('map-needs-refresh');
    }
  };
}

function appendNewPointForTest(layer, p) {
  var record;
  layer.shapes.push([p]);
  if (layer.data) {
    record = {};
    layer.data.getFields().forEach(function(field) {
      record[field] = null;
    });
    layer.data.getRecords().push(record);
  }
}

export function getUndoTestState(gui) {
  return {
    undo: {
      canUndo: gui.undo ? gui.undo.canUndo() : false,
      canRedo: gui.undo ? gui.undo.canRedo() : false
    },
    payloadStore: getPayloadStoreState(gui.undoPayloadStore),
    model: getModelChecksum(gui.model)
  };
}

export function getModelChecksum(model) {
  var datasets = model.getDatasets();
  var active = model.getActiveLayer();
  return {
    checksum: hashValue(datasets.map(getDatasetSignature)),
    activeLayer: active && active.layer ? getLayerName(active.layer) : null,
    datasetCount: datasets.length,
    layerCount: model.getLayers().length,
    datasets: datasets.map(getDatasetSummary)
  };
}

export function isUndoTestApiEnabled() {
  var val = getQueryValue('undo');
  return val == 'on' || val == 'commands' || val == 'test' ||
    getQueryValue('undo-test') == 'on';
}

function getPayloadStoreState(store) {
  var keys = store ? store.getOwnKeys() : [];
  var stats = store && store.getStats ? store.getStats() : null;
  var payloads = store && store.getOwnPayloads ? store.getOwnPayloads() : [];
  return Object.assign({
    enabled: !!store,
    persistent: store ? store.isPersistent() : false,
    ownPayloadCount: keys.length,
    ownPayloadKeys: keys,
    ownPayloads: payloads
  }, stats || {});
}

function runConsoleCommand(gui, str) {
  return new Promise(function(resolve, reject) {
    if (!gui.console || !gui.console.runMapshaperCommands) {
      reject(new Error('GUI console is unavailable'));
      return;
    }
    gui.console.runMapshaperCommands(str, function(err, flags) {
      if (err) {
        reject(err);
      } else {
        resolve(flags || {});
      }
    });
  });
}

function getDatasetSummary(dataset) {
  return {
    layerCount: dataset.layers ? dataset.layers.length : 0,
    arcCount: dataset.arcs ? dataset.arcs.size() : 0,
    layers: (dataset.layers || []).map(function(lyr) {
      return {
        name: getLayerName(lyr),
        geometry_type: lyr.geometry_type || null,
        shapeCount: lyr.shapes ? lyr.shapes.length : 0,
        recordCount: lyr.data ? lyr.data.size() : 0,
        fields: lyr.data ? lyr.data.getFields() : []
      };
    })
  };
}

function getDatasetSignature(dataset) {
  return {
    info: dataset.info || null,
    arcs: getArcsSignature(dataset.arcs),
    layers: (dataset.layers || []).map(getLayerSignature)
  };
}

function getLayerSignature(lyr) {
  return {
    name: getLayerName(lyr),
    geometry_type: lyr.geometry_type || null,
    shapes: lyr.shapes || null,
    fields: lyr.data ? lyr.data.getFields() : [],
    records: lyr.data ? lyr.data.getRecords() : null
  };
}

function getArcsSignature(arcs) {
  var data;
  if (!arcs) return null;
  data = arcs.getVertexData();
  return {
    size: arcs.size(),
    zlimit: arcs.getRetainedInterval(),
    nn: Array.from(data.nn),
    xx: Array.from(data.xx),
    yy: Array.from(data.yy),
    zz: data.zz ? Array.from(data.zz) : null
  };
}

function getLayerName(lyr) {
  return lyr.name || null;
}

function hashValue(val) {
  return hashString(stableStringify(val));
}

function hashString(str) {
  var hash = 2166136261;
  for (var i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function stableStringify(val) {
  if (val === null || typeof val != 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(stableStringify).join(',') + ']';
  }
  return '{' + Object.keys(val).sort().map(function(key) {
    return JSON.stringify(key) + ':' + stableStringify(val[key]);
  }).join(',') + '}';
}

function getQueryValue(key) {
  var rxp, match;
  if (typeof window == 'undefined' || !window.location) return null;
  rxp = new RegExp('[?&]' + key + '=([^&]+)');
  match = rxp.exec(window.location.search);
  return match ? decodeURIComponent(match[1]) : null;
}
