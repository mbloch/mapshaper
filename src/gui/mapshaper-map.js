/* @requires
mapshaper-gui-lib
mapshaper-maplayer2
mapshaper-map-nav
mapshaper-map-extent
mapshaper-inspection-control
mapshaper-sidebar-buttons
mapshaper-map-style
mapshaper-svg-display
mapshaper-layer-stack
mapshaper-layer-sorting
mapshaper-gui-proxy
*/

utils.inherit(MshpMap, EventDispatcher);

function MshpMap(gui, opts) {
  var el = gui.container.findChild('.map-layers').node(),
      position = new ElementPosition(el),
      model = gui.model,
      map = this,
      buttons = new SidebarButtons(gui),
      _mouse = new MouseArea(el, position),
      _ext = new MapExtent(position),
      _visibleLayers = [], // cached visible map layers
      _fullBounds = null,
      _intersectionLyr, _activeLyr, _overlayLyr,
      _inspector, _stack, _nav, _hit;

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

  // Refresh map display in response to data changes, layer selection, etc.
  model.on('update', function(e) {
    var prevLyr = _activeLyr || null;
    var fullBounds;
    var needReset;

    if (!prevLyr) {
      initMap(); // init map extent, resize events, etc. on first call
    }

    if (arcsMayHaveChanged(e.flags)) {
      // regenerate filtered arcs the next time they are needed for rendering
      delete e.dataset.filteredArcs;

      // reset simplification after projection (thresholds have changed)
      // TODO: preserve simplification pct (need to record pct before change)
      if (e.flags.proj && e.dataset.arcs) {
        e.dataset.arcs.setRetainedPct(1);
      }
    }

    if (e.flags.simplify_method) { // no redraw needed
      return false;
    }

    if (e.flags.simplify_amount) { // only redraw (slider drag)
      drawLayers();
      return;
    }

    _activeLyr = getMapLayer(e.layer, e.dataset);
    _activeLyr.style = MapStyle.getActiveStyle(_activeLyr.layer);
    _activeLyr.active = true;
    if (_inspector) _inspector.updateLayer(_activeLyr);
    updateVisibleMapLayers();
    fullBounds = getFullBounds();

    if (!prevLyr || !_fullBounds || prevLyr.tabular || _activeLyr.tabular || isFrameView()) {
      needReset = true;
    } else {
      needReset = GUI.mapNeedsReset(fullBounds, _fullBounds, _ext.getBounds());
    }

    if (isFrameView()) {
      _nav.setZoomFactor(0.05); // slow zooming way down to allow fine-tuning frame placement // 0.03
      _ext.setFrame(getFullBounds()); // TODO: remove redundancy with drawLayers()
      needReset = true; // snap to frame extent
    } else {
      _nav.setZoomFactor(1);
    }
    _ext.setBounds(fullBounds); // update 'home' button extent
    _fullBounds = fullBounds;
    if (needReset) {
      _ext.reset();
    }
    drawLayers();
  });

  // Currently used to show dots at line intersections
  this.setIntersectionLayer = function(lyr, dataset) {
    if (lyr) {
      _intersectionLyr = getMapLayer(lyr, dataset);
      _intersectionLyr.style = MapStyle.getIntersectionStyle(_intersectionLyr.layer);
    } else {
      _intersectionLyr = null;
    }
    _stack.drawOverlay2Layer(_intersectionLyr); // also hides
  };

  this.setInteractivity = function(toOn) {

  };

  this.setLayerVisibility = function(target, isVisible) {
    var lyr = target.layer;
    lyr.visibility = isVisible ? 'visible' : 'hidden';
    if (_inspector && isActiveLayer(lyr)) {
      _inspector.updateLayer(isVisible ? _activeLyr : null);
    }
  };

  this.getExtent = function() {return _ext;};
  this.isActiveLayer = isActiveLayer;
  this.isVisibleLayer = isVisibleLayer;

  // called by layer menu after layer visibility is updated
  this.redraw = function() {
    updateVisibleMapLayers();
    drawLayers();
  };

  this.addSidebarButton = buttons.addButton;

  function initMap() {
    _ext.resize();
    _nav = new MapNav(gui, _ext, _mouse);
    _stack = new LayerStack(gui, el, _ext, _mouse);
    _hit = new HitControl(gui, _ext, _mouse);

    _ext.on('change', function(e) {
      if (e.reset) return; // don't need to redraw map here if extent has been reset
      if (isFrameView()) {
        updateFrameExtent();
      }
      drawLayers(true);
    });

    if (opts.inspector) {
      _inspector = new InspectionControl(gui, _ext, _hit);
      _inspector.on('change', function(e) {
        _overlayLyr = getMapLayerOverlay(_activeLyr, e);
        _stack.drawOverlayLayer(_overlayLyr);
      });
      _inspector.on('data_change', function(e) {
        // refresh the display if a style variable has been changed interactively
        if (internal.isSupportedSvgProperty(e.field)) {
          drawLayers();
        }
      });
    }

    gui.on('resize', function() {
      position.update(); // kludge to detect new map size after console toggle
    });
  }

  // Test if an update may have affected the visible shape of arcs
  // @flags Flags from update event
  function arcsMayHaveChanged(flags) {
    return flags.simplify_method || flags.simplify || flags.proj ||
      flags.arc_count || flags.repair || flags.clip || flags.erase ||
      flags.slice || flags.affine || flags.rectangle || false;
  }

  // Update map frame after user navigates the map in frame edit mode
  function updateFrameExtent() {
    var frameLyr = internal.findFrameLayer(model);
    var rec = frameLyr.data.getRecordAt(0);
    var viewBounds = _ext.getBounds();
    var w = viewBounds.width() * rec.width / _ext.width();
    var h = w * rec.height / rec.width;
    var cx = viewBounds.centerX();
    var cy = viewBounds.centerY();
    rec.bbox = [cx - w/2, cy - h/2, cx + w/2, cy + h/2];
    _ext.setFrame(getFrameData());
    _ext.setBounds(new Bounds(rec.bbox));
    _ext.reset();
  }

  function getFullBounds() {
    var b = new Bounds();
    if (isPreviewView()) {
      return internal.getFrameLayerBounds(internal.findFrameLayer(model));
    }
    getDrawableContentLayers().forEach(function(lyr) {
      b.mergeBounds(lyr.bounds);
    });
    return b;
  }

  function isActiveLayer(lyr) {
    return _activeLyr && lyr == _activeLyr.source.layer || false;
  }

  function isVisibleLayer(lyr) {
    if (isActiveLayer(lyr)) {
      return lyr.visibility != 'hidden';
    }
    return lyr.visibility == 'visible';
  }

  function isVisibleDataLayer(lyr) {
    return isVisibleLayer(lyr) && !internal.isFurnitureLayer(lyr);
  }

  function isFrameLayer(lyr) {
    return !!(lyr && lyr == internal.findFrameLayer(model));
  }

  function isTableView() {
    return !isPreviewView() && !!_activeLyr.tabular;
  }

  function isPreviewView() {
    var frameLyr = internal.findFrameLayer(model);
    return !!frameLyr; //  && isVisibleLayer(frameLyr)
  }

  // Frame view means frame layer is visible and active (selected)
  function isFrameView() {
    var frameLyr = internal.findFrameLayer(model);
    return isActiveLayer(frameLyr) && isVisibleLayer(frameLyr);
  }

  function getFrameData() {
    var frameLyr = internal.findFrameLayer(model);
    return frameLyr && internal.getFurnitureLayerData(frameLyr) || null;
  }

  function updateVisibleMapLayers() {
    var layers = [];
    model.getLayers().forEach(function(o) {
      if (!isVisibleLayer(o.layer)) return;
      if (isActiveLayer(o.layer)) {
        layers.push(_activeLyr);
      } else if (!isTableView()) {
        layers.push(getMapLayer(o.layer, o.dataset));
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

  function getDrawableContentLayers() {
    var layers = getVisibleMapLayers();
    if (isTableView()) return findActiveLayer(layers);
    return layers.filter(function(o) {
      return !!o.geographic;
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
        // style is already assigned
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
        mapLayer.style = MapStyle.getReferenceStyle(mapLayer.layer);
      }
    });
  }

  function sortMapLayers(layers) {
    layers.sort(function(a, b) {
      // assume that each layer has a stack_id (assigned by updateLayerStackOrder())
      return a.source.layer.stack_id - b.source.layer.stack_id;
    });
  }

  // onlyNav (bool): only map extent has changed, symbols are unchanged
  function drawLayers(onlyNav) {
    var contentLayers = getDrawableContentLayers();
    var furnitureLayers = getDrawableFurnitureLayers();
    if (!(_ext.width() > 0 && _ext.height() > 0)) {
      // TODO: track down source of these errors
      console.error("[drawLayers()] Collapsed map container, unable to draw.");
      return;
    }
    if (!onlyNav) {
       // kludge to handle layer visibility toggling
      _ext.setFrame(isPreviewView() ? getFrameData() : null);
      _ext.setBounds(getFullBounds());
      updateLayerStyles(contentLayers);
      // update stack_id property of all layers
      internal.updateLayerStackOrder(model.getLayers());
    }
    sortMapLayers(contentLayers);
    _stack.drawContentLayers(contentLayers, onlyNav);
    // draw intersection dots
    _stack.drawOverlay2Layer(_intersectionLyr);
    // draw hover & selection effects
    _stack.drawOverlayLayer(_overlayLyr);
    // _stack.drawFurnitureLayers(furnitureLayers, onlyNav);
    _stack.drawFurnitureLayers(furnitureLayers); // re-render on nav, because scalebars
  }
}

function getMapLayerOverlay(obj, e) {
  var style = MapStyle.getOverlayStyle(obj.layer, e);
  if (!style) return null;
  return utils.defaults({
    layer: filterLayerByIds(obj.layer, style.ids),
    style: style
  }, obj);
}

function filterLayerByIds(lyr, ids) {
  if (lyr.shapes) {
    shapes = ids.map(function(id) {
      return lyr.shapes[id];
    });
    return utils.defaults({shapes: shapes}, lyr);
  }
  return lyr;
}

// Test if map should be re-framed to show updated layer
GUI.mapNeedsReset = function(newBounds, prevBounds, mapBounds) {
  var viewportPct = GUI.getIntersectionPct(newBounds, mapBounds);
  var contentPct = GUI.getIntersectionPct(mapBounds, newBounds);
  var boundsChanged = !prevBounds.equals(newBounds);
  var inView = newBounds.intersects(mapBounds);
  var areaChg = newBounds.area() / prevBounds.area();
  if (!boundsChanged) return false; // don't reset if layer extent hasn't changed
  if (!inView) return true; // reset if layer is out-of-view
  if (viewportPct < 0.3 && contentPct < 0.9) return true; // reset if content is mostly offscreen
  if (areaChg > 1e8 || areaChg < 1e-8) return true; // large area chg, e.g. after projection
  return false;
};

// TODO: move to utilities file
GUI.getBoundsIntersection = function(a, b) {
  var c = new Bounds();
  if (a.intersects(b)) {
    c.setBounds(Math.max(a.xmin, b.xmin), Math.max(a.ymin, b.ymin),
    Math.min(a.xmax, b.xmax), Math.min(a.ymax, b.ymax));
  }
  return c;
};

// Returns proportion of bb2 occupied by bb1
GUI.getIntersectionPct = function(bb1, bb2) {
  return GUI.getBoundsIntersection(bb1, bb2).area() / bb2.area() || 0;
};
