/* @requires mapshaper-gui-lib mapshaper-commands */

function Console(model) {
  var CURSOR = '$ ';
  var el = El('#console').hide();
  var buffer = El('#console-buffer');
  var history = El('div').id('console-history').appendTo(buffer);
  var line = El('div').id('command-line').appendTo(buffer);
  var prompt = El('div').text(CURSOR).appendTo(line);
  var input = El('input').appendTo(line).attr('spellcheck', false).attr('autocorrect', false);
  var _active = false;
  var _error = error; // save default error functions...
  var _stop = stop;

  // capture all messages to this console, whether open or closed
  message = consoleMessage;
  message('Type mapshaper commands at the prompt');
  document.addEventListener('keydown', onKeyDown);

  this.hide = function() {
    turnOff();
  };

  this.show = function() {
    turnOn();
  };

  function toHistory(str, cname) {
    var msg = El('div').text(str).appendTo(history);
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
    var el = buffer.parent().node();
    el.scrollTop = el.scrollHeight;
  }

  function metaKey(e) {
    return e.metaKey || e.ctrlKey || e.altKey;
  }

  function onKeyDown(e) {
    var kc = e.keyCode;
    if (_active) {
      if (kc == 13) { // enter
        submit();
      } else if (kc == 27) { // escape
        turnOff();
        e.preventDefault();
      } else if (e.target != input.node() && !metaKey(e)) {
        input.node().focus();
      }

    } else {
      e.stopPropagation();
      e.preventDefault();
      turnOn();
    }
  }

  function readCommandLine() {
    return input.node().value.trim();
  }

  function clear() {
    history.empty();
    scrollDown();
  }

  function submit() {
    var cmd = readCommandLine();
    toHistory(CURSOR + cmd);
    input.node().value = '';
    // TODO: disable UI until run is completed
    cmd = cmd.replace(/^mapshaper\b/, '').trim();
    if (cmd == 'clear') {
      clear();
    } else if (cmd) {
      runMapshaperCommands(cmd);
    }
  }

  function runMapshaperCommands(str) {
    var commands, editing, opts;
    if (/^[^\-]/) {
      // add hyphen prefix to bare commands
      str = '-' + str;
    }
    try {
      commands = MapShaper.parseCommands(str);
      commands = filterCommands(commands);
      editing = model.getEditingLayer();
    } catch (e) {
      return onError(e);
    }
    if (editing && commands && commands.length > 0) {
      opts = commands[0].options;
      if (!opts.target) {
        opts.target = editing.layer.name;
      }
      MapShaper.runParsedCommands(commands, editing.dataset, function(err, dataset) {
        model.updated();
        if (err) onError(err);
      });
    } else {
      message("No commands to run");
    }
  }

  function filterCommands(arr) {
    var names = 'o,i'.split(','),
        filtered = arr.filter(function(cmd) {
          return !utils.contains(names, cmd.name);
        });
    if (filtered.length < arr.length) {
      warning("These commands can not be run in the console:", names.join(', '));
    }
    return filtered;
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
    toHistory(msg, 'console-error');
  }

  function consoleMessage() {
    var msg = gui.formatMessageArgs(arguments);
    toHistory(msg, 'console-message');
  }

  function consoleError() {
    var msg = gui.formatMessageArgs(arguments);
    throw new Error(msg);
  }
}
