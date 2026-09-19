import { snipPath } from './gui-snipping-utils';
import { getNewLabelStyle } from './gui-label-style-state';
import { appUndoIsEnabled } from './gui-app-undo';

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
    // Whether app-level undo is on, which a test asserting that something works
    // without it needs to be able to confirm rather than assume.
    appUndoIsEnabled: function() {
      return appUndoIsEnabled(gui);
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
    // Which tool has the map, for a test asking what an action did rather than
    // what it drew: a panel coming up is how a mode change shows, not what it
    // is.
    getInteractionMode: function() {
      return gui.interaction ? gui.interaction.getMode() : null;
    },
    // Shape-level detail about a layer by name, or null if there is no such
    // layer. getModelChecksum() reports counts but not geometry types, which is
    // what distinguishes an anchored label from a path-aligned one.
    getLayerInfo: function(name) {
      var lyr = gui.model.getLayers().map(function(o) { return o.layer; })
        .filter(function(lyr) { return getLayerName(lyr) === name; })[0];
      if (!lyr) return null;
      return {
        name: getLayerName(lyr),
        geometry_type: lyr.geometry_type || null,
        shapeCount: lyr.shapes ? lyr.shapes.length : 0,
        fields: lyr.data ? lyr.data.getFields() : [],
        records: lyr.data ? lyr.data.getRecords() : [],
        geometryTypes: (lyr.shapes || []).map(function(shp) {
          if (!shp) return null;
          return shp.length > 1 ? 'MultiPoint' : 'Point';
        }),
        pointCounts: (lyr.shapes || []).map(function(shp) {
          return shp ? shp.length : 0;
        }),
        // Copied rather than handed over, so that a test holding onto the
        // result still sees the geometry as it was when it asked.
        shapes: (lyr.shapes || []).map(function(shp) {
          return shp ? shp.map(function(p) { return [p[0], p[1]]; }) : null;
        })
      };
    },
    // What the label path guide drew, as last rendered.
    getLabelPathGuideInfo: function() {
      return getLabelPathGuideLayers(gui).map(function(lyr) {
        return {
          name: getLayerName(lyr),
          geometryType: lyr.geometry_type,
          shapeCount: lyr.shapes ? lyr.shapes.length : 0
        };
      });
    },
    // Knot handle positions, in display coordinates.
    getLabelPathKnotCoords: function() {
      var lyr = getLabelPathGuideLayers(gui).filter(function(lyr) {
        return getLayerName(lyr) == 'label-path-knots';
      })[0];
      // each handle is a single-point shape
      return (lyr ? lyr.shapes : []).map(function(shp) { return shp[0]; });
    },
    // Which feature the pointer is over, as the hit control resolved it. Hover
    // highlighting is drawn to canvas, so there is no DOM state to assert on.
    getHitId: function() {
      var hit = gui.map.getHitControl && gui.map.getHitControl();
      return hit ? hit.getHitId() : -1;
    },
    // The style the label tool will give its next label, set through the style
    // panel with nothing selected. Held in GUI state rather than in a layer, so
    // there is no model to read it back from.
    getNewLabelStyle: function() {
      return getNewLabelStyle(gui);
    },
    zoomByPct: function(pct) {
      gui.map.getExtent().zoomByPct(pct);
    },
    // The map's current view, in display CRS coordinates, for a test that an
    // edit leaves the view where the user put it.
    getViewBounds: function() {
      return gui.map.getExtent().getBounds().toArray();
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
    },
    // Perform the same edit as the snip tool, without simulating the pointer
    // events that choose the cut locations.
    snipActiveLayerPath: function(fid, partId, cuts) {
      var target = gui.model.getActiveLayer();
      var lyr = target && target.layer;
      var result;
      if (!lyr || lyr.geometry_type != 'polyline') {
        throw new Error('Active layer is not a polyline layer');
      }
      result = snipPath(lyr, fid, partId, cuts);
      if (!result) {
        throw new Error('Snip was rejected');
      }
      gui.dispatchEvent('snip', {target: lyr, result: result});
      gui.model.updated({arc_count: true});
      return result;
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
    crs_string: dataset.info && dataset.info.crs_string || null,
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

// The label tool's guide layers, out of everything the overlay last drew.
function getLabelPathGuideLayers(gui) {
  var layers = gui.map && gui.map.getOverlayLayers ?
    gui.map.getOverlayLayers() : [];
  return layers.map(function(lyr) {
    return lyr.gui.displayLayer;
  }).filter(function(lyr) {
    return getLayerName(lyr) == 'label-path-guide' ||
      getLayerName(lyr) == 'label-path-knots';
  });
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
