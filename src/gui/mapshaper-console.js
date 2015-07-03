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

  message = consoleMessage; // capture all messages to this console
  input.on('keydown', onDown);
  input.on('blur', turnOff);
  monitor();

  message('Type mapshaper commands at the prompt');

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

  function monitor() {
    document.addEventListener('keydown', onKeyDown);
  }

  function unmonitor() {
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (e.keyCode == 32) { // space
      e.stopPropagation();
      e.preventDefault();
      turnOn();
    }
  }

  // TODO: capture stop
  function turnOn() {
    if (!_active) {
      _active = true;
      stop = consoleStop;
      error = consoleError;
      el.show();
      input.node().focus();
      document.addEventListener('mousedown', block);
      unmonitor();
    }
  }

  function turnOff() {
    if (_active) {
      _active = false;
      stop = _stop; // restore original error functions
      error = _error;
      document.removeEventListener('mousedown', block);
      el.hide();
      monitor();
    }
  }

  function scrollDown() {
    var el = buffer.parent().node();
    el.scrollTop = el.scrollHeight;
  }

  function block(e) {
    if (e.target != input.node()) {
      e.preventDefault();
    }
  }

  function onDown(e) {
    var kc = e.keyCode;
    if (kc == 13) { // enter
      submit();
    } else if (kc == 27) { // escape
      turnOff();
      e.preventDefault();
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
    cmd = cmd.replace(/^mapshaper */, '');
    if (cmd == 'clear') {
      clear();
    } else if (cmd) {
      runMapshaperCommands(cmd);
    }
  }

  function runMapshaperCommands(str) {
    var commands, editing, opts;
    if (str[0] != '-') {
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
      onError("These commands can not be run in the console:", names.join(', '));
    }
    return filtered;
  }

  function onError(err) {
    if (utils.isString(err)) {
      stop(err);
    } else if (err.name == 'APIError') {
      // stop() has already been called, don't need to log
    } else if (err.name) {
      // console.log("onError() logging err:", err.name);
      // log to browser console, with stack trace
      console.error(err);
      // log to console window
      toHistory(err.message, 'console-error');
    }
  }

  function consoleStop() {
    var msg = gui.formatMessageArgs(arguments);
    // console.log("consoleStop():", msg);
    toHistory(msg, 'console-error');
    throw new APIError(msg);
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
