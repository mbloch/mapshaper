
function SelectionTool(gui, hit) {
  var popup = gui.container.findChild('.selection-tool-options');
  var _on = false;

  gui.addMode('selection_tool', turnOn, turnOff);

  function turnOn() {
    _on = true;
  }

  gui.on('interaction_mode_change', function(e) {
    if (e.mode === 'selection') turnOn(); else turnOff();
  });

  function turnOff() {
    popup.hide();
    hit.clearSelection();
    _on = false;
  }

  hit.on('change', function(e) {
    if (e.mode != 'selection') return;
    var ids = hit.getSelectionIds();
    if (ids.length > 0) {
      // enter this mode when we're ready to show the selection options
      // (this closes any other active mode, e.g. box_tool)
      gui.enterMode('selection_tool');
      popup.show();
    } else {
      popup.hide();
    }
  });

  new SimpleButton(popup.findChild('.delete-btn')).on('click', function() {
    var cmd = '-filter invert "' + getFilterExp(hit.getSelectionIds()) + '"';
    runCommand(cmd);
    hit.clearSelection();
  });

  new SimpleButton(popup.findChild('.filter-btn')).on('click', function() {
    var cmd = '-filter "' + getFilterExp(hit.getSelectionIds()) + '"';
    runCommand(cmd);
    hit.clearSelection();
  });

  new SimpleButton(popup.findChild('.split-btn')).on('click', function() {
    var cmd = '-each "split_id = ' + getFilterExp(hit.getSelectionIds()) +
      ' ? \'1\' : \'2\'" -split split_id';
    runCommand(cmd);
    hit.clearSelection();
  });

  new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
    hit.clearSelection();
  });

  function getFilterExp(ids) {
    return JSON.stringify(ids) + '.indexOf(this.id) > -1';
  }

  function runCommand(cmd) {
    if (gui.console) gui.console.runMapshaperCommands(cmd, function(err) {});
    gui.clearMode();
  }
}
