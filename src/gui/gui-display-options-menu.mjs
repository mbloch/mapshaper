import { SimpleButton } from './gui-elements';
import { GUI } from './gui-lib';

export function DisplayOptions(gui) {
  var menuBtn = gui.container.findChild('.display-btn');
  var menu = gui.container.findChild('.display-options');
  var closeBtn = new SimpleButton(menu.findChild('.close2-btn'));
  var xxBox = menu.findChild('.intersections-opt');
  var compareBox = menu.findChild('.compare-opt');

  var savedOpts = GUI.getSavedValue('display_options') || {};
  xxBox.node().checked = savedOpts.intersectionsOn;
  compareBox.node().checked = savedOpts.compareOn;


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

  compareBox.on('change', function() {
    var on = getOptions().compareOn;
    gui.dispatchEvent('display_option_change', {
      option: 'compareOn',
      value: on
    });
    if (!on) {
      // tear down any live comparison overlay when the option is disabled
      gui.dispatchEvent('compare-clear');
    }
  });

  function getOptions() {
    return {
      intersectionsOn: xxBox.node().checked,
      compareOn: compareBox.node().checked
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
