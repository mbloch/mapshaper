import { showPopupAlert } from './gui-alert';

export function runGuiEditCommand(gui, cmd, optsArg) {
  var opts = optsArg || {};
  if (!gui.console) return;
  gui.console.runMapshaperCommands(cmd, function(err, flags) {
    if (err) {
      showPopupAlert(err.message || String(err), opts.title || 'Command error');
      if (opts.onError) opts.onError(err);
    } else if (opts.onSuccess) {
      opts.onSuccess(flags);
    }
    if (opts.onDone) {
      opts.onDone(err, flags);
    }
  });
}
