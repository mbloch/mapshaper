import { showPopupAlert } from './gui-alert';

// opts.session  a command session from gui.console.createCommandSession(),
//               for an edit that is one of a set recorded as one undo state
export function runGuiEditCommand(gui, cmd, optsArg) {
  var opts = optsArg || {};
  if (!gui.console) return;
  if (opts.session) {
    opts.session.run(cmd, onDone);
  } else {
    gui.console.runMapshaperCommands(cmd, onDone);
  }

  function onDone(err, flags) {
    if (err) {
      showPopupAlert(err.message || String(err), opts.title || 'Command error');
      if (opts.onError) opts.onError(err);
    } else if (opts.onSuccess) {
      opts.onSuccess(flags);
    }
    if (opts.onDone) {
      opts.onDone(err, flags);
    }
  }
}
