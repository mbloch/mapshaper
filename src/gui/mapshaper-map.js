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
      _annotationLyr, _annotationStyle,
      _referenceLyr, _referenceStyle,
      _activeLyr, _activeStyle, _overlayStyle,
      _ext, _inspector;

  model.on('select', function(e) {
    _annotationStyle = null;
    _overlayStyle = null;

    // if reference layer is newly selected, and (old) active layer is usable,
    // make active layer the reference layer.
    // this must run before 'update' event, so layer menu is updated correctly
    if (_referenceLyr && _referenceLyr.getLayer() == e.layer && _activeLyr &&
        internal.layerHasGeometry(_activeLyr.getLayer())) {
      updateReferenceLayer(_activeLyr);
    }
  });

  // Refresh map display in response to data changes, layer selection, etc.
  model.on('update', function(e) {
    var prevLyr = _activeLyr || null,
        needReset = false;

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
      needReset = true;
    } else if (isTableLayer(prevLyr) || isTableLayer(_activeLyr)) {
      needReset = true;
    } else {
      needReset = gui.mapNeedsReset(_activeLyr.getBounds(), prevLyr.getBounds(), _ext.getBounds());
    }

    // set 'home' extent to match bounds of active group
    _ext.setBounds(_activeLyr.getBounds());

    if (needReset) {
      // zoom to full view of the active layer and redraw
      _ext.reset(true);
    } else {
      // refresh without navigating
      drawLayers();
    }
  });

  this.getReferenceLayer = function() {
    return _referenceLyr ? _referenceLyr.getLayer() : null;
  };

  this.setReferenceLayer = function(lyr, dataset) {
    if (lyr && internal.layerHasGeometry(lyr)) {
      updateReferenceLayer(new DisplayLayer(lyr, dataset, _ext));
    } else if (_referenceLyr) {
      updateReferenceLayer(null);
    }
    drawLayers(); // draw all layers (reference layer can change how active layer is drawn)
  };

  // Currently used to show dots at line intersections
  this.setHighlightLayer = function(lyr, dataset) {
    if (lyr) {
      _annotationLyr = new DisplayLayer(lyr, dataset, _ext);
      _annotationStyle = MapStyle.getHighlightStyle(lyr);
    } else {
      _annotationStyle = null;
      _annotationLyr = null;
    }
    _stack.drawAnnotationLayer(_annotationLyr, _annotationStyle); // also hides
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
    // var mouse = new MouseArea(_root.node(), position);
    var ext = new MapExtent(position);
    var nav = new MapNav(_root, ext, mouse);
    var inspector = new InspectionControl(model, new HitControl(ext, mouse));
    ext.on('change', function() {drawLayers(true);});
    inspector.on('change', function(e) {
      var lyr = _activeLyr.getDisplayLayer().layer;
      _overlayStyle = MapStyle.getOverlayStyle(lyr, e);
      _stack.drawOverlayLayer(_activeLyr, _overlayStyle);
    });
    inspector.on('data_change', function(e) {
      // refresh the display if a style variable has been changed
      // TODO: consider only updating the affected symbol (might make sense for labels)
      if (internal.isSupportedSvgProperty(e.field)) {
        _stack.drawActiveLayer(_activeLyr, _activeStyle);
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

  function updateReferenceLayer(lyr) {
    _referenceLyr = lyr;
    _referenceStyle = lyr ? MapStyle.getReferenceStyle(lyr.getLayer()) : null;
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

  function referenceStyle() {
    return referenceLayerVisible() ? _referenceStyle : null;
  }

  function activeStyle() {
    var style = _activeStyle;
    if (referenceLayerVisible() && _activeStyle.type != 'styled') {
      style = utils.defaults({
        // kludge to hide ghosted layers
        strokeColors: [null, _activeStyle.strokeColors[1]]
      }, _activeStyle);
    }
    return style;
  }

  // onlyNav (bool): only map extent has changed, symbols are unchanged
  function drawLayers(onlyNav) {
    // draw reference shapes from second layer
    _stack.drawReferenceLayer(_referenceLyr, referenceStyle());
    // draw intersection dots
    _stack.drawAnnotationLayer(_annotationLyr, _annotationStyle);
    // draw hover & selection effects
    _stack.drawOverlayLayer(_activeLyr, _overlayStyle);
    // draw currently active layer
    _stack.drawActiveLayer(_activeLyr, _activeStyle, onlyNav);
  }

}

utils.inherit(MshpMap, EventDispatcher);
