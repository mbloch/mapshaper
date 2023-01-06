import { El } from './gui-el';
import { internal } from './gui-core';

var idb = require('idb-keyval');
// https://github.com/jakearchibald/idb
// https://github.com/jakearchibald/idb-keyval


export function SessionSnapshots(gui) {
  if (!gui.options.saveControl) return;
  var _menuOpen = false;
  var _menuTimeout;
  var btn = gui.buttons.addButton('#ribbon-icon').addClass('menu-btn');
  var menu = El('div').addClass('nav-sub-menu').appendTo(btn.node());


  var entries = [{
    slug: 'save',
    label: 'save',
    action: saveSnapshot
  }, {
    slug: 'restore',
    label: 'restore',
    action: restoreSnapshot
  }];

  btn.on('click', function(e) {
    // captureSnapshot(gui);
    openMenu();
    e.stopPropagation();
  });

  function renderMenu() {
    menu.empty();
    entries.forEach(function(item) {

      var link = El('div').addClass('nav-menu-item').attr('data-name', item.slug).text(item.label).appendTo(menu);
      link.on('click', async function(e) {
        await item.action();
        closeMenu(120); // only close if turning off
        e.stopPropagation();
      });
    });
  }

  function openMenu() {
    // clearTimeout(_menuTimeout);
    if (!_menuOpen) {
      btn.addClass('open');
      _menuOpen = true;
      renderMenu();
      // updateArrowButton();
    }
  }

  function closeMenu(delay) {
    if (!_menuOpen) return;
    clearTimeout(_menuTimeout);
    _menuTimeout = setTimeout(function() {
      _menuOpen = false;
      btn.removeClass('open');
    }, delay || 0);
  }

}

async function restoreSnapshot(gui) {
  var buf = await idb.get('snapshot');
  var data = internal.unpackSession(buf);
  buf = null;
  gui.model.clear();
  importDatasets(data.datasets, gui);
  gui.clearMode();
}

// Add datasets to the current project
// TODO: figure out if interface data should be imported (e.g. should
//   visibility flag of imported layers be imported)
export function importSessionData(buf, gui) {
  var data = internal.unpackSession(buf);
  importDatasets(data.datasets, gui);
}

function importDatasets(datasets, gui) {
  gui.model.addDatasets(datasets);
  var target = findTargetLayer(datasets);
  gui.model.setDefaultTarget(target.layers, target.dataset);
  gui.model.updated({select: true});
}

async function captureSnapshot(gui) {
  var datasets = gui.model.getDatasets();
  var lyr = gui.model.getActiveLayer().layer;
  lyr.active = true;
  var obj = internal.exportDatasetsToPack(datasets);
  delete lyr.active;
  obj.gui = getGuiState(gui);
  return internal.pack(obj);
}

async function saveSnapshot(gui) {
  var buf = await captureSnapshot(gui);
  await idb.set('snapshot', buf);
}

function findTargetLayer(datasets) {
  var target;
  datasets.forEach(function(dataset) {
    var lyr = dataset.layers.find(function(lyr) { return !!lyr.active; });
    if (lyr) target = {dataset: dataset, layers: [lyr]};
  });
  if (!target) {
    target = {dataset: datasets[0], layers: [datasets[0].layers[0]]};
  }
  return target;
}

function getGuiState(gui) {
  return null;
}
