import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { appUndoIsEnabled } from './gui-app-undo';
import { getFrameVisibilityOptions } from './gui-frame-visibility';

// Showing and hiding a frame's layers is part of the map, so each change is a
// -frame command, recorded in the session and undoable. A run of changes to
// one frame's layers, with nothing in between but changes of the selected
// layer, is kept as one undo state and one command in the session history,
// which makes the change from where the run started; changes that cancel out
// leave neither.
export function FrameVisibilityRuns(gui) {
  var model = gui.model;
  var run = null;

  // @layers: layers of @frame to hide (@hidden) or show
  this.setLayersHidden = function(frame, layers, hidden, onSuccess) {
    var members = internal.getFrameMemberLayers(model, frame);
    var before = getHiddenFlags(members);
    var continued = runContinues(frame);
    var start = continued ? run.start : before;
    var options = getFrameVisibilityOptions(members.map(function(o) {
      var prev = before.get(o.layer);
      return {
        ref: internal.getFrameMemberRef(model, frame, o.layer),
        start: start.has(o.layer) ? start.get(o.layer) : prev,
        prev: prev,
        next: layers.includes(o.layer) ? hidden : prev
      };
    }), internal.formatOptionValue);
    var stateBefore = undoIsOn() ? gui.undo.getDoneStateId(0) : null;
    if (!options.run) {
      if (onSuccess) onSuccess();
      return;
    }
    runGuiEditCommand(gui, getFrameCommand(frame, options.run), {
      title: 'Map frame',
      onSuccess: function(flags) {
        recordChange(frame, continued, start, before, options.record, stateBefore);
        if (onSuccess) onSuccess(flags);
      }
    });
  };

  function recordChange(frame, continued, start, before, record, stateBefore) {
    var entryId = gui.session.getLastEditId();
    var undoOn = undoIsOn();
    var stateId = undoOn ? gui.undo.getDoneStateId(0) : null;
    var culled;
    if (continued && (!undoOn || stateId !== stateBefore && gui.undo.getDoneStateId(1) === run.stateId)) {
      gui.session.replaceCommand(run.entryId, null);
      gui.session.replaceCommand(entryId, record ? getFrameCommand(frame, record) : null);
      if (!record) {
        if (undoOn) gui.undo.discardDoneStates(2);
        run = null;
        return;
      }
      culled = run.culled.concat(run.entryId);
      run.culled = culled;
      run.entryId = entryId;
      run.stateId = undoOn ? gui.undo.combineDoneStates(2, function() {
        culled.forEach(function(id) { gui.session.replaceCommand(id, null); });
      }) : null;
      return;
    }
    run = {
      dataset: frame.dataset,
      start: before,
      entryId: entryId,
      stateId: undoOn && stateId !== stateBefore ? stateId : null,
      culled: []
    };
  }

  // A run goes on while its command is the last edit in the session history
  // and its state is the last undo state
  function runContinues(frame) {
    if (!run || run.dataset != frame.dataset) return false;
    if (gui.session.getLastEditId() !== run.entryId) return false;
    if (!undoIsOn()) return true;
    return !gui.undo.canRedo() && run.stateId !== null && gui.undo.getDoneStateId(0) === run.stateId;
  }

  function undoIsOn() {
    return !!gui.undo && appUndoIsEnabled(gui);
  }

  function getFrameCommand(frame, options) {
    return '-frame target=' +
      internal.formatOptionValue(internal.getLayerTargetId(model, frame.layer)) + ' ' + options;
  }
}

function getHiddenFlags(members) {
  return members.reduce(function(memo, o) {
    memo.set(o.layer, !!o.layer.frame_hidden);
    return memo;
  }, new Map());
}
