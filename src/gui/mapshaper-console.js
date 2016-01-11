/* @requires mapshaper-gui-lib mapshaper-commands mapshaper-mode-button */

function Console(model) {
  var CURSOR = '$ ';
  var PROMPT = 'Enter mapshaper commands or type "tips" for examples and console help';
  var el = El('#console').hide();
  var content = El('#console-buffer');
  var log = El('div').id('console-log').appendTo(content);
  var line = El('div').id('command-line').appendTo(content).text(CURSOR);
  var input = El('span').appendTo(line)
    .addClass('input-field')
    .attr('spellcheck', false)
    .attr('autocorrect', false)
    .attr('contentEditable', true)
    .on('focus', receiveFocus)
    .on('paste', onPaste);
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

  gui.onClick(content, function(e) {
    var targ = El(e.target);
    if (gui.getInputElement() || targ.hasClass('console-message')) {
      // don't focus if user is typing or user clicks content area
    } else {
      input.node().focus();
    }
  });

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

  function onPaste(e) {
    // paste plain text (remove any copied HTML tags)
    e.preventDefault();
    var str = (e.originalEvent || e).clipboardData.getData('text/plain');
    document.execCommand("insertHTML", false, str);
  }

  function receiveFocus() {
    placeCursor();
  }

  function placeCursor() {
    var el = input.node();
    var range, selection;
    if (readCommandLine().length > 0) {
      // move cursor to end of text
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); //collapse the range to the end point.
      selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
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

    // l/r arrow keys while not typing in a text field
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
      } else if (kc == 32 && (!typing || (inputText === '' && typingInConsole))) {
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
          toCommandLine(line.substring(0, match.index) + name);
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
    return input.node().textContent.trim();
  }

  function toCommandLine(str) {
    input.node().textContent = str.trim();
    placeCursor();
  }

  function peekHistory(i) {
    var idx = history.length - 1 - (i || 0);
    return idx >= 0 ? history[idx] : null;
  }

  function toHistory(str) {
    if (historyId > 0) { // if we're back in the history stack
      if (peekHistory() === '') {
        // remove empty string (which may have been appended when user started going back)
        history.pop();
      }
      historyId = 0; // move back to the top of the stack
    }
    if (str && str != peekHistory()) {
      history.push(str);
    }
  }

  function fromHistory() {
    toCommandLine(peekHistory(historyId));
  }

  function back() {
    if (history.length === 0) return;
    if (historyId === 0) {
      history.push(readCommandLine());
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
    toCommandLine('');
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
      } else if (cmd) {
        runMapshaperCommands(cmd);
      }
      toHistory(cmd);
    }
  }

  function runMapshaperCommands(str) {
    var commands, target;
    try {
      commands = MapShaper.parseConsoleCommands(str);
      commands = MapShaper.runAndRemoveInfoCommands(commands);
      target = model.getEditingLayer();
    } catch (e) {
      return onError(e);
    }
    if (target.layer && commands.length > 0) {
      applyParsedCommands(commands, target.layer, target.dataset);
    }
  }

  function applyParsedCommands(commands, lyr, dataset) {
    var lyrId = dataset.layers.indexOf(lyr),
        prevArcCount = dataset.arcs ? dataset.arcs.size() : 0;

    // most commands should target the currently edited layer unless
    // user has specified a different target
    commands.forEach(function(cmd) {
      if (!cmd.options.target && cmd.name != 'rename-layers' &&
          cmd.name != 'merge-layers') {
        cmd.options.target = String(lyrId);
      }
    });

    MapShaper.runParsedCommands(commands, dataset, function(err) {
      var flags = getCommandFlags(commands),
          outputLyr = getOutputLayer(lyrId, dataset, commands);
      if (prevArcCount > 0 && dataset.arcs.size() != prevArcCount) {
        // kludge to signal map that filtered arcs need refreshing
        flags.arc_count = true;
      }
      model.updated(flags, outputLyr, dataset);
      // signal the map to update even if an error has occured, because the
      // commands may have partially succeeded and changes may have occured to
      // the data.
      if (err) onError(err);
    });
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
