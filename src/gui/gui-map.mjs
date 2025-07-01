import { HitControl } from './gui-hit-control';
import { MapNav } from './gui-map-nav';
import { SelectionTool } from './gui-selection-tool';
import { InspectionControl2 } from './gui-inspection-control';
import {
  updateLayerStackOrder,
  calcDotScale } from './gui-layer-utils';
import { getOverlayLayers } from './gui-overlay-styler';
import { mapNeedsReset,
  arcsMayHaveChanged,
  popupCanStayOpen } from './gui-map-utils';
import { initInteractiveEditing } from './gui-edit-modes';
import {
  getIntersectionStyle,
  getReferenceLayerStyle,
  getActiveLayerStyle } from './gui-layer-styler';
import { MapExtent } from './gui-map-extent';
import { LayerRenderer } from './gui-layer-renderer';
import { BoxTool } from './gui-box-tool';
import { RectangleControl } from './gui-rectangle-control';
import {
  projectMapExtent,
  getMapboxBounds,
  projectLatLonBBox } from './gui-dynamic-crs';
import {
  enhanceLayerForDisplay,
  projectLayerForDisplay } from './gui-display-layer';
import { utils, internal, Bounds } from './gui-core';
import { EventDispatcher } from './gui-events';
import { ElementPosition } from './gui-element-position';
import { MouseArea } from './gui-mouse';
import { GUI } from './gui-lib';
import {
  getDatasetCrsInfo,
  formatCoordsForDisplay,
  translateDisplayPoint } from './gui-display-utils';

utils.inherit(MshpMap, EventDispatcher);

