import { flattenArcs } from './gui-display-utils';

// This is a new way to handle compatibility problems between
// interactive editing modes and other interface modes
// (by default, interactive modes stay on when, e.g., the user clicks
// "Export" or "Console").
//
export function initModeRules(gui) {

  gui.on('interaction_mode_change', function(e) {
    var imode = e.mode;
    var mode = gui.getMode();

    // simplify and vertex editing are not compatible
    if (imode == 'vertices') {
      flattenArcs(gui.map.getActiveLayer());

      if (mode == 'simplify') {
        gui.clearMode(); // exit simplification
      }

    }

  });

  gui.on('mode', function(e) {
    var mode = e.name;
    var imode = gui.interaction.getMode();

    // simplify and vertex editing are not compatible
    if (mode == 'simplify' && imode == 'vertices') {
      gui.interaction.turnOff();
    }
  });
}
