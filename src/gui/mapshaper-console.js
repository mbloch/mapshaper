/* @requires mapshaper-gui-lib mapshaper-commands mapshaper-mode-button */

function Console(model) {
  var CURSOR = '$ ';
  var PROMPT = 'Enter mapshaper commands or type "tips" for examples and console help';
  var el = El('#console').hide();
  var content = El('#console-buffer');
  var log = El('div').id('console-log').appendTo(content);
  var line = El('div').id('command-line').appendTo(content);
  var prompt = El('div').text(CURSOR).appendTo(line);
  var input = El('input').appendTo(line).attr('spellcheck', false).attr('autocorrect', false);
  var history = [];
  var historyId = 0;
  var _isOpen = false;
  var _error = error; // save default error functions...
  var _stop = stop;

  // capture all messages to this console, whether open or closed
  message = consoleMessage;
  verbose = consoleVerbose;

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
    if (!_isOpen && !!model.getEditingLayer()) {
      _isOpen = true;
      stop = consoleStop;
      error = consoleError;
      el.show();
      input.node().focus();
    }
  }

  function turnOff() {
    if (_isOpen) {
      _isOpen = false;
      stop = _stop; // restore original error functions
      error = _error;
      el.hide();
      input.node().blur();
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
        inputEl = gui.getInputElement(),
        typing = !!inputEl,
        typingInConsole = inputEl && inputEl == input.node(),
        inputText = readCommandLine(),
        capture = false;

    // esc key
    if (kc == 27) {
      if (typing) {
        inputEl.blur();
      }
      model.clearMode(); // esc escapes other modes as well
      capture = true;

    // l/r arrow keys while not typing a text field
    } else if ((kc == 37 || kc == 39) && (!typing || typingInConsole && !inputText)) {
      if (kc == 37) {
        model.selectPrevLayer();
      } else {
        model.selectNextLayer();
      }

    // delete key while not inputting text
    } else if (kc == 8 && !typing) {
      capture = true; // prevent delete from leaving page

    // any key while console is open
    } else if (_isOpen) {
      capture = true;
      if (kc == 13) { // enter
        submit();
      } else if (kc == 9) { // tab
        tabComplete();
      } else if (kc == 38) {
        back();
      } else if (kc == 40) {
        forward();
      } else if (kc == 32 && inputText === '') {
        // space bar closes if nothing has been typed
        model.clearMode();
      } else if (!typing && e.target != input.node() && !metaKey(e)) {
        // typing returns focus, unless a meta key is down (to allow Cmd-C copy)
        // or user is typing in a different input area somewhere
        input.node().focus();
        capture = false;
      } else {
        // normal typing
        capture = false;
      }

    // space bar while not inputting text
    } else if (!typing && kc == 32) {
      // space bar opens console, unless typing in an input field or editable el
      capture = true;
      model.enterMode('console');
    }

    if (capture) {
      e.preventDefault();
    }
  }

  // tab-completion for field names
  function tabComplete() {
    var line = readCommandLine(),
        match = /\w+$/.exec(line),
        stub = match ? match[0] : '',
        lyr = model.getEditingLayer().layer,
        names, name;
    if (stub && lyr.data) {
      names = findCompletions(stub, lyr.data.getFields());
      if (names.length > 0) {
        name = MapShaper.getCommonFileBase(names);
        if (name.length > stub.length) {
          input.node().value = line.substring(0, match.index) + name;
        }
      }
    }
  }

  function findCompletions(str, fields) {
    return fields.filter(function(name) {
      return name.indexOf(str) === 0;
    });
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

  function getCommandFlags(commands) {
    return commands.reduce(function(memo, cmd) {
      memo[cmd.name] = true;
      return memo;
    }, {});
  }

  function submit() {
    var cmd = readCommandLine();
    input.node().value = '';
    toLog(CURSOR + cmd);
    if (cmd) {
      if (cmd == 'clear') {
        clear();
      } else if (cmd == 'tips') {
        printExamples();
      } else if (cmd == 'layers') {
        message("Available layers:",
          MapShaper.getFormattedLayerList(model.getEditingLayer().dataset.layers));
      } else if (cmd == 'close' || cmd == 'exit' || cmd == 'quit') {
        model.clearMode();
      } else if (/^theme\b/.test(cmd)) {
        setTheme(cmd.split(/\s+/)[1]);
      } else if (cmd) {
        runMapshaperCommands(cmd);
      }
      toHistory(cmd);
    }
  }

  function setTheme(t) {
    var name = 'theme' + parseInt(t);
    El('body').attr('className', name);
    localStorage.setItem('theme', name);
  }

  function runMapshaperCommands(str) {
    var commands, target, dataset, lyr, lyrId, arcCount;
    try {
      commands = MapShaper.parseConsoleCommands(str);
      commands = MapShaper.runAndRemoveInfoCommands(commands);
      target = model.getEditingLayer();
      dataset = target.dataset;
      lyr = target.layer;
      lyrId = dataset.layers.indexOf(lyr);
      arcCount = dataset.arcs ? dataset.arcs.size() : 0;
      // Use currently edited layer as default command target
      if (lyr) {
        commands.forEach(function(cmd) {
          // rename-layers should default to all layers;
          // other commands can target the current layer
          if (!cmd.options.target && cmd.name != 'rename-layers' &&
              cmd.name != 'merge-layers') {
            cmd.options.target = String(lyrId);
          }
        });
      }
    } catch (e) {
      return onError(e);
    }
    if (commands.length > 0) {
      MapShaper.runParsedCommands(commands, dataset, function(err) {
        var flags = getCommandFlags(commands),
            targetLyr;
        if (dataset) {
          targetLyr = getOutputLayer(lyrId, dataset, commands);
          if (dataset.arcs && dataset.arcs.size() != arcCount) {
            // kludge to signal map that filtered arcs need refreshing
            flags.arc_count = true;
          }
          model.updated(flags, targetLyr, dataset);
        }
        if (err) onError(err);
      });
    }
  }

  // try to get the output layer from the last console command
  // (if multiple layers are output, pick one of the output layers)
  // @lyrId  index of the currently edited layer
  function getOutputLayer(lyrId, dataset, commands) {
    var lastCmd = commands[commands.length-1],
        layers = dataset.layers,
        lyr;
    if (lastCmd.options.no_replace) {
      // pick last layer if a new layer has been created
      // (new layers should be appended to the list of layers -- need to test)
      lyr = layers[layers.length-1];
    } else {
      // use the layer in the same position as the currently selected layer;
      // this may not be the output layer if a different layer was explicitly
      // targeted.
      lyr = layers[lyrId] || layers[0];
    }
    return lyr;
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

  function consoleVerbose() {
    if (MapShaper.VERBOSE) {
      consoleMessage.apply(null, utils.toArray(arguments));
    }
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
    printExample("Extract one state from a national dataset","$ filter 'STATE == \"Iowa\"'");
    printExample("Aggregate counties to states by dissolving shared edges" ,"$ dissolve 'STATE'");
    printExample("See information about the active data layer", "$ info");
    printExample("Get help for mapshaper commands", "$ help");
    printExample("Clear the console", "$ clear");
  }
}
