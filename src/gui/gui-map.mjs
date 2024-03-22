import { HitControl } from './gui-hit-control';
import { CoordinatesDisplay } from './gui-coordinates-display';
import { MapNav } from './gui-map-nav';
import { SelectionTool } from './gui-selection-tool';
import { InspectionControl2 } from './gui-inspection-control';
import { updateLayerStackOrder, filterLayerByIds } from './gui-layer-utils';
import { mapNeedsReset, arcsMayHaveChanged, popupCanStayOpen } from './gui-map-utils';
import { initInteractiveEditing } from './gui-edit-modes';
import * as MapStyle from './gui-map-style';
import { MapExtent } from './gui-map-extent';
import { LayerRenderer } from './gui-layer-renderer';
import { BoxTool } from './gui-box-tool';
import { RectangleControl } from './gui-rectangle-control';
import { projectMapExtent, getMapboxBounds } from './gui-dynamic-crs';
import { getDisplayLayer, projectDisplayLayer } from './gui-display-layer';
import { utils, internal, Bounds } from './gui-core';
import { EventDispatcher } from './gui-events';
import { ElementPosition } from './gui-element-position';
import { MouseArea } from './gui-mouse';
import { Basemap } from './gui-basemap-control';
import { GUI } from './gui-lib';
import { getDatasetCrsInfo } from './gui-display-utils';

utils.inherit(MshpMap, EventDispatcher);

