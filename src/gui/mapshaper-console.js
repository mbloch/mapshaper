/* @requires mapshaper-gui-lib mapshaper-commands */

function Console(parent, model) {
  var CURSOR = '$ ';
  var el = El('#console').hide();
  var buffer = El('#console-buffer');
  var history = El('div').id('console-history').appendTo(buffer);
  var line = El('div').id('command-line').appendTo(buffer);
  var prompt = El('div').text(CURSOR).appendTo(line);
  var input = El('input').appendTo(line).attr('spellcheck', false).attr('autocorrect', false);
  var _active = false;
  var _stop = stop; // save default stop() function

  message = consoleMessage; // capture all messages to this console
  input.on('input', onInput);
  input.on('keydown', onDown);
  input.on('blur', turnOff);
  monitor();

  toHistory('Type mapshaper commands at the prompt');

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
    down();
  }

  function monitor() {
    document.addEventListener('keydown', onSpacebar);
  }

  function unmonitor() {
    document.removeEventListener('keydown', onSpacebar);
  }

  function onSpacebar(e) {
    if (e.keyCode == 32) {
      e.stopPropagation();
      e.preventDefault();
      turnOn();
    }
  }

  function consoleStop() {
    var msg = gui.formatMessageArgs(arguments);
    toHistory(msg, 'console-error');
  }

  function consoleMessage() {
    var msg = gui.formatMessageArgs(arguments);
    toHistory(msg, 'console-message');
  }

  // TODO: capture stop
  function turnOn() {
    if (!_active) {
      _active = true;
      stop = consoleStop();
      // reset(); // allow showing/hiding to look at map w/o erasing cmd line
      el.show();
      input.node().focus();
      document.addEventListener('mousedown', block);
      unmonitor();
    }
  }

  function turnOff() {
    if (_active) {
      _active = false;
      stop = _stop; // restore original stop() function
      document.removeEventListener('mousedown', block);
      el.hide();
      monitor();
    }
  }

  function down() {
    var el = buffer.parent().node();
    el.scrollTop = el.scrollHeight;
  }


  function reset() {
    input.node().value = '';
    onInput();
  }

  function block(e) {
    if (e.target != input.node()) {
      e.preventDefault();
    }
  }

  function onDown(e) {
    // console.log(e);
    var kc = e.keyCode;
    if (kc == 13) { // enter
      submit();
    } else if (kc == 27) { // escape
      turnOff();
      e.preventDefault();
    }
  }

  function readCommandLine() {
    return input.node().value;
  }

  function onInput() {
    // var str = CURSOR + readCommandLine();
  }

  function submit() {
    var cmd = readCommandLine();
    toHistory(CURSOR + cmd);
    reset();
    run(cmd);
    // TODO:
    // add to history
    // run command
  }

  function err(e) {
    toHistory(e.stack, 'console-error');
  }

  function filterCommands(arr) {
    var names = 'o,i'.split(','),
        found = [],
        filtered = arr.filter(function(cmd) {
          return !utils.contains(names, cmd.name);
        });
    if (found.length > 0) {
      message("These commands can not be run in the browser:", names.join(', '));
    }
    return filtered;
  }

  function parseCommands(str) {
    var commands;
    try {
      commands = MapShaper.parseCommands(str);
      commands = filterCommands(commands);
      // TODO:
      // get dataset and target layer
      // apply commands
      // refresh map
    } catch(e) {
      return error(e);
    }
  }

  function run(str) {
    var commands = parseCommands(str);


  }

}