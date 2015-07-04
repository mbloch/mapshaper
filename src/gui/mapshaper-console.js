/* @requires mapshaper-gui-lib mapshaper-commands */

function Console(model) {
  var CURSOR = '$ ';
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
  message('Type mapshaper commands at the prompt');
  document.addEventListener('keydown', onKeyDown);

  this.hide = function() {
    turnOff();
  };

  this.show = function() {
    turnOn();
  };

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
        capture = true;
    if (_active) {
      if (kc == 13) { // enter
        submit();
      } else if (kc == 27) { // escape
        turnOff();
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
      turnOn();
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
      toHistory(cmd);
      cmd = cmd.replace(/^mapshaper\b/, '').trim();
      if (cmd == 'clear') {
        clear();
      } else if (cmd == 'close' || cmd == 'exit' || cmd == 'quit') {
        turnOff();
      } else if (cmd) {
        runMapshaperCommands(cmd);
      }      
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
}
