import { internal } from './gui-core';
import { appUndoIsEnabled, getStoredUndoHistory } from './gui-app-undo';
import {
  setPointCoords,
  setVertexCoords,
  getVertexCoords,
  insertVertex,
  deleteVertex,
  setRectangleCoords,
  appendNewPoint,
  deleteLastPoint,
  deleteFeature,
  insertFeature
} from './gui-drawing-utils';

var copyRecord = internal.copyRecord;

function isUndoEvt(e) {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && getEventKey(e) == 'z';
}

function isRedoEvt(e) {
  var key = getEventKey(e);
  return (e.ctrlKey || e.metaKey) && (e.shiftKey && key == 'z' || !e.shiftKey && key == 'y');
}

function getEventKey(e) {
  return (e.key || '').toLowerCase();
}

export function Undo(gui) {
  var history, offset, stashedUndo, editSession;
  editSession = createEditSessionUndo();
  reset();

  // Closure-based editing states are cleared when the interaction mode changes.
  // App command states opt out, because view/inspection modes should not erase
  // command history.
  gui.on('interaction_mode_change', function(e) {
    editSession.finish(e.prev_mode);
    clearModeHistory();
    editSession.start(e.mode);
  });

  function reset() {
    history = [];
    stashedUndo = null;
    offset = 0;
  }

  function makeMultiDataSetter(ids) {
    if (ids.length == 1) return makeDataSetter(ids[0]);
    var target = gui.model.getActiveLayer();
    var recs = ids.map(id => copyRecord(target.layer.data.getRecordAt(id)));
    return function() {
      var data = target.layer.data.getRecords();
      for (var i=0; i<ids.length; i++) {
        data[ids[i]] = recs[i];
      }
      gui.dispatchEvent('popup-needs-refresh');
    };
  }

  function makeDataSetter(id) {
    var target = gui.model.getActiveLayer();
    var rec = copyRecord(target.layer.data.getRecordAt(id));
    return function() {
      target.layer.data.getRecords()[id] = rec;
      gui.dispatchEvent('popup-needs-refresh');
    };
  }

  gui.keyboard.on('keydown', function(evt) {
    var e = evt.originalEvent;
    if (targetHandlesTextUndo(e.target)) return;
    if (isUndoEvt(e)) {
      this.undo();
      e.stopPropagation();
      e.preventDefault();
    }
    if (isRedoEvt(e)) {
      this.redo();
      e.stopPropagation();
      e.preventDefault();
    }
  }, this, 10);

  function targetHandlesTextUndo(target) {
    var tagName, type;
    if (!target) return false;
    if (target.isContentEditable || closestContentEditable(target)) return true;
    tagName = (target.tagName || '').toLowerCase();
    if (tagName == 'textarea') return true;
    if (tagName != 'input') return false;
    type = (target.type || 'text').toLowerCase();
    return !'button,checkbox,color,file,hidden,image,radio,range,reset,submit'.includes(type);
  }

  function closestContentEditable(target) {
    while (target && target.nodeType == 1) {
      if (target.getAttribute && target.getAttribute('contenteditable') == 'true') return target;
      target = target.parentNode;
    }
    return null;
  }

  gui.on('symbol_dragend', function(e) {
    var target = e.data.target;
    var undo = function() {
      setPointCoords(target, e.FID, e.startCoords);
    };
    var redo = function() {
      setPointCoords(target, e.FID, e.endCoords);
    };
    addHistoryState(undo, redo);
  });

  // undo/redo label dragging
  //
  gui.on('label_dragstart', function(e) {
    stashedUndo = makeDataSetter(e.FID);
  });

  gui.on('label_dragend', function(e) {
    var redo = makeDataSetter(e.FID);
    addHistoryState(stashedUndo, redo);
  });

  // undo/redo data editing
  // TODO: consider setting selected feature to the undo/redo target feature
  //
  gui.on('data_preupdate', function(e) {
    stashedUndo = makeMultiDataSetter(e.ids);
  });

  gui.on('data_postupdate', function(e) {
    var redo = makeMultiDataSetter(e.ids);
    addHistoryState(stashedUndo, redo);
  });

  gui.on('rectangle_dragend', function(e) {
    var target = e.data.target;
    var points1 = e.points;
    var points2 = e.ids.map(id => getVertexCoords(target, id));
    var undo = function() {
      setRectangleCoords(target, e.ids, points1);
    };
    var redo = function() {
      setRectangleCoords(target, e.ids, points2);
    };
    addHistoryState(undo, redo);
  });

  gui.on('vertex_dragend', function(e) {
    var target = e.data.target;
    var startPoint = e.point; // in data coords
    var endPoint = getVertexCoords(target, e.ids[0]);
    var undo = function() {
      if (e.data.type == 'interpolated') {
        deleteVertex(target, e.ids[0]);
      } else {
        setVertexCoords(target, e.ids, startPoint);
      }
    };
    var redo = function() {
      if (e.insertion) {
        insertVertex(target, e.ids[0], endPoint);
      }
      setVertexCoords(target, e.ids, endPoint);
    };
    addHistoryState(undo, redo);
  });

  gui.on('vertex_delete', function(e) {
    // get vertex coords in data coordinates (not display coordinates);
    var p = getVertexCoords(e.data.target, e.vertex_id);
    var redo = function() {
      deleteVertex(e.data.target, e.vertex_id);
    };
    var undo = function() {
      insertVertex(e.data.target, e.vertex_id, p);
    };
    addHistoryState(undo, redo);
  });

  gui.on('point_add', function(e) {
    var redo = function() {
      appendNewPoint(e.data.target, e.p);
    };
    var undo = function() {
      deleteLastPoint(e.data.target);
    };
    addHistoryState(undo, redo);
  });

  gui.on('feature_delete', function(e) {
    var redo = function() {
      deleteFeature(e.data.target, e.fid);
    };
    var undo = function() {
      insertFeature(e.data.target, e.fid, e.coords, e.d);
    };
    addHistoryState(undo, redo);
  });

  gui.on('path_add', function(e) {
    var redo = function() {
      gui.dispatchEvent('redo_path_add', {p1: e.p1, p2: e.p2});
    };
    var undo = function() {
      gui.dispatchEvent('undo_path_add');
    };
    addHistoryState(undo, redo);
  });

  gui.on('path_extend', function(e) {
    var redo = function() {
      gui.dispatchEvent('redo_path_extend', {p: e.p, shapes: e.shapes2});
    };
    var undo = function() {
      gui.dispatchEvent('undo_path_extend', {shapes: e.shapes1});
    };
    addHistoryState(undo, redo);
  });

  this.clear = function() {
    disposeHistoryItems(history);
    reset();
    fireHistoryChange();
  };

  this.canUndo = function() {
    return history.length - offset > 0;
  };

  this.canRedo = function() {
    return offset > 0;
  };

  this.addHistoryState = function(undo, redo, cleanup, opts) {
    addHistoryState(undo, redo, cleanup, opts);
  };

  this.evictOldestHistoryState = function(opts) {
    return evictOldestHistoryState(opts || {});
  };

  function addHistoryState(undo, redo, cleanup, opts) {
    var preserveOnModeChange = !!(opts && opts.preserveOnModeChange);
    if (offset > 0) {
      disposeHistoryItems(history.splice(-offset));
      offset = 0;
    }
    history.push({
      undo: undo,
      redo: redo,
      cleanup: cleanup,
      evictToken: opts && opts.evictToken,
      preserveOnModeChange: preserveOnModeChange
    });
    if (!preserveOnModeChange) {
      editSession.noteEdit();
    }
    trimHistory(opts);
    fireHistoryChange();
  }

  async function evictOldestHistoryState(opts) {
    var exclude = opts && opts.exclude;
    var index = -1;
    for (var i = 0; i < history.length; i++) {
      if (!exclude || history[i].evictToken !== exclude) {
        index = i;
        break;
      }
    }
    if (index == -1) return false;
    var item = history.splice(index, 1)[0];
    if (index >= history.length + 1 - offset) {
      offset--;
    }
    await disposeHistoryItem(item);
    fireHistoryChange();
    return true;
  }

  function clearModeHistory() {
    var doneCount = history.length - offset;
    var nextHistory = [];
    var removed = [];
    var nextDoneCount = 0;
    history.forEach(function(item, i) {
      if (item.preserveOnModeChange) {
        if (i < doneCount) nextDoneCount++;
        nextHistory.push(item);
      } else {
        removed.push(item);
      }
    });
    if (removed.length === 0) return;
    disposeHistoryItems(removed);
    history = nextHistory;
    offset = history.length - nextDoneCount;
    fireHistoryChange();
  }

  function trimHistory(opts) {
    var max = opts && opts.maxStates;
    var overflow;
    if (!(max > 0) || history.length <= max) return;
    overflow = history.length - max;
    disposeHistoryItems(history.splice(0, overflow));
  }

  function fireHistoryChange() {
    gui.dispatchEvent('history_change', {
      canUndo: history.length - offset > 0,
      canRedo: offset > 0
    });
  }

  this.undo = function() {
    // firing even if history is empty
    // (because this event may trigger a new history state)
    gui.dispatchEvent('undo_redo_pre', {type: 'undo'});
    var item = getHistoryItem();
    if (item) {
      offset++;
      return runHistoryAction(item.undo, 'undo', function() {
        offset--;
      });
    }
  };

  this.redo = function() {
    gui.dispatchEvent('undo_redo_pre', {type: 'redo'});
    if (offset <= 0) return;
    offset--;
    var item = getHistoryItem();
    return runHistoryAction(item.redo, 'redo', function() {
      offset++;
    });
  };

  function runHistoryAction(action, type, rollback) {
    return Promise.resolve(action()).then(function() {
      gui.dispatchEvent('undo_redo_post', {type: type});
      gui.dispatchEvent('map-needs-refresh');
      fireHistoryChange();
    }).catch(function(err) {
      rollback();
      fireHistoryChange();
      console.error(err);
      throw err;
    });
  }

  function disposeHistoryItems(items) {
    items.forEach(function(item) {
      disposeHistoryItem(item);
    });
  }

  function disposeHistoryItem(item) {
    var result;
    if (!item || !item.cleanup) return Promise.resolve();
    try {
      result = item.cleanup();
      if (result && typeof result.then == 'function') {
        return result.catch(function() {});
      }
    } catch(e) {}
    return Promise.resolve();
  }

  function getHistoryItem() {
    var item = history[history.length - offset - 1];
    return item || null;
  }

  function createEditSessionUndo() {
    var tx = null;
    var changed = false;

    return {
      start: start,
      finish: finish,
      noteEdit: noteEdit
    };

    function start(nextMode) {
      var target, Transaction;
      if (!isEditSessionMode(nextMode)) return;
      if (!appUndoIsEnabled(gui)) return;
      target = gui.model.getActiveLayer();
      if (!target || !target.layer) return;
      Transaction = getUndoTransactionConstructor();
      if (!Transaction) return;
      changed = false;
      tx = new Transaction('edit session');
      captureEditTarget(tx, target, nextMode);
    }

    function finish(prevMode) {
      var finishedTx = tx;
      var wasChanged = changed;
      if (!finishedTx || !isEditSessionMode(prevMode)) {
        resetSession();
        return;
      }
      resetSession();
      if (!wasChanged) return;
      getStoredUndoHistory(gui).addTransaction(finishedTx, {
        flags: {select: true},
        entryPrefix: 'edit-session',
        maxStates: getEditSessionUndoHistoryLimit()
      }).catch(function(e) {
        console.error(e);
      });
    }

    function noteEdit() {
      if (tx) {
        changed = true;
      }
    }

    function resetSession() {
      tx = null;
      changed = false;
    }
  }

  function captureEditTarget(tx, target, mode) {
    var layer = target.layer;
    var dataset = target.dataset;
    if (mode == 'data' || mode == 'labels') {
      if (layer.data) {
        tx.captureTableBefore(layer.data, {operation: 'edit-session', mode: mode});
      }
      return;
    }
    tx.captureLayerBefore(layer, {operation: 'edit-session', mode: mode, unit: 'layer'});
    if (layer.data) {
      tx.captureTableBefore(layer.data, {operation: 'edit-session', mode: mode});
    }
    if (dataset && dataset.arcs && internal.layerHasPaths(layer)) {
      tx.captureArcsBefore(dataset.arcs, {operation: 'edit-session', mode: mode});
    }
  }

  function isEditSessionMode(mode) {
    if (gui.interaction && gui.interaction.modeSupportsUndo) {
      return gui.interaction.modeSupportsUndo(mode);
    }
    return ['data', 'labels', 'edit_points', 'edit_lines', 'edit_polygons', 'vertices', 'rectangles'].includes(mode);
  }

  function getUndoTransactionConstructor() {
    return internal.UndoTransaction && (internal.UndoTransaction.UndoTransaction || internal.UndoTransaction);
  }

  function getEditSessionUndoHistoryLimit() {
    var opt = gui.options && gui.options.undoHistoryLimit;
    return opt > 0 ? opt : 10;
  }

}
