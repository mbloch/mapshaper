import { SimpleButton } from './gui-elements';
import { GUI } from './gui-lib';
import { utils, internal, mapshaper } from './gui-core';

export function ProjectOptions(gui) {
  var model = gui.model;
  var menuBtn = gui.container.findChild('.project-btn').addClass('disabled');
  var menu = gui.container.findChild('.project-options');
  var closeBtn = new SimpleButton(menu.findChild('.close2-btn'));
  var applyBtn = menu.findChild('.apply-btn');
  var previewBtn = menu.findChild('.preview-btn');

  var params = [
    {
      id: 'lon_0',
      name: 'Longitude of origin'
    }, {
      id: 'lat_0',
      name: 'Latitude of origin'
    }, {
      id: 'p_0',
      name: 'Origin'
    }, {
      id: 'sp_1',
      name: '1st standard parallel'
    }, {
      id: 'sp_2',
      name: '2nd standard parallel'
    }, {
      id: 'h',
      name: 'Height above Earth'
    }
  ];

  var projections = [
    {
      id: 'ortho',
      name: 'Orthographic',
      params: ['p_0']
    }, {
      id: 'nsper',
      name: 'Earth from space',
      params: ['p_0', 'h']
    }, {
      id: 'lcc',
      name: 'Lambert Conformal Conic',
      params: ['lon_0', 'sp_1', 'sp_2']
    }, {
      id: 'aea',
      name: 'Albers Equal Area Conic',
      params: ['lon_0', 'sp_1', 'sp_2']
    }, {
      id: 'robin',
      name: 'Robinson',
      params: ['lon_0']
    }, {
      id: 'eqearth',
      name: 'Equal Earth',
      params: ['lon_0']
    }, {
      id: 'wintri',
      name: 'Winkel Tripel',
      params: ['lon_0']
    }, {
      id: 'moll',
      name: 'Mollweide',
      params: ['lon_0']
    }, {
      id: 'laea',
      name: 'Lambert Azimuthal Equal Area',
      params: ['p_0']
    }, {
      id: 'merc',
      name: 'Mercator',
      params: []
    }, {
      id: 'webmerc',
      name: 'Web Mercator',
      params: []
    }, {
      id: 'etmerc',
      name: 'Transverse Mercator',
      params: ['p_0']
    }
  ];

  gui.addMode('project_options', turnOn, turnOff, menuBtn);

  closeBtn.on('click', function() {
    turnOff();
  });

  applyBtn.on('click', function() {
    runSelectedProjCommand();
    // turnOff();
  });

  previewBtn.on('click', function() {

  });

  model.on('update', function(e) {
    updateMenuBtn();
    turnOff();
  });

  function runSelectedProjCommand() {
    var cmd = 'proj +proj=ortho +lon_0=90 +lat_0=45';
    runCommand(cmd);
  }

  function renderMenu() {
    initProjectionMenu();

  }

  function initProjectionMenu() {
    var list = menu.findChild('#proj-list');
    list.empty();

    // var formats = utils.uniq(getExportFormats().concat(getInputFormats()));
    var listHtml = projections.map(function(o) {
      return `<div><label><input type="radio" name="format" value="${o.id}"' +
        ' class="radio">${o.name}</label></div>`;
    }).join('\n');

    // menu.findChild('.export-formats').html(items.join('\n'));
    list.html(listHtml);
    // update save-as settings when value changes
    // list.findChildren('input[type="radio"]').forEach(el => {
    //   el.on('change', updateExportCheckboxes);
    // });
  }


  function runCommand(cmd) {
    if (gui.console) {
      gui.console.runMapshaperCommands(cmd, function(err) {
        // reset();
        turnOff();
      });
    }
    // reset(); // TODO: exit interactive mode
  }

  function activeLayerCanProject() {
    var active = model.getActiveLayer();
    if (!active) {
      return false;
    }
    if (!internal.layerHasGeometry(active.layer)) {
      return false;
    }
    var crs = internal.getDatasetCRS(active.dataset);
    if (!crs || internal.isProjectedCRS(crs) && !internal.isInvertibleCRS(crs)) {
      return false;
    }
    return true;
  }

  function turnOn() {
    renderMenu();
    menu.show();
  }

  function turnOff() {
    if (gui.getMode() == 'project_options') gui.clearMode();
    menu.hide();
  }

  function updateMenuBtn() {
    menuBtn.classed('disabled', !isEnabled());
  }

  function isEnabled() {
    return activeLayerCanProject() && !gui.basemap?.isOn();
  }
}
