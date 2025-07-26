import { SimpleButton } from './gui-elements';
import { GUI } from './gui-lib';

export function DisplayOptions(gui) {
  var menuBtn = gui.container.findChild('.display-btn');
  var menu = gui.container.findChild('.display-options');
  var closeBtn = new SimpleButton(menu.findChild('.close2-btn'));
  var xxBox = menu.findChild('.intersections-opt');
  var ghostBox = menu.findChild('.ghost-opt');

  var savedOpts = GUI.getSavedValue('display_options') || {};
  xxBox.node().checked = savedOpts.intersectionsOn;
  ghostBox.node().checked = savedOpts.ghostingOn;


  gui.addMode('display_options', turnOn, turnOff, menuBtn);

  closeBtn.on('click', function() {
    gui.clearMode();
    turnOff();
  });

  gui.on('display_option_change', function() {
    GUI.setSavedValue('display_options', getOptions());
  });

  xxBox.on('change', function() {
    gui.dispatchEvent('display_option_change', {
      option: 'intersectionsOn',
      value: getOptions().intersectionsOn
    });
  });

  ghostBox.on('change', function() {
    gui.dispatchEvent('display_option_change', {
      option: 'ghostingOn',
      value: getOptions().ghostingOn
    });
    gui.dispatchEvent('map-needs-refresh');
  });

  function getOptions() {
    return {
      intersectionsOn: xxBox.node().checked,
      ghostingOn: ghostBox.node().checked
    };
  }

  function turnOn() {
    menu.show();
  }

  function turnOff() {
    menu.hide();
  }

  return {
    getOptions
  };
}
