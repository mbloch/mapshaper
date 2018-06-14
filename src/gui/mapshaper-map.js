/* @requires
mapshaper-gui-lib
mapshaper-maplayer
mapshaper-map-nav
mapshaper-map-extent
mapshaper-hit-control
mapshaper-inspection-control
mapshaper-map-style
mapshaper-svg-display
mapshaper-layer-stack
*/

// Test if map should be re-framed to show updated layer
gui.mapNeedsReset = function(newBounds, prevBounds, mapBounds) {
  var viewportPct = gui.getIntersectionPct(newBounds, mapBounds);
  var contentPct = gui.getIntersectionPct(mapBounds, newBounds);
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
gui.getBoundsIntersection = function(a, b) {
  var c = new Bounds();
  if (a.intersects(b)) {
    c.setBounds(Math.max(a.xmin, b.xmin), Math.max(a.ymin, b.ymin),
    Math.min(a.xmax, b.xmax), Math.min(a.ymax, b.ymax));
  }
  return c;
};

// Returns proportion of bb2 occupied by bb1
gui.getIntersectionPct = function(bb1, bb2) {
  return gui.getBoundsIntersection(bb1, bb2).area() / bb2.area() || 0;
};

function MshpMap(model) {
  var _root = El('#mshp-main-map'),
      _stack = new LayerStack(),
      _referenceLayers = [],
      _intersectionLyr, _intersectionStyle,
      _activeLyr, _activeStyle, _overlayStyle,
      _needReset = false,
      _ext, _inspector;

  model.on('select', function(e) {
    _intersectionStyle = null;
    _overlayStyle = null;
  });

  // Refresh map display in response to data changes, layer selection, etc.
  model.on('update', function(e) {
    var prevLyr = _activeLyr || null;

    if (!prevLyr) {
      initMap(); // wait until first layer is added to init map extent, resize events, etc.
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

    _activeLyr = new DisplayLayer(e.layer, e.dataset, _ext);
    _activeStyle = MapStyle.getActiveStyle(_activeLyr.getDisplayLayer().layer);
    _inspector.updateLayer(_activeLyr, _activeStyle);

    if (!prevLyr) {
      _needReset = true;
    } else if (isTableLayer(prevLyr) || isTableLayer(_activeLyr)) {
      _needReset = true;
    } else {
      _needReset = gui.mapNeedsReset(_activeLyr.getBounds(), prevLyr.getBounds(), _ext.getBounds());
    }

    // set 'home' extent to match bounds of active group
    _ext.setBounds(_activeLyr.getBounds());

    if (_needReset) {
      // zoom to full view of the active layer and redraw
      _ext.reset(true);
    } else {
      // refresh without navigating
      drawLayers();
    }
  });

  // Currently used to show dots at line intersections
  this.setIntersectionLayer = function(lyr, dataset) {
    if (lyr) {
      _intersectionLyr = new DisplayLayer(lyr, dataset, _ext);
      _intersectionStyle = MapStyle.getIntersectionStyle(lyr);
    } else {
      _intersectionStyle = null;
      _intersectionLyr = null;
    }
    _stack.drawOverlay2Layer(_intersectionLyr, _intersectionStyle); // also hides
  };

  // lightweight way to update simplification of display lines
  // TODO: consider handling this as a model update
  this.setSimplifyPct = function(pct) {
    _activeLyr.setRetainedPct(pct);
    drawLayers();
  };

  function initMap() {
    // TODO: simplify these tangled dependencies
    var position = new ElementPosition(_stack);
    var mouse = new MouseArea(_stack.node(), position);
    var ext = new MapExtent(position);
    var nav = new MapNav(_root, ext, mouse);
    var inspector = new InspectionControl(model, new HitControl(ext, mouse));

    ext.on('change', function() {
      drawLayers(!_needReset);
      _needReset = false;
    });
    inspector.on('change', function(e) {
      var lyr = _activeLyr.getDisplayLayer().layer;
      _overlayStyle = MapStyle.getOverlayStyle(lyr, e);
      _stack.drawOverlayLayer(_activeLyr, _overlayStyle);
    });
    inspector.on('data_change', function(e) {
      // refresh the display if a style variable has been changed interactively
      if (internal.isSupportedSvgProperty(e.field)) {
        drawLayers();
      }
    });
    gui.on('resize', function() {
      position.update(); // kludge to detect new map size after console toggle
    });
    _stack.init(ext, mouse);
    // export objects that are referenced by other functions
    _inspector = inspector;
    _ext = ext;
  }

  function isTableLayer(displayLyr) {
    return !displayLyr.getLayer().geometry_type; // kludge
  }

  function referenceLayerVisible() {
    if (!_referenceLyr ||
        // don't show if same as active layer
        _activeLyr && _activeLyr.getLayer() == _referenceLyr.getLayer() ||
        // or if active layer isn't geographic (kludge)
        _activeLyr && !internal.layerHasGeometry(_activeLyr.getLayer())) {
      return false;
    }
    return true;
  }

  // Test if an update may have affected the visible shape of arcs
  // @flags Flags from update event
  function arcsMayHaveChanged(flags) {
    return flags.simplify_method || flags.simplify || flags.proj ||
      flags.arc_count || flags.repair || flags.clip || flags.erase ||
      flags.slice || flags.affine || false;
  }

  // Remove layers that have been deleted from the catalog
  function updateReferenceLayers() {
    _referenceLayers = _referenceLayers.filter(function(o) {
      return !!model.findLayer(o.getLayer());
    });
  }

  this.isActiveLayer = function(lyr) {
    return lyr == _activeLyr.getLayer();
  };

  this.isReferenceLayer = function(lyr) {
    return _referenceLayers.filter(function(o) {
      return o.getLayer() == lyr;
    }).length > 0;
  };

  this.removeReferenceLayer = function(lyr) {
    _referenceLayers = _referenceLayers.filter(function(o) {
      return o.getLayer() != lyr;
    });
  };

  this.addReferenceLayer = function(lyr, dataset) {
    if (this.isReferenceLayer(lyr)) return;
    if (lyr && internal.layerHasGeometry(lyr)) {
      _referenceLayers.push(new DisplayLayer(lyr, dataset, _ext));
    }
  };

  this.redraw = drawLayers;

  function getDrawableLayers() {
    // delete any layers that have been dropped from the catalog
    updateReferenceLayers();
    if (isTableLayer(_activeLyr)) {
      return [_activeLyr]; // no reference layers if active layer is displayed as a table
    }
    // concat active and reference layers, excluding dupes
    return [_activeLyr].concat(_referenceLayers.filter(function(o) {
      return o.getLayer() != _activeLyr.getLayer() && !isTableLayer(o);
    }));
  }

  function updateLayerStyles(layers) {
    layers.forEach(function(o, i) {
      var lyr = o.getLayer();
      var style;
      if (!lyr.display) lyr.display = {};
      if (i === 0) {
        // active style (assume first layer is the active layer)
        style = _activeStyle;
        if (style.type != 'styled' && layers.length > 0 && _activeStyle.strokeColors) {
          // kludge to hide ghosted layers when reference layers are present
          style = utils.defaults({
            strokeColors: [null, _activeStyle.strokeColors[1]]
          }, style);
        }
        // add data for the renderer in layer-stack to use
        lyr.display.active = true;
        lyr.display.canvas = true;
        lyr.display.svg = internal.layerHasLabels(lyr);
      } else {
        // reference style
        lyr.display.active = false;
        lyr.display.canvas = true;
        lyr.display.svg = false; // TODO: display labels on reference layers too
        style = MapStyle.getReferenceStyle(lyr);
      }
      lyr.display.style = style;
    });
  }

  // onlyNav (bool): only map extent has changed, symbols are unchanged
  function drawLayers(onlyNav) {
    // draw active and reference layers
    var layers = getDrawableLayers();
    if (!onlyNav) updateLayerStyles(layers);
    _stack.drawLayers(layers, onlyNav);
    // draw intersection dots
    _stack.drawOverlay2Layer(_intersectionLyr, _intersectionStyle);
    // draw hover & selection effects
    _stack.drawOverlayLayer(_activeLyr, _overlayStyle);
  }
}

utils.inherit(MshpMap, EventDispatcher);
