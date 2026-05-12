import { setLoggingForGUI } from './gui-proxy';
import { internal, utils, message, UserError } from './gui-core';
import { El } from './gui-el';
import { setDisplayProjection } from './gui-dynamic-crs';
import { GUI } from './gui-lib';
import { saveBlobToLocalFile2 } from './gui-save';
import { stringifyRuntimeStateContext } from './gui-runtime-context';
import {
  appUndoIsEnabled,
  getStoredUndoHistory,
  getUndoQueryValue
} from './gui-app-undo';

export function Console(gui) {
  var model = gui.model;
  var CURSOR = '$ ';
  var PROMPT = 'Enter mapshaper commands or type "tips" for console help.';
  var el = gui.container.findChild('.console').hide();
  var content = el.findChild('.console-buffer');
  var log = El('div').appendTo(content);
  var line = El('div').addClass('command-line').appendTo(content);
  var cursor = El('span').appendTo(line).text(CURSOR);
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
  var btn = gui.container.findChild('.console-btn')
    .on('click', toggle)
    .on('keydown', function(e) {
      if (e.key == 'Enter' || e.key == ' ') {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    });
  var globals = {}; // share user-defined globals (job.defs) between runs
  var sharedVars = {}; // share -vars / -defaults templating scope between runs

  // expose this function, so other components can run commands (e.g. box tool)
  this.runMapshaperCommands = runMapshaperCommands;

  // Open the console (if closed) and run a command, as if the user had
  // typed it. Used by UI controls that surface console functionality, e.g.
  // the "view command history" link in the snapshot menu.
  this.runCommand = function(str) {
    str = str.trim();
    if (!str) return;
    gui.setSidebarPanel('console');
    submit(str);
  };

  this.runInitialCommands = this.runCommand;

  consoleMessage(PROMPT);
  gui.keyboard.on('keydown', onKeyDown);
  window.addEventListener('beforeunload', saveHistory); // save history if console is open on refresh

  GUI.onClick(el, function(e) {
    var targ = El(e.target);
    if (targ.hasClass('console-window') || targ.hasClass('command-line')) {
      input.node().focus(); // focus if user clicks blank part of console
    }
  });

  function toggle() {
    gui.toggleSidebarPanel('console');
  }

  gui.on('sidebar', function(e) {
    if (e.name == 'console') {
      turnOn();
    } else if (e.prev == 'console') {
      turnOff();
    }
  });

  function getHistory() {
    return GUI.getSavedValue('console_history') || [];
  }

  function saveHistory() {
    history = history.filter(Boolean); // TODO: fix condition that leaves a blank line on the history
    if (history.length > 0) {
      GUI.setSavedValue('console_history', history.slice(-100));
    }
  }

  function toLog(str, cname) {
    var msg = El('div').text(str).appendTo(log);
    if (cname) {
      msg.addClass(cname);
    }
    scrollDown();
  }

  function toLogNode(node, cname) {
    var msg = El('div').appendTo(log);
    if (cname) {
      msg.addClass(cname);
    }
    msg.node().appendChild(node);
    scrollDown();
  }

  function getStructuredConsoleMessage(args) {
    var arr = utils.toArray(args);
    var msg;
    // print() sends its arguments as one array argument.
    if (arr.length == 1 && Array.isArray(arr[0])) {
      arr = arr[0];
    }
    msg = arr[arr.length - 1];
    return msg && msg.type && /^mapshaper-console-/.test(msg.type) ? msg : null;
  }

  function turnOn() {
    // if (!_isOpen && !model.isEmpty()) {
    if (!_isOpen) {
      btn.addClass('active').attr('aria-expanded', 'true');
      _isOpen = true;
      // Route logging output to the in-app console while it's open, so a
      // user typing CLI commands here sees the results inline -- the same
      // way a CLI user sees output in their terminal. warn() goes to a
      // distinct consoleWarn() rather than to the Messages inbox: warnings
      // emitted by command pipelines should land where the user typed,
      // not in a separate UI surface they might not notice.
      // TODO: find a solution for logging problem when switching between multiple
      // gui instances with the console open. E.g. console could close
      // when an instance loses focus.
      internal.setLoggingFunctions(consoleMessage, consoleError, consoleStop, consoleWarn);
      el.show();
      input.node().focus();
      history = getHistory();
    }
  }

  function turnOff() {
    if (_isOpen) {
      btn.removeClass('active').attr('aria-expanded', 'false');
      _isOpen = false;
      if (GUI.isActiveInstance(gui)) {
        setLoggingForGUI(gui); // reset stop, message and error functions
      }
      el.hide();
      input.node().blur();
      saveHistory();
    }
  }

  function onPaste(e) {
    // paste plain text (remove any copied HTML tags)
    e.preventDefault();
    e.stopPropagation(); // don't try to import pasted text as data (see gui-import-control.js)
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

  function isTextInput(el) {
    return el && el.type != 'radio' && el.type != 'checkbox';
  }

  function onKeyDown(evt) {
    var e = evt.originalEvent,
        kc = e.keyCode,
        inputEl = GUI.getInputElement(),
        typing = isTextInput(inputEl),
        typingInConsole = inputEl && inputEl == input.node(),
        inputText = readCommandLine(),
        capture = false;

    // esc key
    if (kc == 27) {
      if (typing) {
        inputEl.blur();
      }
      if (gui.getMode()) {
        gui.clearMode(); // esc closes any open panels
      } else {
        gui.setSidebarPanel(null);
      }
      capture = true;

    // l/r arrow keys while not typing in a text field
    } else if ((kc == 37 || kc == 39) && (!typing || typingInConsole && !inputText)) {
      if (kc == 37) {
        model.selectPrevLayer();
      } else {
        model.selectNextLayer();
      }

    // shift key -- don't do anything (need to interoperate with shift-drag box tools)
    } else if (kc == 16) {

    // delete key while not inputting text
    } else if (kc == 8 && !typing) {
      capture = true; // prevent delete from leaving page

    // any key while console is open and not typing in a non-console field
    // TODO: prevent console from blocking <enter> for menus
    } else if (_isOpen && (typingInConsole || !typing)) {
      capture = true;
      // clearMode() causes some of the arrow-button modes to be cancelled,
      // which is irksome...
      // // gui.clearMode(); // close any panels that  might be open
      //
      if (kc == 13) { // enter
        onEnter();
      } else if (kc == 9) { // tab
        tabComplete();
      } else if (kc == 38) {
        back();
      } else if (kc == 40) {
        forward();
      } else if (kc == 32 && (!typing || (inputText === '' && typingInConsole))) {
        // space bar toggles the sidebar if nothing has been typed
        gui.toggleSidebar();
      } else if (!typing && e.target != input.node() && !metaKey(e)) {
        // typing returns focus, unless a meta key is down (to allow Cmd-C copy)
        // or user is typing in a different input area somewhere
        input.node().focus();
        capture = false;
      } else if (/\n\n$/.test(inputText) && e.key && e.key.length == 1) {
        // Convert double newline to single on first typing after \ continuation
        // (for compatibility with Firefox; see onEnter() function)
        // Assumes that cursor is at end of text (TODO: remove this assumption)
        toCommandLine(inputText.substr(0, inputText.length - 1) + e.key);
      } else {
        capture = false; // normal typing
      }

    // various shortcuts (while not typing in an input field or editable el)
    } else if (!typing) {
       if (kc == 32) { // space bar toggles the sidebar
        capture = true;
        gui.toggleSidebar();
      // } else if (kc == 73) { // letter i opens inspector
      //   gui.dispatchEvent('interaction_toggle');
      } else if (kc == 72) { // letter h resets map extent
        gui.dispatchEvent('map_reset');
      } else if (kc == 13) {
        gui.dispatchEvent('enter_key', evt); // signal for default buttons on any open menus
      }
    }

    if (capture) {
      e.preventDefault();
    }
  }

  function tabComplete() {
    var line = readCommandLine(),
        match = /\w+$/.exec(line),
        stub = match ? match[0] : '',
        names, name;
    if (!stub) return;
    names = getCompletionWords();
    names = names.filter(function(name) {
      return name.indexOf(stub) === 0;
    });
    if (names.length > 0) {
      name = internal.getCommonFileBase(names);
      if (name.length > stub.length) {
        toCommandLine(line.substring(0, match.index) + name);
      }
    }
  }

  // get active layer field names and other layer names
  function getCompletionWords() {
    var lyr = model.getActiveLayer().layer;
    var fieldNames = lyr.data ? lyr.data.getFields() : [];
    var lyrNames = findOtherLayerNames(lyr);
    return fieldNames.concat(lyrNames).concat(fieldNames);
  }

  function findOtherLayerNames(lyr) {
    return model.getLayers().reduce(function(memo, o) {
      var name = o.layer.name;
      if (name && name != lyr.name) {
        memo.push(name);
      }
      return memo;
    }, []);
  }

  function readCommandLine() {
    // return input.node().textContent.trim();
    return input.node().textContent;
  }

  function toCommandLine(str) {
    input.node().textContent = str;
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

  function onEnter() {
    var str = readCommandLine();
    var wrap = /\\\n?$/.test(str); // \n? is to workaround odd Chrome behavior (newline appears after eol backslash)
    if (wrap) {
      toCommandLine(str.trim() + '\n\n'); // two newlines needed in all tested browsers
    } else {
      submit(str);
    }
  }

  // display char codes in string (for debugging console input)
  function strCodes(str) {
    return str.split('').map(function(c) {return c.charCodeAt(0);}).join(',');
  }

  function submit(str) {
    // remove newlines
    // TODO: remove other whitespace at beginning + end of lines
    // var cmd = str.replace(/\\?\n/g, ' ').trim();
    var cmd = str.trim();
    toLog(CURSOR + str);
    toCommandLine('');
    if (cmd) {
      if (cmd == 'clear') {
        clear();
      } else if (cmd == 'tips') {
        printExamples();
      } else if (cmd == 'context') {
        toLog(stringifyRuntimeStateContext(gui));
      } else if (cmd == 'context download') {
        saveRuntimeContext();
      } else if (cmd == 'history') {
        toLog(gui.session.toCommandLineString());
      } else if (cmd == 'layers') {
        message("Available layers:",
          internal.getFormattedLayerList(model));
      } else if (cmd == 'close' || cmd == 'exit' || cmd == 'quit') {
        turnOff();
      } else if (/^projd/.test(cmd)) {
        // set the display CRS (for testing)
        setDisplayProjection(gui, cmd);
      } else {
        line.hide(); // hide cursor while command is being run
        // quit certain edit modes
        if (!gui.interaction.modeWorksWithConsole(gui.interaction.getMode())) {
          gui.interaction.turnOff();
        }
        runMapshaperCommands(cmd, function(err, flags) {
          if (flags) {
            gui.clearMode();
          }
          if (err) {
            onError(err);
          }
          line.show();
          input.node().focus();
        });
      }
      toHistory(str);
    }
  }

  function runMapshaperCommands(str, done) {
    var commands;
    try {
      commands = internal.parseConsoleCommands(str);
      // don't add info commands to console history
      // (for one thing, they interfere with target resetting)
      commands = internal.runAndRemoveInfoCommands(commands);
    } catch (e) {
      return done(e, {});
    }
    if (commands.length === 0) return done();
    applyParsedCommands(commands, str, function(err, flags) {
      if (flags) {
        model.updated(flags); // info commands do not return flags
      }
      done(err, flags);
    });
  }

  function applyParsedCommands(commands, commandString, done) {
    var active = model.getActiveLayer(),
        prevArcs = active?.dataset.arcs,
        prevTable = active?.layer.data,
        prevTableSize = prevTable ? prevTable.size() : 0,
        prevArcCount = prevArcs ? prevArcs.size() : 0,
        undoTransaction = createCommandUndoTransaction(commandString),
        job = new internal.Job(model),
        commandStart = Date.now();

    job.defs = globals; // share globals between runs
    job.vars = sharedVars; // share templating scope between runs
    if (undoTransaction) {
      setActiveUndoTransaction(undoTransaction);
    }
    try {
      internal.runParsedCommands(commands, job, onCommandsDone);
    } catch(e) {
      if (undoTransaction) {
        clearActiveUndoTransaction(undoTransaction);
      }
      throw e;
    }

    function onCommandsDone(err) {
      var flags = getCommandFlags(commands),
          historyIds = [],
          active2 = model.getActiveLayer(),
          postArcs = active2?.dataset.arcs,
          postArcCount = postArcs ? postArcs.size() : 0,
          postTable = active2?.layer.data,
          postTableSize = postTable ? postTable.size() : 0,
          sameTable = prevTable == postTable && prevTableSize == postTableSize,
          sameArcs = prevArcs == postArcs && postArcCount == prevArcCount;

      if (undoTransaction) {
        clearActiveUndoTransaction(undoTransaction);
      }
      // kludge to signal map that filtered arcs need refreshing
      // TODO: find a better solution, outside the console
      if (!sameArcs) {
        flags.arc_count = true;
      }
      if (sameTable) {
        flags.same_table = true;
      }
      if (active && active?.layer == active2?.layer) {
        // this can get set after some commands that don't set a new target
        // (e.g. -dissolve)
        flags.select = true;
      }
      // signal the map to update even if an error has occured, because the
      // commands may have partially succeeded and changes may have occured to
      // the data.
      if (!err) {
        commandString = internal.standardizeConsoleCommands(commandString);
        historyIds.push(gui.session.consoleCommands(commandString));
        // kludge to terminate unclosed -if blocks
        if (commandString.includes('-if') && !commandString.includes('-endif')) {
          historyIds.push(gui.session.consoleCommands('-endif'));
        }
      }
      addCommandUndoHistory(undoTransaction, err, flags, historyIds).then(function(undoTiming) {
        logCommandTiming(commandString, commands, err, Date.now() - commandStart, undoTiming);
        done(err, flags);
      }).catch(function(e) {
        console.error(e);
        consoleWarn('Undo state was not saved:', e.message || e);
        logCommandTiming(commandString, commands, err || e, Date.now() - commandStart, {
          error: e.message || String(e)
        });
        done(err, flags);
      });
    }
  }

  function createCommandUndoTransaction(commandString) {
    var Transaction;
    if (!isCommandUndoEnabled()) return null;
    getStoredUndoHistory(gui).getPayloadStore();
    Transaction = internal.UndoTransaction.UndoTransaction || internal.UndoTransaction;
    return new Transaction(commandString);
  }

  function setActiveUndoTransaction(tx) {
    var tracking = internal.UndoTracking;
    if (tracking && tracking.setActiveUndoTransaction) {
      tracking.setActiveUndoTransaction(tx);
    } else {
      internal.setActiveUndoTransaction(tx);
    }
  }

  function clearActiveUndoTransaction(tx) {
    var tracking = internal.UndoTracking;
    if (tracking && tracking.clearActiveUndoTransaction) {
      tracking.clearActiveUndoTransaction(tx);
    } else {
      internal.clearActiveUndoTransaction(tx);
    }
  }

  async function addCommandUndoHistory(tx, err, flags, historyIds) {
    return getStoredUndoHistory(gui).addTransaction(tx, {
      error: err,
      flags: flags,
      entryPrefix: 'command',
      maxStates: getCommandUndoHistoryLimit(),
      onUndo: function() {
        gui.session.setCommandsActive(historyIds, false);
      },
      onRedo: function() {
        gui.session.setCommandsActive(historyIds, true);
      }
    });
  }

  function isCommandUndoEnabled() {
    if (!gui.undo || typeof gui.undo.addHistoryState != 'function') return false;
    return appUndoIsEnabled(gui);
  }

  function getCommandUndoHistoryLimit() {
    var opt = gui.options && gui.options.undoHistoryLimit;
    return opt > 0 ? opt : 10;
  }

  function logCommandTiming(commandString, commands, err, totalMillis, undoTiming) {
    var enabled = getQueryFlag('command-timing') == 'on' ||
      getQueryFlag('undo-timing') == 'on';
    var undoMillis = undoTiming && undoTiming.undoMillis || 0;
    if (!enabled || typeof console == 'undefined' || !console.log) return;
    console.log('[mapshaper command timing]', {
      command: commandString,
      commandNames: commands.map(function(cmd) { return cmd.name; }),
      failed: !!err,
      commandMillis: totalMillis - undoMillis,
      undoMillis: undoMillis,
      redoCaptureMillis: undoTiming && undoTiming.redoCaptureMillis || 0,
      storeMillis: undoTiming && undoTiming.storeMillis || 0,
      totalMillis: totalMillis,
      undo: undoTiming || null
    });
  }

  function getQueryFlag(key) {
    var rxp, match;
    if (typeof window == 'undefined' || !window.location) return null;
    rxp = new RegExp('[?&]' + key + '=([^&]+)');
    match = rxp.exec(window.location.search);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function onError(err) {
    if (utils.isString(err)) {
      consoleStop(err);
    } else if (err.name == 'UserError' ) {
      // stop() has already been called, don't need to log
      console.error(err.stack);
    } else if (err.name) {
      console.error(err.stack);
      // log to console window
      consoleWarning(err.message);
    }
  }

  function consoleStop() {
    var msg = GUI.formatMessageArgs(arguments);
    consoleWarning(msg);
    throw new UserError(msg);
  }

  function consoleWarning() {
    var msg = GUI.formatMessageArgs(arguments);
    toLog(msg, 'console-error');
  }

  // Routed from internal.warn() while the console is open. Distinct from
  // consoleWarning() (which is used for hard-stop errors) so the styling
  // can differ -- warnings shouldn't read as red "something went wrong",
  // they're just heads-ups about how the input was interpreted.
  function consoleWarn() {
    var msg = GUI.formatMessageArgs(arguments);
    toLog(msg, 'console-warn');
  }

  function consoleMessage() {
    var structured = getStructuredConsoleMessage(arguments);
    var msg;
    if (internal.loggingEnabled()) {
      if (structured) {
        toLogNode(renderStructuredConsoleMessage(structured), 'console-message');
      } else {
        msg = GUI.formatMessageArgs(arguments);
        toLog(msg, 'console-message');
      }
    }
  }

  function consoleError() {
    var msg = GUI.formatMessageArgs(arguments);
    throw new Error(msg);
  }

  function printExample(comment, command) {
    toLog(comment, 'console-message');
    toLog(command, 'console-example');
  }

  function printExamples() {
    printExample("See a list of all console commands", "$ help");
    printExample("Get help using a single command", "$ help innerlines");
    printExample("Get information about imported datasets", "$ info");
    printExample("Print bot/debug runtime context as JSON", "$ context");
    printExample("Display browser session as shell commands", "$ history");
    printExample("Delete one state from a national dataset","$ filter 'STATE != \"Alaska\"'");
    printExample("Aggregate counties to states by dissolving shared edges" ,"$ dissolve 'STATE'");
    printExample("Clear the console", "$ clear");
  }

  function renderStructuredConsoleMessage(msg) {
    if (msg.type == 'mapshaper-console-help') {
      return renderHelpMessage(msg.lines);
    }
    if (msg.type == 'mapshaper-console-info') {
      return renderInfoMessage(msg.layers);
    }
    return document.createTextNode('');
  }

  function renderHelpMessage(lines) {
    var container = document.createElement('div');
    var rows = [];
    container.className = 'console-help';
    (lines || []).forEach(function(line) {
      if (Array.isArray(line)) {
        rows.push(line);
      } else {
        flushRows();
        appendHelpLine(container, line);
      }
    });
    flushRows();
    return container;

    function flushRows() {
      if (rows.length > 0) {
        container.appendChild(renderKeyValueTable(rows, 'console-help-table'));
        rows = [];
      }
    }
  }

  function appendHelpLine(container, line) {
    var div = document.createElement('div');
    div.className = line ? 'console-help-line' : 'console-help-spacer';
    div.textContent = line || '';
    container.appendChild(div);
  }

  function renderInfoMessage(layers) {
    var container = document.createElement('div');
    container.className = 'console-info';
    (layers || []).forEach(function(info) {
      var section = document.createElement('div');
      var title = document.createElement('div');
      section.className = 'console-info-layer';
      title.className = 'console-info-title';
      title.textContent = 'Layer: ' + (info.layer_name || '[unnamed layer]');
      section.appendChild(title);
      section.appendChild(renderKeyValueTable(getInfoRows(info), 'console-info-table'));
      if (!info.raster_type) {
        section.appendChild(renderAttributeInfoTable(info.attribute_data));
      }
      container.appendChild(section);
    });
    return container;
  }

  function getInfoRows(info) {
    var rows = [
      ['Type', info.raster_type ? 'raster data' : info.geometry_type || 'tabular data']
    ];
    if (info.raster_type) {
      rows.push(['Size', utils.format('%,d x %,d x %,d', info.raster_width, info.raster_height, info.raster_bands)]);
      rows.push(['Data', info.raster_pixel_type || 'unknown']);
    } else {
      rows.push(['Records', utils.format('%,d', info.feature_count)]);
    }
    if (info.null_shape_count > 0) {
      rows.push(['Nulls', utils.format("%'d", info.null_shape_count)]);
    }
    if (info.raster_type || info.geometry_type && info.feature_count > info.null_shape_count) {
      rows.push(['Bounds', info.bbox.join(',')]);
      rows.push(['CRS', info.proj4]);
    }
    rows.push(['Source', info.source_file || 'n/a']);
    return rows;
  }

  function renderAttributeInfoTable(fields) {
    var wrapper = document.createElement('div');
    var title = document.createElement('div');
    wrapper.className = 'console-attribute-info';
    title.className = 'console-info-subtitle';
    title.textContent = 'Attribute data';
    wrapper.appendChild(title);
    if (!fields) {
      var none = document.createElement('div');
      none.className = 'console-info-empty';
      none.textContent = '[none]';
      wrapper.appendChild(none);
      return wrapper;
    }
    wrapper.appendChild(renderDataTable(
      [['Field', 'First value']].concat(fields.map(function(o) {
        var valKey = 'first_value' in o ? 'first_value' : 'value';
        return [o.field, formatInfoValue(o[valKey])];
      })),
      'console-attribute-table'
    ));
    return wrapper;
  }

  function renderKeyValueTable(rows, className) {
    return renderDataTable(rows, className + ' console-key-value-table');
  }

  function renderDataTable(rows, className) {
    var table = document.createElement('table');
    var tbody = document.createElement('tbody');
    table.className = className;
    rows.forEach(function(row, i) {
      var tr = document.createElement('tr');
      row.forEach(function(val) {
        var cell = document.createElement(i === 0 && rows.length > 1 && className == 'console-attribute-table' ? 'th' : 'td');
        cell.textContent = val == null ? '' : String(val);
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function formatInfoValue(val) {
    if (val === null || val === undefined) return '';
    if (utils.isString(val)) {
      return "'" + val.replace(/[\r\t\n]/g, function(c) {
        return c == '\n' ? '\\n' : c == '\r' ? '\\r' : '\\t';
      }) + "'";
    }
    if (utils.isNumber(val) || val === true || val === false) {
      return String(val);
    }
    return JSON.stringify(val);
  }

  function saveRuntimeContext() {
    var json = stringifyRuntimeStateContext(gui);
    saveBlobToLocalFile2('mapshaper-runtime-context.json', new Blob([json], {type: 'application/json'}));
    toLog('Saved runtime context to mapshaper-runtime-context.json', 'console-message');
  }

}
