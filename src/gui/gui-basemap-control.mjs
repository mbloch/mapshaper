import { internal, geom, error } from './gui-core';
import { SimpleButton } from './gui-elements';
import { El } from './gui-el';
import { fromWebMercator, scaleToZoom } from './gui-dynamic-crs';
import { setLoggingForGUI } from './gui-proxy';
import { getDatasetCrsInfo } from './gui-display-utils';
import { GUI } from './gui-lib';

var EMPTY_STYLE = {
    version: 8,
    sources: {},
    layers: []
  };

function loadScript(url, cb) {
  var script = document.createElement('script');
  script.onload = cb;
  script.src = url;
  document.head.appendChild(script);
}

function loadStylesheet(url) {
  var el = document.createElement('link');
  el.rel = 'stylesheet';
  el.type = 'text/css';
  el.media = 'screen';
  el.href = url;
  document.head.appendChild(el);
}

export function Basemap(gui) {
  var menuWrapper = gui.container.findChild('.display-options');
  var mainMenu = gui.container.findChild('.display-main-options');
  var addLayerMenu = gui.container.findChild('.add-basemap-menu').hide();
  var basemapList = gui.container.findChild('.added-basemaps');
  var overlayButtons = gui.container.findChild('.basemap-overlay-buttons');
  var container = gui.container.findChild('.basemap-container');
  var basemapNote = gui.container.findChild('.basemap-note');
  var addBasemap = gui.container.findChild('.add-basemap');
  var basemapWarning = gui.container.findChild('.basemap-warning').hide();
  var mapEl = gui.container.findChild('.basemap');
  var extentNote = El('div').addClass('basemap-prompt').appendTo(container).hide();
  var params = window.mapboxParams;
  var map;
  var activeStyle;
  var loading = false;
  // var faded = false;
  // var fadeBtn, clearBtn; // not in use
  var addBtn, addLayerBtn, cancelBtn;
  var customStyles = [];

  if (params) {
    //  TODO: check page URL for compatibility with mapbox key
    init();
  } else {
    menuWrapper.findChild('.basemap-opts').hide();
  }

  function init() {
    gui.on('mode', function(e) {
      if (e.prev == 'display_options') {
        // reset UI when leaving display options mode
        basemapWarning.hide();
        basemapNote.hide();
        // make sure secondary options menu gets closed
        mainMenu.show();
        addLayerMenu.hide();
      }
      if (e.name == 'display_options') {
        onUpdate();
      }
    });

    customStyles = GUI.getSavedValue('custom_basemaps') || [];
    updateBasemapList();

    addBtn = new SimpleButton(menuWrapper.findChild('.add-btn'));
    addBtn.on('click', function(e) {
      addLayerMenu.show();
      mainMenu.hide();
    });

    addLayerBtn = new SimpleButton(menuWrapper.findChild('.add-layer-btn'));
    addLayerBtn.on('click', function(e) {
      var name = menuWrapper.findChild('.add-layer-name').el.value || 'Custom layer';
      var mapboxUrl = menuWrapper.findChild('.add-mapbox-url').el.value;
      var mapboxKey = menuWrapper.findChild('.add-mapbox-key')?.el?.value;
      var templateUrl = menuWrapper.findChild('.add-template-url').el.value;
      var style = {name};

      if (mapboxUrl) {
        style.url = mapboxUrl;
        style.key = mapboxKey; // may be undefined
        style.type = 'mapbox';
      } else if (templateUrl) {
        style.url = templateUrl;
        style.type = menuWrapper.findChild('.tms').el.checked ? 'tms' : 'xyz';
      }

      customStyles.push(style);
      updateBasemapList();
      showBasemap(style);
      addLayerMenu.hide();
      mainMenu.show();
    });

    cancelBtn = new SimpleButton(menuWrapper.findChild('.add-cancel-btn'));
    cancelBtn.on('click', function() {
      addLayerMenu.hide();
      mainMenu.show();
    });

    // fadeBtn = new SimpleButton(menuWrapper.findChild('.fade-btn'));
    // clearBtn = new SimpleButton(menuWrapper.findChild('.clear-btn'));
    // clearBtn.on('click', function() {
    //   if (activeStyle) {
    //     turnOffBasemap();
    //   }
    // });

    // fadeBtn.on('click', function() {
    //   if (faded) {
    //     mapEl.css('opacity', 1);
    //     faded = false;
    //     fadeBtn.text('Fade');
    //   } else if (activeStyle) {
    //     mapEl.css('opacity', 0.35);
    //     faded = true;
    //     fadeBtn.text('Unfade');
    //   }
    // });

    gui.model.on('update', onUpdate);

    gui.on('map_click', function() {
      // close menu if user click on the map
      if (gui.getMode() == 'basemap') gui.clearMode();
    });

    params.styles.forEach(function(style) {
      // El('div')
      // .html(`<div class="basemap-style-btn"><img src="${style.icon}"></img></div><div class="basemap-style-label">${style.name}</div>`)
      // .appendTo(menuButtons)
      // .findChild('.basemap-style-btn').on('click', onClick);

      El('div').addClass('basemap-overlay-btn basemap-style-btn')
        .html(`<img src="${style.icon}"></img>`).on('click', onClick)
        .appendTo(overlayButtons);

      function onClick() {
        if (overlayButtons.hasClass('disabled')) return;
        if (style == activeStyle) {
          turnOffBasemap();
        } else {
          showBasemap(style);
        }
        updateButtons();
      }
    });
  }

  // close and turn off mode
  function closeMenu() {
    setTimeout(function() {
      gui.clearMode();
    }, 200);
  }

  function turnOffBasemap() {
    activeStyle = null;
    gui.map.setDisplayCRS(null);
  }

  function showBasemap(style) {
    activeStyle = style;
    // TODO: consider enabling dark basemap mode
    // Make sure that the selected layer style gets updated in gui-map.js
    // gui.state.dark_basemap = style && style.dark || false;
    if (map) {
      setStyle(activeStyle);
      refresh();
    } else if (prepareMapView()) {
      initMap();
    }
  }

  function updateBasemapList() {
    var styles = params.styles.concat(customStyles);
    basemapList.empty();
    styles.forEach(function(style) {
      renderBasemapListItem(basemapList, style);
    });
    updateButtons();
    GUI.setSavedValue('custom_basemaps', customStyles);
  }

  function isActiveStyle(style) {
    return style.url == activeStyle?.url;
  }

  function renderBasemapListItem(parent, style) {
    var isCustomStyle = !!style.type;
    var el = El('div').html(`<div data-slug="${getStyleId(style)}" class="basemap-list-item"><img class="on-icon" src="images/eye3.png"><img class="off-icon" src="images/eye.png"> ${style.name} ${isCustomStyle ? '<img class="close-btn" draggable="false" src="images/close.png">' : ''}</div>`);
    el.appendTo(parent);
    el.findChild('.basemap-list-item').on('click', function() {
      if (isActiveStyle(style)) {
        turnOffBasemap();
      } else {
        showBasemap(style);
      }
    });

    var closeBtn = el.findChild('.close-btn');
    closeBtn?.on('click', function(e) {
      e.stopPropagation();
      customStyles = customStyles.filter(function(o) {
        return o.url != style.url;
      });
      updateBasemapList();
      if (isActiveStyle(style)) {
        turnOffBasemap();
      }
    });
    el.appendTo(parent);
  }

  function getStyleId(style) {
    return ((style.name || '') + style.url).replace(/[^a-z0-9_]+/ig, '_');
  }

  function setStyle(style) {
    // update mapbox access token (user-defined styles may have a different key)
    window.mapboxgl.accessToken = style.key || (window.location.hostname == 'localhost' ?
      params.localhost_key : params.production_key) || params.key;

    if (style.type == 'mapbox' || !style.type) {
      map.setStyle(style.url);
    } else if (style.type == 'xyz' || style.type == 'tms') {
      map.setStyle({
        'version': 8,
        'sources': {
          'raster-tiles': {
            'type': 'raster',
            'tiles': [style.url],
            'scheme': style.type, // xyz or tms
            'tileSize': 256, // style.url.includes('@2x') ? 512 : 256
          }
        },
        'layers': [
          {
            'id': getStyleId(style),
            'type': 'raster',
            'source': 'raster-tiles',
            'minzoom': 0
            // 'maxzoom': 22
          }
        ]
      });
    } else {
      error('unsupported map style:', style);
    }
  }

  function updateButtons() {
    overlayButtons.findChildren('.basemap-style-btn').forEach(function(el, i) {
      el.classed('active', params.styles[i] == activeStyle);
    });

    menuWrapper.findChildren('.basemap-list-item').forEach(function(el, i) {
      el.classed('active', el.node().getAttribute('data-slug') == (activeStyle ? getStyleId(activeStyle) : ''));
    });
  }

  function onUpdate() {
    var activeLyr = gui.model.getActiveLayer(); // may be null
    var info = getDatasetCrsInfo(activeLyr?.dataset); // defaults to wgs84
    var dataCRS = info.crs || null;
    var displayCRS = gui.map.getDisplayCRS();
    var basemapsNotAvailable = !dataCRS || !displayCRS || !crsIsUsable(displayCRS) || !crsIsUsable(dataCRS);
    var warning, note;

    if (basemapsNotAvailable) {
      warning = 'This data is incompatible with the basemaps.';
      if (activeLyr && !internal.layerHasGeometry(activeLyr.layer)) {
        warning += ' Reason: layer is missing geographic data';
      } else if (!dataCRS) {
        warning += ' Reason: unknown projection.';
      }
      basemapList.hide();
      addBasemap.hide();
      basemapWarning.html(warning).show();
      basemapNote.hide();
      overlayButtons.addClass('disabled');
      activeStyle = null;
      updateButtons();
    } else {
      note = `Note: basemaps use the Mercator projection.`;
      basemapNote.text(note).show();
      overlayButtons.show();
      basemapList.show();
      addBasemap.show();
      overlayButtons.removeClass('disabled');
    }
  }

  function enabled() {
    return !!(mapEl && params);
  }

  function show() {
    gui.container.addClass('basemap-on');
    mapEl.node().style.display = 'block';
  }

  function hide() {
    gui.container.removeClass('basemap-on');
    mapEl.node().style.display = 'none';
  }

  function getLonLatBounds() {
    var ext = gui.map.getExtent();
    var bbox = ext.getBounds().toArray();
    var bbox2 = fromWebMercator(bbox[0], bbox[1])
        .concat(fromWebMercator(bbox[2], bbox[3]));
    return bbox2;
  }

  function initMap() {
    // var accessToken = (window.location.hostname == 'localhost' ?
    //   params.localhost_key : params.production_key) || params.key;
    if (!enabled() || map || loading) return;
    loading = true;
    loadStylesheet(params.css);
    loadScript(params.js, function() {
      map = new window.mapboxgl.Map({
        logoPosition: 'bottom-left',
        container: mapEl.node(),
        // style: activeStyle.url,
        style: EMPTY_STYLE, // initializing with empty style to support custom styles
        bounds: getLonLatBounds(),
        doubleClickZoom: false,
        dragPan: false,
        dragRotate: false,
        scrollZoom: false,
        interactive: false,
        keyboard: false,
        maxPitch: 0,
        projection: 'mercator', // prevent globe view when zoomed out
        renderWorldCopies: true // false // false prevents panning off the map
      });
      setStyle(activeStyle);
      map.on('load', function() {
        loading = false;
        refresh();
      });
    });
  }

  // @bbox: latlon bounding box of current map extent
  function checkBounds(bbox) {
    var ext = gui.map.getExtent();
    var mpp = ext.getBounds().width() / ext.width();
    var z = scaleToZoom(mpp);
    var msg;
    if (bbox[1] >= -85 && bbox[3] <= 85 && z <= 20) {
      extentNote.hide();
      return true;
    }
    if (z > 20) {
      msg = 'zoom out';
    } else if (bbox[1] > 0) {
      msg = 'pan south';
    } else if (bbox[3] < 0) {
      msg = 'pan north';
    } else {
      msg = msg = 'zoom in';
    }
    extentNote.html(msg + ' to see the basemap').show();
    return false;
  }

  function crsIsUsable(crs) {
    if (!crs) return false;
    if (!internal.isInvertibleCRS(crs)) return false;
    return true;
  }

  function prepareMapView() {
    var crs = gui.map.getDisplayCRS();
    if (!crs) return false;
    if (!internal.isWebMercator(crs)) {
      gui.map.setDisplayCRS(internal.parseCrsString('webmercator'));
    }
    return true;
  }

  function refresh() {
    var off = !enabled() || !map || loading || !activeStyle ||
      !gui.map.getDisplayCRS(); // may be slow if getting bounds of many shapes
    // fadeBtn.active(!off);
    // clearBtn.active(!off);

    updateButtons();

    if (off) {
      hide();
      extentNote.hide();
      return;
    }

    prepareMapView();
    var bbox = getLonLatBounds();
    if (!checkBounds(bbox)) {
      // map does not display outside these bounds
      hide();
    } else {
      show();
      map.resize();
      map.fitBounds(bbox, {animate: false});
    }
  }

  function isOn() {
    return !!activeStyle;
  }

  return {refresh, show: onUpdate, isOn};
}