export function MshpMap(gui) {
  var opts = gui.options,
      el = gui.container.findChild('.map-layers').node(),
      position = new ElementPosition(el),
      model = gui.model,
      map = this,
      _mouse = new MouseArea(el, position),
      _ext = new MapExtent(position),
      _nav = new MapNav(gui, _ext, _mouse),
      _visibleLayers = [], // cached visible map layers
      _hit,
      _basemap,
      _intersectionLyr, _activeLyr, _overlayLyr,
      _renderer, _dynamicCRS;

  _basemap = new Basemap(gui, _ext);

  if (gui.options.showMouseCoordinates) {
    new CoordinatesDisplay(gui, _ext, _mouse);
  }
  _mouse.disable(); // wait for gui.focus() to activate mouse events

  model.on('select', function(e) {
    _intersectionLyr = null;
    _overlayLyr = null;
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


  // Update display of segment intersections
  this.setIntersectionLayer = function(lyr, dataset) {
    if (lyr == _intersectionLyr) return; // no change
    if (lyr) {
      _intersectionLyr = getDisplayLayer(lyr, dataset, getDisplayOptions());
      _intersectionLyr.style = MapStyle.getIntersectionStyle(_intersectionLyr.layer, getGlobalStyleOptions());
    } else {
      _intersectionLyr = null;
    }
    // TODO: try to avoid redrawing layers twice (in some situations)
    drawLayers();
  };

  this.setLayerPinning = function(target, pinned) {
    target.layer.pinned = !!pinned;
  };

  this.translatePixelCoords = function(x, y) {
    var p = _ext.translatePixelCoords(x, y);
    if (!_dynamicCRS) return p;
    return internal.toLngLat(p, _dynamicCRS);
  };

  this.getCenterLngLat = function() {
    var bounds = _ext.getBounds();
    var crs = this.getDisplayCRS();
    // TODO: handle case where active layer is a frame layer
    if (!bounds.hasBounds() || !crs) {
      return null;
    }
    return internal.toLngLat([bounds.centerX(), bounds.centerY()], crs);
  };

  this.getDisplayCRS = function() {
    if (!_activeLyr || !_activeLyr.geographic) return null;
    if (_activeLyr.dynamic_crs) return _activeLyr.dynamic_crs;
    var info = getDatasetCrsInfo(_activeLyr.source.dataset);
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
    if (!_activeLyr) return; // stop here if no layers have been selected

    // clear any stored FilteredArcs objects (so they will be recreated with the desired projection)
    clearAllDisplayArcs();

    // Reproject all visible map layers
    getContentLayers().forEach(function(lyr) {
      projectDisplayLayer(lyr, newCRS);
    });

    // kludge to make sure all layers have styles
    updateLayerStyles(getContentLayers());

    // Update map extent (also triggers redraw)
    projectMapExtent(_ext, oldCRS, this.getDisplayCRS(), calcFullBounds());
    updateFullBounds();
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
    var prevLyr = _activeLyr || null;
    var fullBounds;
    var needReset;

    if (!prevLyr) {
      initMap(); // first call
    }

    if (arcsMayHaveChanged(e.flags)) {
      // regenerate filtered arcs the next time they are needed for rendering
      // delete e.dataset.gui.displayArcs
      clearAllDisplayArcs();

      // reset simplification after projection (thresholds have changed)
      // TODO: preserve simplification pct (need to record pct before change)
      if (e.flags.proj && e.dataset.arcs) {
        e.dataset.arcs.setRetainedPct(1);
      }
    }

    if (e.flags.simplify_method) { // no redraw needed
      return false;
    }

    if (e.flags.simplify_amount || e.flags.redraw_only) { // only redraw (slider drag)
      drawLayers();
      return;
    }

    _activeLyr = getDisplayLayer(e.layer, e.dataset, getDisplayOptions());
    _activeLyr.style = MapStyle.getActiveLayerStyle(_activeLyr.layer, getGlobalStyleOptions());
    _activeLyr.active = true;

    if (popupCanStayOpen(e.flags)) {
      // data may have changed; if popup is open, it needs to be refreshed
      gui.dispatchEvent('popup-needs-refresh');
    } else if (_hit) {
      _hit.clearSelection();
    }
    _hit.setLayer(_activeLyr); // need this every time, to support dynamic reprojection

    updateVisibleMapLayers();
    fullBounds = calcFullBounds();

    if (!prevLyr || prevLyr.tabular || _activeLyr.tabular) {
      needReset = true;
    } else {
      needReset = mapNeedsReset(fullBounds, _ext.getFullBounds(), _ext.getBounds(), e.flags);
    }

    _ext.setFullBounds(fullBounds, getStrictBounds()); // update 'home' button extent

    if (needReset) {
      _ext.reset();
    }
    drawLayers();
    map.dispatchEvent('updated');
  }

  // Initialization just before displaying the map for the first time
  function initMap() {
    _ext.resize();
    _renderer = new LayerRenderer(gui, el, _ext, _mouse);
    gui.buttons.show();

    if (opts.inspectorControl) {
      _hit = new HitControl(gui, _ext, _mouse),
      new InspectionControl2(gui, _hit);
      new SelectionTool(gui, _ext, _hit),
      new BoxTool(gui, _ext, _nav),
      new RectangleControl(gui, _hit),
      initInteractiveEditing(gui, _ext, _hit);
      _hit.on('change', updateOverlayLayer);
    }

    _ext.on('change', function(e) {
      if (_basemap) _basemap.refresh(); // keep basemap synced up (if enabled)
      if (e.reset) return; // don't need to redraw map here if extent has been reset
      drawLayers('nav');
    });

    gui.on('resize', function() {
      position.update(); // kludge to detect new map size after console toggle
    });
  }

  function updateOverlayLayer(e) {
    var style = MapStyle.getOverlayStyle(_activeLyr.layer, e, getGlobalStyleOptions());
    if (style) {
      _overlayLyr = utils.defaults({
        layer: filterLayerByIds(_activeLyr.layer, style.ids),
        style: style
      }, _activeLyr);
    } else {
      _overlayLyr = null;
    }

    // 'hover' avoids redrawing all svg symbols when only highlight needs to refresh
    drawLayers('hover');
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
      b.mergeBounds(lyr.bounds);
    });

    if (!b.hasBounds()) {
      // assign bounds to empty layers, to prevent rendering errors downstream
      b.setBounds(0,0,0,0);
    }
    return b;
  }

  function calcFullBounds() {
    var b;
    if (isPreviewView()) {
      b = new Bounds(getFrameData().bbox);
    } else {
      b = getContentLayerBounds();
    }

    // add margin
    // use larger margin for small sizes
    var widthPx = _ext.width();
    var marginPct = widthPx < 700 && 3.5 || widthPx < 800 && 3 || 2.5;
    if (isTableView()) {
      var n = internal.getFeatureCount(_activeLyr.layer);
      marginPct = n < 5 && 20 || n < 100 && 10 || 4;
    }
    b.scale(1 + marginPct / 100 * 2);

    // Inflate display bounding box by a tiny amount (gives extent to single-point layers and collapsed shapes)
    b.padBounds(1e-4, 1e-4, 1e-4, 1e-4);

    return b;
  }

  function isActiveLayer(lyr) {
    return _activeLyr && lyr == _activeLyr.source.layer || false;
  }

  function isVisibleLayer(lyr) {
    return isActiveLayer(lyr) || lyr.pinned;
  }

  function isTableView() {
    return !!_activeLyr.tabular;
  }

  function findFrameLayer() {
    return getVisibleMapLayers().find(function(lyr) {
      return internal.isFrameLayer(lyr.layer, lyr.arcs);
    });
  }

  // Preview view: symbols are scaled based on display size of frame layer
  function isPreviewView() {
    return !isTableView() && !!getFrameData();
  }

  function getFrameData() {
    var lyr = findFrameLayer();
    return lyr && internal.getFrameLayerData(lyr.layer, lyr.arcs) || null;
  }

  function clearAllDisplayArcs() {
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
        layers.push(getDisplayLayer(o.layer, o.dataset, getDisplayOptions()));
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
      return !!o.geographic;
    });
  }

  function getDrawableContentLayers() {
    return getContentLayers().filter(function(lyr) {
      if (isActiveLayer(lyr.layer) && lyr.layer.hidden) return false;
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
      if (mapLayer.active) {
        // regenerating active style everytime, to support style change when
        // switching between outline and preview modes.
        mapLayer.style = MapStyle.getActiveLayerStyle(mapLayer.layer, getGlobalStyleOptions());
        if (mapLayer.style.type != 'styled' && layers.length > 1 && mapLayer.style.strokeColors) {
          // kludge to hide ghosted layers when reference layers are present
          // TODO: consider never showing ghosted layers (which appear after
          // commands like dissolve and filter).
          mapLayer.style = utils.defaults({
            strokeColors: [null, mapLayer.style.strokeColors[1]]
          }, mapLayer.style);
        }
      } else {
        if (mapLayer.layer == _activeLyr.layer) {
          console.error("Error: shared map layer");
        }
        mapLayer.style = MapStyle.getReferenceLayerStyle(mapLayer.layer, getGlobalStyleOptions());
      }
    });
  }

  function sortMapLayers(layers) {
    layers.sort(function(a, b) {
      // assume that each layer has a menu_order (assigned by updateLayerStackOrder())
      return a.source.layer.menu_order - b.source.layer.menu_order;
    });
  }

  function drawLayers(action) {
    // This seems to smooth out navigation and keep overlay and basemap in sync.
    requestAnimationFrame(function() {drawLayers2(action);});
  }

  // action:
  //   'nav'      map was panned/zoomed -- only map extent has changed
  //   'hover'    highlight has changed -- only refresh overlay
  //   (default)  anything could have changed
  function drawLayers2(action) {
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
      _ext.setFrameData(isPreviewView() ? getFrameData() : null);
      updateFullBounds();
      updateLayerStyles(contentLayers);
      updateLayerStackOrder(model.getLayers());// update menu_order property of all layers
    }
    sortMapLayers(contentLayers);
    if (_intersectionLyr) {
      contentLayers = contentLayers.concat(_intersectionLyr);
    }
    // RENDERING
    // draw main content layers
    _renderer.drawMainLayers(contentLayers, action);
    // draw hover & selection overlay
    _renderer.drawOverlayLayer(_overlayLyr, action);
    // draw furniture
    // _renderer.drawFurnitureLayers(furnitureLayers, action);
    gui.dispatchEvent('map_rendered');
  }
}

