/* @requires mapshaper-gui-lib mapshaper-commands mapshaper-mode-button */

function Console(model) {
  var CURSOR = '$ ';
  var PROMPT = 'Enter mapshaper commands, or type "examples" to see examples';
  var el = El('#console').hide();
  var content = El('#console-buffer');
  var log = El('div').id('console-log').appendTo(content);
  var line = El('div').id('command-line').appendTo(content);
  var prompt = El('div').text(CURSOR).appendTo(line);
  var input = El('input').appendTo(line).attr('spellcheck', false).attr('autocorrect', false);
  var history = [];
  var historyId = 0;
  var _active = false;
  var _error = error; // save default error functions...
  var _stop = stop;

  // capture all messages to this console, whether open or closed
  message = consoleMessage;

  message(PROMPT);
  document.addEventListener('keydown', onKeyDown);
  new ModeButton('#console-btn', 'console', model);
  model.addMode('console', turnOn, turnOff);

  function toLog(str, cname) {
    var msg = El('div').text(str).appendTo(log);
    if (cname) {
      msg.addClass(cname);
    }
    scrollDown();
  }

  function turnOn() {
    if (!_active && !!model.getEditingLayer()) {
      _active = true;
      stop = consoleStop;
      error = consoleError;
      el.show();
      input.node().focus();
    }
  }

  function turnOff() {
    if (_active) {
      _active = false;
      stop = _stop; // restore original error functions
      error = _error;
      el.hide();
    }
  }

  function scrollDown() {
    var el = content.parent().node();
    el.scrollTop = el.scrollHeight;
  }

  function metaKey(e) {
    return e.metaKey || e.ctrlKey || e.altKey;
  }

  function onKeyDown(e) {
    var kc = e.keyCode,
        capture = false;
    if (kc == 27) { // esc
      model.clearMode(); // esc escapes other modes as well
      capture = true;
    } else if (_active) {
      capture = true;
      if (kc == 13) { // enter
        submit();
      } else if (kc == 38) {
        back();
      } else if (kc == 40) {
        forward();
      } else if (e.target != input.node() && !metaKey(e)) {
        // typing returns focus, unless a meta key is down (to allow Cmd-C copy)
        input.node().focus();
        capture = false;
      } else {
        capture = false;
      }
    } else if (kc == 32) { // space
      // space bar opens console, unless typing in an input field
      if (document.activeElement.tagName != 'INPUT') {
        capture = true;
        model.enterMode('console');
      }
    }
    if (capture) {
      e.preventDefault();
    }
  }

  function readCommandLine() {
    return input.node().value.trim();
  }

  function toHistory(str) {
    // truncate history, if we're behind the head
    if (historyId > 0) {
      history.splice(-historyId, historyId);
      historyId = 0;
    }
    history.push(str);
  }

  function fromHistory() {
    var i = history.length - historyId - 1;
    input.node().value = history[i];
  }

  function back() {
    if (history.length === 0) return;
    if (historyId === 0) {
      history.push(input.node().value);
    }
    historyId = Math.min(history.length - 1, historyId + 1);
    fromHistory();
  }

  function forward() {
    if (historyId <= 0) return;
    historyId--;
    fromHistory();
    if (historyId === 0) {
      history.pop();
    }
  }

  function clear() {
    log.empty();
    scrollDown();
  }

  function submit() {
    var cmd = readCommandLine();
    input.node().value = '';
    toLog(CURSOR + cmd);
    if (cmd) {
      if (cmd == 'clear') {
        clear();
      } else if (cmd == 'examples') {
        printExamples();
      } else if (cmd == 'layers') {
        message("Available layers:",
          MapShaper.getFormattedLayerList(model.getEditingLayer().dataset.layers));
      } else if (cmd == 'close' || cmd == 'exit' || cmd == 'quit') {
        model.clearMode();
      } else if (cmd) {
        runMapshaperCommands(cmd);
      }
      toHistory(cmd);
    }
  }

  function runMapshaperCommands(str) {
    var commands, editing, dataset, lyr;
    try {
      commands = MapShaper.parseConsoleCommands(str);
      editing = model.getEditingLayer();
      dataset = editing.dataset;
      lyr = editing.layer;
      // Use currently edited layer as default command target
      // TODO: handle targeting for unnamed layer
      if (lyr && lyr.name) {
        commands.forEach(function(cmd) {
          // rename-layers should default to all layers;
          // other commands can target the current layer
          if (!cmd.options.target && cmd.name != 'rename-layers') {
            cmd.options.target = lyr.name;
          }
        });
      }
    } catch (e) {
      return onError(e);
    }
    if (commands.length > 0) {
      MapShaper.runParsedCommands(commands, dataset, function(err) {
        if (dataset) {
          if (utils.contains(dataset.layers, lyr)) {
            model.updated();
          } else {
            // If original editing layer no longer exists, switch to a different layer
            model.setEditingLayer(dataset.layers[0], dataset);
          }
        }
        if (err) onError(err);
      });
    }
  }

  function onError(err) {
    if (utils.isString(err)) {
      stop(err);
    } else if (err.name == 'APIError') {
      // stop() has already been called, don't need to log
    } else if (err.name) {
      // log to browser console, with stack trace
      console.error(err);
      // log to console window
      warning(err.message);
    }
  }

  function consoleStop() {
    var msg = gui.formatMessageArgs(arguments);
    warning(msg);
    throw new APIError(msg);
  }

  function warning() {
    var msg = gui.formatMessageArgs(arguments);
    toLog(msg, 'console-error');
  }

  function consoleMessage() {
    var msg = gui.formatMessageArgs(arguments);
    toLog(msg, 'console-message');
  }

  function consoleError() {
    var msg = gui.formatMessageArgs(arguments);
    throw new Error(msg);
  }

  function printExample(comment, command) {
    toLog(comment, 'console-message');
    toLog(command, 'console-example');
  }

  function printExamples() {
    printExample("View information about this data layer", "$ info");
    printExample("Extract one state from a national dataset","$ filter 'STATE == \"Iowa\"'");
    printExample("View help about a command", "$ help filter");
  }
}
