import { internal, geom } from './gui-core';
import { SimpleButton } from './gui-elements';
import { El } from './gui-el';

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

export function Basemap(gui, ext) {
  var menu = gui.container.findChild('.basemap-options');
  var list = menu.findChild('.basemap-styles');
  var container = gui.container.findChild('.basemap-container');
  var basemapBtn = gui.container.findChild('.basemap-btn');
  var basemapMsg = gui.container.findChild('.basemap-error');
  var mapEl = gui.container.findChild('.basemap');
  var extentNote = El('div').addClass('basemap-note').appendTo(container).hide();
  var params = window.mapboxParams;
  var map;
  var activeStyle;
  var loading = false;

  if (params) {
    init();
  } else {
    basemapBtn.hide();
  }

  function init() {
    gui.addMode('basemap', turnOn, turnOff, basemapBtn);
    // model.on('select', function() {
      // TODO: hide basemap
      // if (gui.getMode() == 'basemap') gui.clearMode();
    // });

    new SimpleButton(menu.findChild('.close-btn')).on('click', function() {
      gui.clearMode();
      turnOff();
    });

    gui.on('map_click', function() {
      // close menu if user click on the map
      if (gui.getMode() == 'basemap') gui.clearMode();
    });

    params.styles.forEach(function(style) {
      var btn = El('div').html(`<div class="basemap-style-btn"><img src="${style.icon}"></img></div><div class="basemap-style-label">${style.name}</div>`);
      btn.findChild('.basemap-style-btn').on('click', function() {
        updateStyle(style == activeStyle ? null : style);
        updateButtons();
      });
      btn.appendTo(list);
    });
  }

  function updateStyle(style) {
    activeStyle = style || null;
    if (!style) {
      gui.map.setDisplayCRS(null);
      hide();
    } else if (map) {
      map.setStyle(style.url);
      refresh();
    } else {
      initMap();
    }
  }

  function updateButtons() {
    list.findChildren('.basemap-style-btn').forEach(function(el, i) {
      el.classed('active', params.styles[i] == activeStyle);
    });
  }

  function turnOn() {
    var crs = gui.map.getDisplayCRS();
    if (!internal.isWebMercator(crs) && !internal.isWGS84(crs)) {
      basemapMsg.html('The current projection is not compatible.');
    }
    menu.show();
  }

  function turnOff() {
    basemapMsg.html('');
    menu.hide();
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

  function getBounds() {
    var bbox = ext.getBounds().toArray();
    var tr = getLonLat(bbox[2], bbox[3]);
    var bl = getLonLat(bbox[0], bbox[1]);
    return bl.concat(tr);
  }

  function getLonLat(x, y) {
    var R = 6378137;
    var R2D = 180 / Math.PI;
    var lon = x / R * R2D;
    var lat = R2D * (Math.PI * 0.5 - 2 * Math.atan(Math.exp(-y / R)));
    return [lon, lat];
  }

  function initMap() {
    if (!enabled() || map || loading) return;
    loading = true;
    loadStylesheet(params.css);
    loadScript(params.js, function() {
      map = new window.mapboxgl.Map({
        accessToken: params.key,
        logoPosition: 'bottom-left',
        container: mapEl.node(),
        style: activeStyle.url,
        bounds: getBounds(),
        doubleClickZoom: false,
        dragPan: false,
        dragRotate: false,
        scrollZoom: false,
        interactive: false,
        keyboard: false,
        maxPitch: 0,
        renderWorldCopies: true // false // false prevents panning off the map
      });
      map.on('load', function() {
        loading = false;
        refresh();
      });
    });
  }

  function checkBounds(bbox) {
    var msg;
    if (bbox[1] >= -85 && bbox[3] <= 85) {
      extentNote.hide();
      return true;
    }
    if (bbox[1] > 0) msg = 'pan south to see the basemap';
    else if (bbox[3] < 0) msg = 'pan north to see the basemap';
    else msg = msg = 'zoom in to see the basemap';
    extentNote.html(msg).show();
    return false;
  }

  function refresh() {
    if (!enabled() || !map || loading || !activeStyle) return;
    var crs = gui.map.getDisplayCRS();
    if (internal.isWGS84(crs)) {
      gui.map.setDisplayCRS(internal.getCRS('webmercator'));
    } else if (!internal.isWebMercator(crs)) {
      return;
    }
    var bbox = getBounds();
    if (!checkBounds(bbox)) {
      // map does not display outside these bounds
      hide();
    } else {
      show();
      map.resize();
      map.fitBounds(bbox, {animate: false});
    }
  }

  return {refresh: refresh}; // called by map when extent changes
}