export function MshpMap(gui) {
  var opts = gui.options,
      el = gui.container.findChild('.map-layers').node(),
      position = new ElementPosition(el),
      model = gui.model,
      map = this,
      _mouse = new MouseArea(el, position),
      _ext = new MapExtent(position),
      _visibleLayers = [], // cached visible map layers
      _hit, _nav,
      _intersectionLyr, _activeLyr, _overlayLayers,
      _renderer, _dynamicCRS;

  _mouse.disable(); // wait for gui.focus() to activate mouse events

  model.on('select', function(e) {
    _intersectionLyr = null;
    // _overlayLyr = null;
  });

  gui.on('active', function() {
    _mouse.enable();
  });

  gui.on('inactive', function() {
    _mouse.disable();
  });

  gui.on('map-needs-refresh', function() {
    drawLayers();
  });

  model.on('update', onUpdate);

  document.addEventListener('visibilitychange', function(e) {
    // refresh map when browser tab is re-activated (Chrome on mac has been
    // blanking the canvas after several other tabs are visited)
    if (document.visibilityState == 'visible') drawLayers();
  });

  // Update display of segment intersections
  this.setIntersectionLayer = function(lyr, dataset) {
    if (lyr == _intersectionLyr) return; // no change
    if (lyr) {
      enhanceLayerForDisplay(lyr, dataset, getDisplayOptions());
      lyr.gui.style = getIntersectionStyle(lyr.gui.displayLayer, getGlobalStyleOptions());
      _intersectionLyr = lyr;
    } else {
      _intersectionLyr = null;
    }
    // TODO: try to avoid redrawing layers twice (in some situations)
    drawLayers();
  };

  this.pixelCoordsToLngLatCoords = function(x, y) {
    var crsFrom = this.getDisplayCRS();
    if (!crsFrom) return null; // e.g. table view
    var p1 = internal.toLngLat(_ext.pixCoordsToMapCoords(x, y), crsFrom);
    var p2 = internal.toLngLat(_ext.pixCoordsToMapCoords(x+1, y+1), crsFrom);
    return p1 && p2 && p1[1] <= 90 && p1[1] >= -90 ?
      formatCoordsForDisplay(p1, p2) : null;
  };

  this.pixelCoordsToProjectedCoords = function(x, y) {
    if (!_activeLyr) return null;
    var info = getDatasetCrsInfo(_activeLyr.gui.source.dataset);
    if (info && internal.isLatLngCRS(info.crs)) {
      return null; // latlon dataset
    }
    var p1 = translateDisplayPoint(_activeLyr, _ext.pixCoordsToMapCoords(x, y));
    var p2 = translateDisplayPoint(_activeLyr, _ext.pixCoordsToMapCoords(x+1, y+1));
    return p1 && p2 ? formatCoordsForDisplay(p1, p2) : null;
  };

  this.getDisplayCRS = function() {
    if (!_activeLyr) {
      return _dynamicCRS || internal.parseCrsString('wgs84');
    }
    if (!_activeLyr.gui.geographic) {
      return null;
    }
    if (_activeLyr.gui.dynamic_crs) {
      return _activeLyr.gui.dynamic_crs;
    }
    return this.getActiveLayerCRS();
  };

  this.getActiveLayerCRS = function() {
    if (!_activeLyr || !_activeLyr.gui.geographic) {
      return null;
    }
    var info = getDatasetCrsInfo(_activeLyr.gui.source.dataset);
    return info.crs || null;
  };

  this.getExtent = function() {return _ext;};
  this.getMouse = function() {return _mouse;};
  this.isActiveLayer = isActiveLayer;
  this.isVisibleLayer = isVisibleLayer;
  this.getActiveLayer = function() { return _activeLyr; };
  // this.getViewData = function() {
  //   return {
  //     isPreview: isPreviewView(),
  //     isTable: isTableView(),
  //     isEmpty: !_activeLyr,
  //     dynamicCRS: _dynamicCRS || null
  //   };
  // };

  // called by layer menu after layer visibility is updated
  this.redraw = function() {
    updateVisibleMapLayers();
    drawLayers();
  };

  // Set or clear a CRS to use for display, without reprojecting the underlying dataset(s).
  // crs: a CRS object or string, or null to clear the current setting
  this.setDisplayCRS = function(crs) {
    // TODO: update bounds of frame layer, if there is a frame layer
    var oldCRS = this.getDisplayCRS();
    var newCRS = utils.isString(crs) ? internal.parseCrsString(crs) : crs;
    // TODO: handle case that old and new CRS are the same
    _dynamicCRS = newCRS;
    // if (!_activeLyr) return; // stop here if no layers have been selected

    // clear any stored FilteredArcs objects (so they will be recreated with the desired projection)
    clearAllDisplayArcs();

    // Reproject all visible map layers
    getContentLayers().forEach(function(lyr) {
      projectLayerForDisplay(lyr, newCRS);
    });

    // Update map extent (also triggers redraw)
    projectMapExtent(_ext, oldCRS, this.getDisplayCRS(), calcFullBounds());
    updateFullBounds();
  };

  // Initialization just before displaying the map for the first time
  this.init = function() {
    if (_renderer) return;
    _ext.setFullBounds(calcFullBounds());
    _ext.resize();
    _renderer = new LayerRenderer(gui, el);
    _nav = new MapNav(gui, _ext, _mouse);

    if (opts.inspectorControl) {
      _hit = new HitControl(gui, _ext, _mouse),
      new InspectionControl2(gui, _hit);
      new SelectionTool(gui, _ext, _hit),
      new BoxTool(gui, _ext, _nav),
      new RectangleControl(gui, _hit),
      initInteractiveEditing(gui, _ext, _hit);
      _hit.on('change', function() { drawLayers('hover'); });
    }

    _ext.on('change', function(e) {
      gui?.basemap.refresh(); // keep basemap synced up (if enabled)
      drawLayers(e.redraw ? '' : 'nav');
    });

    gui.on('resize', function() {
      position.update(); // kludge to detect new map size after console toggle
    });
  };

  function getGlobalStyleOptions(opts) {
    var mode = gui.state.interaction_mode;
    return Object.assign({
      darkMode: !!gui.state.dark_basemap,
      outlineMode: mode == 'vertices',
      interactionMode: mode
    }, opts);
  }

  // Refresh map display in response to data changes, layer selection, etc.
  function onUpdate(e) {
    var updated = model.getActiveLayer();
    var prevLyr = _activeLyr || null;
    var fullBounds;
    var needReset;

    if (arcsMayHaveChanged(e.flags)) {
      // regenerate filtered arcs the next time they are needed for rendering
      // delete e.dataset.gui.displayArcs
      clearAllDisplayArcs();

      // reset simplification after projection (thresholds have changed)
      // TODO: preserve simplification pct (need to record pct before change)
      if (e.flags.proj && updated.dataset.arcs) {
        updated.dataset.arcs.setRetainedPct(1);
      }
    }

    if (e.flags.simplify_method) { // no redraw needed
      return false;
    }

    if (e.flags.simplify_amount || e.flags.redraw_only) { // only redraw (slider drag)
      drawLayers();
      return;
    }

    if (updated.layer) {
      _activeLyr = updated.layer;
      enhanceLayerForDisplay(_activeLyr, updated.dataset, getDisplayOptions());
      // need to set layer style so hit detection can calculate size of certain symbols
      _activeLyr.gui.style = getActiveLayerStyle(_activeLyr.gui.displayLayer, getGlobalStyleOptions());
    } else {
      _activeLyr = null;
    }

    if (popupCanStayOpen(e.flags)) {
      // data may have changed; if popup is open, it needs to be refreshed
      gui.dispatchEvent('popup-needs-refresh');
    } else if (_hit) {
      _hit.clearSelection();
    }
    _hit.setLayer(_activeLyr); // need this every time, to support dynamic reprojection

    updateVisibleMapLayers();
    fullBounds = calcFullBounds();

    if (prevLyr?.gui.tabular || _activeLyr?.gui.tabular) {
      needReset = true;
    } else if (_activeLyr && internal.layerIsEmpty(_activeLyr)) {
      needReset = false;
    } else if (!prevLyr) {
      needReset = true;
    } else {
      needReset = mapNeedsReset(fullBounds, _ext.getFullBounds(), _ext.getBounds(), e.flags);
    }

    _ext.setFullBounds(fullBounds, getStrictBounds()); // update 'home' button extent

    if (needReset) {
      _ext.reset();
      gui?.basemap.refresh();
    }
    drawLayers();
    map.dispatchEvent('updated');
  }

  function getDisplayOptions() {
    return {
      crs: _dynamicCRS
    };
  }

  function getStrictBounds() {
    // if (internal.isWebMercator(map.getDisplayCRS())) {
    if (_dynamicCRS && internal.isWebMercator(map.getDisplayCRS())) {
      return getMapboxBounds();
    }
    return null;
  }

  function updateFullBounds() {
    _ext.setFullBounds(calcFullBounds(), getStrictBounds());
  }

  function getContentLayerBounds() {
    var b = new Bounds();
    var layers = getContentLayers();
    layers.forEach(function(lyr) {
      b.mergeBounds(lyr.gui.bounds);
    });

    if (!b.hasBounds()) {
      // assign bounds to empty layers, to prevent rendering errors downstream
      // b.setBounds(0,0,0,0);
      b.setBounds(projectLatLonBBox([11.28,33.43,32.26,46.04], _dynamicCRS));
    }
    return b;
  }

  function calcFullBounds() {
    var b;
    if (isPreviewView()) {
      b = new Bounds(getFrameLayerData().bbox);
    } else {
      b = getContentLayerBounds();
    }

    // add margin
    // use larger margin for small sizes
    var widthPx = _ext.width();
    var marginPct = widthPx < 700 && 3.5 || widthPx < 800 && 3 || 2.5;
    if (isTableView()) {
      var n = internal.getFeatureCount(_activeLyr);
      marginPct = n < 5 && 20 || n < 100 && 10 || 4;
    }
    b.scale(1 + marginPct / 100 * 2);

    // Inflate display bounding box by a tiny amount (gives extent to single-point layers and collapsed shapes)
    b.padBounds(1e-4, 1e-4, 1e-4, 1e-4);
    return b;
  }

  function isActiveLayer(lyr) {
    return _activeLyr && lyr == _activeLyr || false;
  }

  function isVisibleLayer(lyr) {
    return isActiveLayer(lyr) || lyr.pinned;
  }

  function isTableView() {
    return !!_activeLyr?.gui.tabular;
  }

  function findFrameLayer() {
    return getVisibleMapLayers().find(function(lyr) {
      return internal.isFrameLayer(lyr.gui.displayLayer, lyr.gui.displayArcs);
    });
  }

  // Preview view: symbols are scaled based on display size of frame layer
  function isPreviewView() {
    return !isTableView() && !!getFrameLayerData();
  }

  function getFrameLayerData() {
    var lyr = findFrameLayer();
    return lyr && internal.getFrameLayerData(lyr, lyr.gui.displayArcs) || null;
  }

  function clearAllDisplayArcs() {
    model.forEachLayer(function(lyr) {
      if (lyr.gui) delete lyr.gui.arcCounts;
    });
    model.getDatasets().forEach(function(o) {
      delete o.gui;
    });
  }

  function updateVisibleMapLayers() {
    var layers = [];
    model.getLayers().forEach(function(o) {
      if (!isVisibleLayer(o.layer)) return;
      if (isActiveLayer(o.layer)) {
        layers.push(_activeLyr);
      } else if (!isTableView()) {
        enhanceLayerForDisplay(o.layer, o.dataset, getDisplayOptions());
        layers.push(o.layer);
      }
    });
    _visibleLayers = layers;
  }

  function getVisibleMapLayers() {
    return _visibleLayers;
  }

  function findActiveLayer(layers) {
    return layers.filter(function(o) {
      return o == _activeLyr;
    });
  }

  function getContentLayers() {
    var layers = getVisibleMapLayers();
    if (isTableView()) {
      return findActiveLayer(layers);
    }
    return layers.filter(function(o) {
      return !!o.gui.geographic;
    });
  }

  function getDrawableContentLayers() {
    return getContentLayers().filter(function(lyr) {
      if (isActiveLayer(lyr) && lyr.hidden) return false;
      return true;
    });
  }

  function getDrawableFurnitureLayers(layers) {
    if (!isPreviewView()) return [];
    return getVisibleMapLayers().filter(function(o) {
      return internal.isFurnitureLayer(o);
    });
  }

  function updateLayerStyles(layers) {
    layers.forEach(function(mapLayer, i) {
      var style;
      if (isActiveLayer(mapLayer)) {
        // regenerating active style everytime, to support style change when
        // switching between outline and preview modes.
        style = getActiveLayerStyle(mapLayer.gui.displayLayer, getGlobalStyleOptions());
        if (style.type != 'styled' && layers.length > 1 && style.strokeColors) {
          // kludge to hide ghosted layers when reference layers are present
          // TODO: consider never showing ghosted layers (which appear after
          // commands like dissolve and filter).
          style = utils.defaults({
            strokeColors: [null, style.strokeColors[1]]
          }, style);
        }
      } else {
        if (mapLayer == _activeLyr) {
          console.error("Error: shared map layer");
        }
        style = getReferenceLayerStyle(mapLayer.gui.displayLayer, getGlobalStyleOptions());
      }
      mapLayer.gui.style = style;
    });
  }

  function sortMapLayers(layers) {
    layers.sort(function(a, b) {
      // assume that each layer has a menu_order (assigned by updateLayerStackOrder())
      return a.menu_order - b.menu_order;
    });
  }

  var skipCounts = {
    nav: 0,
    hover: 0,
    redraw: 0
  };
  function drawLayers(actionArg) {
    var action = actionArg || 'redraw';
    skipCounts[action]++;
    // This seems to smooth out navigation and keep overlay and basemap in sync.
    requestAnimationFrame(function() {drawLayers2(action);});
  }

  // action:
  //   'nav'      map was panned/zoomed -- only map extent has changed
  //   'hover'    highlight has changed -- only refresh overlay
  //   'redraw'  anything could have changed
  function drawLayers2(action) {
    if (--skipCounts[action] > 0) {
      // skip redraw if more draws are queued up
      return;
    }
    // sometimes styles need to be regenerated with 'hover' action (when?)
    var layersMayHaveChanged = action != 'nav'; // !action;
    var fullBounds;
    var contentLayers = getDrawableContentLayers();
    // var furnitureLayers = getDrawableFurnitureLayers();
    if (!(_ext.width() > 0 && _ext.height() > 0)) {
      // TODO: track down source of these errors
      console.error("Collapsed map container, unable to draw.");
      return;
    }
    if (layersMayHaveChanged) {
      // kludge to handle layer visibility toggling
      _ext.setFrameData(isPreviewView() ? getFrameLayerData() : null);
      updateFullBounds();
      updateLayerStyles(contentLayers);
      updateLayerStackOrder(model.getLayers());// update menu_order property of all layers
    }
    sortMapLayers(contentLayers);
    if (_intersectionLyr) {
      contentLayers = contentLayers.concat(_intersectionLyr);
    }
    // moved this below intersection layer addition, so intersection dots get scaled

    // Adjust dot size based on total visible dots TODO: move this
    var dotScale = calcDotScale(contentLayers, _ext);
    contentLayers.forEach(function(lyr) {
      lyr.gui.style.dotScale = dotScale;
    });

    // RENDERING
    // draw main content layers
    _renderer.drawMainLayers(contentLayers, action);

    // draw hover & selection overlay
    if (!_overlayLayers || action != 'nav') {
      // cache layers to use when panning/zooming
      _overlayLayers = getOverlayLayers(_activeLyr, _hit.getHitState(), getGlobalStyleOptions());
    }
    _renderer.drawOverlayLayers(_overlayLayers, action);

    // TODO: draw furniture
    // _renderer.drawFurnitureLayers(furnitureLayers, action);
    gui.dispatchEvent('map_rendered');
  }
}

