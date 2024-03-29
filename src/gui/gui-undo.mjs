import { internal } from './gui-core';
import {
  setPointCoords,
  setVertexCoords,
  getVertexCoords,
  insertVertex,
  deleteVertex,
  setRectangleCoords,
  appendNewPoint,
  deleteLastPoint
} from './gui-drawing-utils';

var copyRecord = internal.copyRecord;

function isUndoEvt(e) {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key == 'z';
}

function isRedoEvt(e) {
  return (e.ctrlKey || e.metaKey) && (e.shiftKey && e.key == 'z' || !e.shiftKey && e.key == 'y');
}

export function Undo(gui) {
  var history, offset, stashedUndo;
  reset();

  // Undo history is cleared when the editing mode changes.
  gui.on('interaction_mode_change', function(e) {
    gui.undo.clear();
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
    var e = evt.originalEvent,
        kc = e.keyCode;
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
    reset();
  };

  function addHistoryState(undo, redo) {
    if (offset > 0) {
      history.splice(-offset);
      offset = 0;
    }
    history.push({undo, redo});
  }

  this.undo = function() {
    // firing even if history is empty
    // (because this event may trigger a new history state)
    gui.dispatchEvent('undo_redo_pre', {type: 'undo'});
    var item = getHistoryItem();
    if (item) {
      offset++;
      item.undo();
      gui.dispatchEvent('undo_redo_post', {type: 'undo'});
      gui.dispatchEvent('map-needs-refresh');
    }
  };

  this.redo = function() {
    gui.dispatchEvent('undo_redo_pre', {type: 'redo'});
    if (offset <= 0) return;
    offset--;
    var item = getHistoryItem();
    item.redo();
    gui.dispatchEvent('undo_redo_post', {type: 'redo'});
    gui.dispatchEvent('map-needs-refresh');
  };

  function getHistoryItem() {
    var item = history[history.length - offset - 1];
    return item || null;
  }

}
