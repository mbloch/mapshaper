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
import { snipPath, undoSnip } from './gui-snipping-utils';

var copyRecord = internal.copyRecord;

// Modes whose tools edit the data directly, adding in-memory undo states.
// The line and polygon tools' drawing modes ('edit_lines', 'edit_polygons')
// are not among them: drawing and styling are commands.
var closureEditModes = ['data', 'edit_points', 'reshape_lines', 'reshape_polygons',
  'vertices', 'rectangles', 'snip_lines'];

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
  var pendingCommits = [];
  var interceptors = [];
  var self = this;
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

  // A session ended by a command while drawing was disarmed starts again when
  // drawing is armed, which is when the tools can edit the layer directly.
  gui.on('interaction_tool_change', function() {
    editSession.restart();
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

  gui.on('snip', function(e) {
    // read from e.data: the event dispatcher sets e.target to itself, so a
    // 'target' property in the payload never reaches the handler
    var target = e.data.target;
    var result = e.data.result;
    var undo = function() {
      undoSnip(target, result);
      gui.model.updated({arc_count: true});
    };
    var redo = function() {
      // re-snipping restores the same arc ids, because the arcs added by the
      // previous snip were removed from the end of the collection
      result = snipPath(target, result.fid, result.partId, result.cuts);
      gui.model.updated({arc_count: true});
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

  // How many states are available to undo. A caller that has to take back
  // everything it caused, without knowing how many steps that turned out to
  // be, can read this before it starts and undo back down to it.
  this.getStateCount = function() {
    return history.length - offset;
  };

  this.addHistoryState = function(undo, redo, cleanup, opts) {
    addHistoryState(undo, redo, cleanup, opts);
  };

  // An edit whose history state has not been added yet -- a panel session
  // that records one state when it ends -- registers a function that adds it.
  // Undo and redo run it, and wait for it, before they act; otherwise they
  // would take back the state before the edit and leave the edit in place.
  // Returns a function that unregisters it.
  this.addPendingCommit = function(commit) {
    pendingCommits.push(commit);
    return function() {
      var i = pendingCommits.indexOf(commit);
      if (i > -1) pendingCommits.splice(i, 1);
    };
  };

  // A tool with edits of its own that are not in the history yet -- the path
  // being drawn by the line tool -- registers functions that Undo and Redo
  // call first: {undo, redo}. A function returns true if it handled the
  // action, and false to let the history handle it.
  this.addInterceptor = function(o) {
    interceptors.push(o);
  };

  function intercept(type) {
    return interceptors.some(function(o) {
      return !!(o[type] && o[type]());
    });
  }

  // The edit session captures the layer being edited when it starts, so a
  // command that changes that layer -- the line tool's -add-shape, say -- has
  // to end the session first: its edits are committed as a stored state of
  // their own, and after the command, restartEditSession() starts a new session
  // from the data the command left. Otherwise the session's state, when it was
  // committed, would take back the command as well.
  //
  // Other commands -- a scale bar edit, say -- leave the session alone, so
  // that its edits stay separate undo steps on either side of the command,
  // unless the session has no edits yet, when ending it costs nothing.
  //
  // changesEditTarget: the command may change the layer being edited
  // Returns a promise if there were edits to commit.
  this.checkpointEditSession = function(changesEditTarget) {
    if (!changesEditTarget && countModeStates() > 0) return null;
    return editSession.checkpoint();
  };

  this.restartEditSession = function() {
    editSession.restart();
  };

  function flushPendingCommits() {
    var commits = pendingCommits.splice(0);
    if (commits.length === 0) return null;
    return Promise.all(commits.map(function(commit) {
      return Promise.resolve(commit()).catch(function(e) {
        console.error(e);
      });
    }));
  }

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
      preserveOnModeChange: preserveOnModeChange,
      changesEditTarget: !!(opts && opts.changesEditTarget)
    });
    if (!preserveOnModeChange) {
      editSession.noteEdit();
    }
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

  function fireHistoryChange() {
    gui.dispatchEvent('history_change', {
      canUndo: history.length - offset > 0,
      canRedo: offset > 0
    });
  }

  this.undo = function() {
    if (intercept('undo')) return;
    var pending = flushPendingCommits();
    if (pending) return pending.then(function() { return self.undo(); });
    // firing even if history is empty
    // (because this event may trigger a new history state)
    gui.dispatchEvent('undo_redo_pre', {type: 'undo'});
    var item = getHistoryItem();
    if (item && endsEditSession(item)) {
      pending = editSession.checkpoint();
      if (pending) return pending.then(function() { return self.undo(); });
    }
    if (item) {
      offset++;
      return runHistoryAction(item, 'undo', function() {
        offset--;
      });
    }
  };

  this.redo = function() {
    if (intercept('redo')) return;
    var pending = flushPendingCommits();
    if (pending) return pending.then(function() { return self.redo(); });
    gui.dispatchEvent('undo_redo_pre', {type: 'redo'});
    if (offset <= 0) return;
    if (endsEditSession(history[history.length - offset])) {
      pending = editSession.checkpoint();
      if (pending) return pending.then(function() { return self.redo(); });
    }
    offset--;
    var item = getHistoryItem();
    return runHistoryAction(item, 'redo', function() {
      offset++;
    });
  };

  // Undoing or redoing a stored state changes the data outside the edit
  // session, as a command does, and ends the session on the same terms (see
  // checkpointEditSession()). A state that changed the layer being edited was
  // added by checkpointing the session's edits first, so the edits that follow
  // it in the history have all been undone by the time it is reached: the
  // checkpoint only drops the ones that could have been redone.
  function endsEditSession(item) {
    return !!item && item.preserveOnModeChange && editSession.isActive() &&
      (item.changesEditTarget || countModeStates() === 0);
  }

  function runHistoryAction(item, type, rollback) {
    var action = type == 'undo' ? item.undo : item.redo;
    return Promise.resolve(action()).then(function() {
      afterHistoryAction(item);
      gui.dispatchEvent('undo_redo_post', {type: type});
      gui.dispatchEvent('map-needs-refresh');
      fireHistoryChange();
    }).catch(function(err) {
      rollback();
      afterHistoryAction(item);
      fireHistoryChange();
      console.error(err);
      throw err;
    });
  }

  function afterHistoryAction(item) {
    if (item.preserveOnModeChange) {
      editSession.restart();
    }
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
    var mode = null;

    return {
      start: start,
      finish: finish,
      noteEdit: noteEdit,
      checkpoint: checkpoint,
      restart: restart,
      isActive: function() { return !!tx; }
    };

    function start(nextMode) {
      var target, Transaction;
      mode = nextMode;
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
      mode = null;
      if (!finishedTx || !isEditSessionMode(prevMode)) {
        resetSession();
        return;
      }
      resetSession();
      if (!wasChanged) return;
      commit(finishedTx);
    }

    // Ends the session, committing the edits that are in effect (see
    // checkpointEditSession()). Returns a promise if there were any.
    function checkpoint() {
      var finishedTx = tx;
      var hasEdits = countDoneModeStates() > 0;
      var promise, unregister;
      if (!finishedTx) return null;
      resetSession();
      clearModeHistory();
      if (!hasEdits) return null;
      promise = commit(finishedTx);
      // until the state is added, Undo would skip over the edits
      unregister = self.addPendingCommit(function() { return promise; });
      return promise.then(unregister);
    }

    // Starts a new session, in a mode whose tools edit the data directly. In
    // other modes, edits are made by commands, and capturing the layer after
    // each one would be wasted work. The line and polygon modes edit directly
    // only while drawing is armed (see getToolMode()).
    function restart() {
      var toolMode = gui.interaction && gui.interaction.getToolMode ?
        gui.interaction.getToolMode() : mode;
      if (tx || !mode || !closureEditModes.includes(toolMode)) return;
      start(mode);
    }

    function commit(finishedTx) {
      return getStoredUndoHistory(gui).addTransaction(finishedTx, {
        flags: {select: true},
        entryPrefix: 'edit-session',
        changesEditTarget: true
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
    // Attribute editing changes the table and nothing else, so that is all
    // there is to capture.
    if (mode == 'data') {
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

  function countDoneModeStates() {
    return countModeStates(history.slice(0, history.length - offset));
  }

  function countModeStates(items) {
    return (items || history).filter(function(item) {
      return !item.preserveOnModeChange;
    }).length;
  }

  function isEditSessionMode(mode) {
    if (gui.interaction && gui.interaction.modeSupportsUndo) {
      return gui.interaction.modeSupportsUndo(mode);
    }
    return closureEditModes.includes(mode);
  }

  function getUndoTransactionConstructor() {
    return internal.UndoTransaction && (internal.UndoTransaction.UndoTransaction || internal.UndoTransaction);
  }

}
