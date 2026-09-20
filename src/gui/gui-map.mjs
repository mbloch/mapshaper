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
  getCompareLayerStyle,
  getReferenceLayerStyle,
  getActiveLayerStyle } from './gui-layer-styler';
import { MapExtent } from './gui-map-extent';
import { LayerRenderer } from './gui-layer-renderer';
import { BoxTool } from './gui-box-tool';
import { RectangleControl } from './gui-rectangle-control';
import { RulerTool } from './gui-ruler-tool';
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
      _intersectionLyr, _compareLyr, _activeLyr, _overlayLayers,
      _renderer, _dynamicCRS,
      _resizeRedrawTimer = null;

  // Whether the full bounds the view is working from describe nothing that is
  // on the map: a project with no content gets the placeholder box assigned in
  // getContentLayerBounds() instead. Recorded because the difference matters
  // when deciding whether an update should reset the view.
  var _boundsArePlaceholder = false;

  var RESIZE_REDRAW_DELAY = 200;

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

  // e.action: optional draw action, for a caller that knows only the overlay
  // has changed -- the label tool previewing a curve against the pointer, which
  // would otherwise force a full redraw on every mouse move.
  gui.on('map-needs-refresh', function(e) {
    drawLayers(e && e.action);
  });

  model.on('update', onUpdate);

  document.addEventListener('visibilitychange', function(e) {
    // refresh map when browser tab is re-activated (Chrome on mac has been
    // blanking the canvas after several other tabs are visited)
    if (document.visibilityState == 'visible') drawLayers();
  });

  // Update display of segment intersections
  this.setIntersectionLayer = function(lyr, dataset, redraw) {
    if (lyr == _intersectionLyr) return; // no change
    if (lyr) {
      enhanceLayerForDisplay(lyr, dataset, getDisplayOptions());
      lyr.gui.style = getIntersectionStyle(lyr.gui.displayLayer, getGlobalStyleOptions());
      _intersectionLyr = lyr;
    } else {
      _intersectionLyr = null;
    }
    // TODO: try to avoid redrawing layers twice (in some situations)
    if (redraw !== false) {
      drawLayers();
    }
  };

  // Display a temporary "before" overlay of pre-edit shapes (comparison feature).
  // lyr, dataset: a standalone (non-catalog) layer + dataset, or null to clear.
  this.setCompareLayer = function(lyr, dataset, redraw) {
    if (lyr == _compareLyr) return; // no change
    if (lyr) {
      enhanceLayerForDisplay(lyr, dataset, getDisplayOptions());
      lyr.gui.style = getCompareLayerStyle(lyr.gui.displayLayer, getGlobalStyleOptions());
      _compareLyr = lyr;
    } else {
      _compareLyr = null;
    }
    if (redraw !== false) {
      drawLayers();
    }
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

  // Returns band values and display color of the raster pixel under a screen
  // location, or null if the active layer is not a raster or the point misses it.
  this.pixelCoordsToRasterPixel = function(x, y) {
    var p;
    if (!_activeLyr || !internal.layerHasRaster(_activeLyr)) return null;
    // The grid is georeferenced in the layer's own CRS, so a display point has
    // to be translated back when the layer is being reprojected for display.
    p = translateDisplayPoint(_activeLyr, _ext.pixCoordsToMapCoords(x, y));
    return p ? internal.getRasterPixelAtMapXY(_activeLyr.raster, p[0], p[1]) : null;
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
  // The display-only layers drawn over the content, as last built. Exposed for
  // tests: overlays are never in the catalog, so there is no other way to
  // assert on what a tool drew.
  this.getOverlayLayers = function() {return _overlayLayers || [];};
  this.isActiveLayer = isActiveLayer;
  this.isVisibleLayer = isVisibleLayer;
  this.getSvgRoot = function() { return _renderer ? _renderer.getSvgRoot() : null; };
  this.getActiveLayer = function() { return _activeLyr; };
  this.getHitControl = function() { return _hit; };
  this.getCompositionLayers = function() { return getContentLayers().slice(); };
  this.getPreviewFrameData = getFrameLayerData;
  this.isPreviewView = isPreviewView;
  this.setPreviewMode = function(on, fitPage) {
    var hasFrame = !!internal.getActiveFrame(model);
    var next = !!on && hasFrame;
    var changed = gui.state.preview_mode != next;
    gui.state.preview_mode = next;
    _ext.setFrameData(isPreviewView() ? getFrameLayerData() : null);
    updateFullBounds();
    if (fitPage !== false) {
      _ext.home();
    }
    drawLayers();
    if (changed) {
      gui.dispatchEvent('preview_mode_change', {enabled: next});
    }
  };
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
    var oldCRS = this.getDisplayCRS();
    var newCRS = utils.isString(crs) ? internal.parseCrsString(crs) : crs;
    // TODO: handle case that old and new CRS are the same
    _dynamicCRS = newCRS;
    // if (!_activeLyr) return; // stop here if no layers have been selected

    // clear any stored FilteredArcs objects (so they will be recreated with the desired projection)
    clearAllDisplayArcs();

    // Reproject all visible map layers
    getContentLayers().concat(_intersectionLyr || []).concat(_compareLyr || []).forEach(function(lyr) {
      projectLayerForDisplay(lyr, newCRS);
    });
    var frameTarget = internal.getActiveFrame(model);
    if (frameTarget) {
      if (!frameTarget.layer.gui) {
        enhanceLayerForDisplay(frameTarget.layer, frameTarget.dataset, getDisplayOptions());
      }
      projectLayerForDisplay(frameTarget.layer, newCRS);
    }

    // Update map extent (also triggers redraw)
    projectMapExtent(_ext, oldCRS, this.getDisplayCRS(), calcFullBounds());
    updateFullBounds();
    map.dispatchEvent('display_crs_change', {crs: this.getDisplayCRS(), prev_crs: oldCRS});
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
      new RulerTool(gui, _ext),
      new RectangleControl(gui, _hit),
      initInteractiveEditing(gui, _ext, _hit);
      _hit.on('change', function() { drawLayers('hover'); });
    }

    _ext.on('change', function(e) {
      gui?.basemap.refresh(); // keep basemap synced up (if enabled)
      if (e.resize) {
        drawLayersForResize(e.resizeSource);
      } else {
        cancelResizeRedraw();
        drawLayers(e.redraw ? '' : 'nav');
      }
    });

    gui.on('resize', function(e) {
      position.update(e.source); // kludge to detect new map size after console toggle
    });
  };

  function drawLayersForResize(source) {
    if (source == 'sidebar') {
      cancelResizeRedraw();
      drawLayers();
    } else {
      drawLayers('nav');
      scheduleResizeRedraw();
    }
  }

  function scheduleResizeRedraw() {
    cancelResizeRedraw();
    _resizeRedrawTimer = setTimeout(function() {
      _resizeRedrawTimer = null;
      drawLayers();
    }, RESIZE_REDRAW_DELAY);
  }

  function cancelResizeRedraw() {
    if (_resizeRedrawTimer) {
      clearTimeout(_resizeRedrawTimer);
      _resizeRedrawTimer = null;
    }
  }

  function getGlobalStyleOptions(opts) {
    var mode = gui.state.interaction_mode;
    return Object.assign({
      darkMode: !!gui.state.dark_basemap,
      outlineMode: mode == 'vertices',
      interactionMode: mode
    }, opts, gui.display.getOptions()); // intersectionsOn, compareOn
  }

  // Refresh map display in response to data changes, layer selection, etc.
  function onUpdate(e) {
    var updated = model.getActiveLayer();
    var prevLyr = _activeLyr || null;
    // read before calcFullBounds() below, which describes the map as it is
    // after this update
    var prevBoundsWerePlaceholder = _boundsArePlaceholder;
    var fullBounds;
    var needReset;

    if (!updated) {
      clearMapState();
      drawLayers();
      map.dispatchEvent('updated');
      return;
    }

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
    if (e.flags['update-frame']) {
      var frameTarget = internal.getActiveFrame(model);
      if (frameTarget) {
        delete frameTarget.layer.gui;
        delete frameTarget.dataset.gui;
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
    _hit.setLayer(isFrameMapLayer(_activeLyr) ? null : _activeLyr);
    // need this every time, to support dynamic reprojection

    updateVisibleMapLayers();
    fullBounds = calcFullBounds();

    if (prevLyr?.gui.tabular || _activeLyr?.gui.tabular) {
      needReset = true;
    } else if (_activeLyr && internal.layerIsEmpty(_activeLyr)) {
      needReset = false;
    } else if (!prevLyr) {
      needReset = true;
    } else if (prevBoundsWerePlaceholder) {
      // The bounds being compared against are the placeholder given to a
      // project with nothing in it, so mapNeedsReset() has nothing real to
      // compare: the placeholder covers a continent while the first feature
      // placed by hand covers almost nothing, and that difference alone trips
      // its area-change rule. Resetting is the wrong answer here anyway --
      // this is a feature the user has just put at a spot they chose on
      // screen, so the view they chose it in is the one to keep, unless what
      // arrived is not in it.
      needReset = !fullBounds.intersects(_ext.getBounds());
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

  function clearMapState() {
    _activeLyr = null;
    _visibleLayers = [];
    _intersectionLyr = null;
    _overlayLayers = null;
    if (_hit) {
      _hit.clearSelection();
      _hit.setLayer(null);
    }
  }

  function getDisplayOptions() {
    return {
      crs: _dynamicCRS,
      notify: gui.notify
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

    _boundsArePlaceholder = !b.hasBounds();
    if (_boundsArePlaceholder) {
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
      _boundsArePlaceholder = false; // a frame is real content
    } else {
      b = getContentLayerBounds(); // sets _boundsArePlaceholder
    }

    // add margin
    // use larger margin for small sizes
    var widthPx = _ext.width();
    var marginPct = widthPx < 700 && 4.5 || widthPx < 800 && 4 || 3.5;
    if (isTableView()) {
      var n = internal.getFeatureCount(_activeLyr);
      marginPct = n < 5 && 20 || n < 100 && 10 || 4;
    }
    b.scale(1 + marginPct / 100 * 2);

    // Inflate display bounding box of single-point layers and collapsed shapes a bit
    if (b.width() === 0 || b.height() === 0) {
      b.padBounds(1e-4, 1e-4, 1e-4, 1e-4);
    }
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
    var target = internal.getActiveFrame(model);
    if (!target) return null;
    if (!target.layer.gui) {
      enhanceLayerForDisplay(target.layer, target.dataset, getDisplayOptions());
    }
    return target.layer;
  }

  // Preview view: symbols are scaled based on display size of frame layer
  function isPreviewView() {
    return !isTableView() && !!gui.state.preview_mode && !!getFrameLayerData();
  }

  function getFrameLayerData() {
    var lyr = findFrameLayer();
    var crs = lyr && (lyr.gui.dynamic_crs ||
      internal.getDatasetCRS(lyr.gui.source.dataset));
    return lyr && internal.getFrameLayerData(
      lyr.gui.displayLayer,
      lyr.gui.displayArcs,
      crs
    ) || null;
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
      return !!o.gui.geographic && !isFrameMapLayer(o);
    });
  }

  function isFrameMapLayer(lyr) {
    var dataset = lyr && lyr.gui && lyr.gui.source && lyr.gui.source.dataset;
    return !!dataset && internal.isFrameLayer(lyr, dataset.arcs);
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
    _ext.setFrameData(isPreviewView() ? getFrameLayerData() : null);
    if (layersMayHaveChanged) {
      // kludge to handle layer visibility toggling
      updateFullBounds();
      updateLayerStyles(contentLayers);
      updateLayerStackOrder(model.getLayers());// update menu_order property of all layers
    }
    sortMapLayers(contentLayers);
    if (_intersectionLyr) {
      contentLayers = contentLayers.concat(_intersectionLyr);
    }
    if (_compareLyr) {
      // draw the comparison overlay on top of everything else
      contentLayers = contentLayers.concat(_compareLyr);
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
    if (!_overlayLayers || action != 'nav' || getGlobalStyleOptions().interactionMode == 'label_style') {
      // cache layers to use when panning/zooming
      _overlayLayers = getOverlayLayers(_activeLyr, _hit.getHitState(), getGlobalStyleOptions());
    }
    _renderer.drawOverlayLayers(_overlayLayers, action);

    // TODO: draw furniture
    // _renderer.drawFurnitureLayers(furnitureLayers, action);
    // The action says how much was redrawn, which a listener rebuilding its own
    // DOM overlays needs: a 'hover' draw leaves the SVG markup and its
    // transforms alone, so anything anchored to them is still good.
    gui.dispatchEvent('map_rendered', {action: action});
  }
}

