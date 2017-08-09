/* @requires
mapshaper-gui-lib
mapshaper-maplayer
mapshaper-map-nav
mapshaper-map-extent
mapshaper-hit-control
mapshaper-inspection-control
mapshaper-map-style
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
      _layers = El('#map-layers'),
      _referenceCanv = new DisplayCanvas().appendTo(_layers), // comparison layer
      _activeCanv = new DisplayCanvas().appendTo(_layers),    // data layer shapes
      _overlayCanv = new DisplayCanvas().appendTo(_layers),   // hover and selection shapes
      _annotationCanv = new DisplayCanvas().appendTo(_layers), // line intersection dots
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

  model.on('update', function(e) {
    var prevLyr = _activeLyr || null,
        needReset = false;

    if (!prevLyr) {
      initMap(); // wait until first layer is added to init map extent, resize events, etc.
    }

    if (arcsMayHaveChanged(e.flags)) {
      // regenerate filtered arcs when simplification thresholds are calculated
      // or arcs are updated
      delete e.dataset.filteredArcs;

      // reset simplification after projection (thresholds have changed)
      // TODO: preserve simplification pct (need to record pct before change)
      if (e.flags.proj && e.dataset.arcs) {
        e.dataset.arcs.setRetainedPct(1);
      }
    }

    _activeLyr = initActiveLayer(e);
    if (!prevLyr) {
      needReset = true;
    } else if (isTableLayer(prevLyr) || isTableLayer(_activeLyr)) {
      needReset = true;
    } else {
      needReset = gui.mapNeedsReset(_activeLyr.getBounds(), prevLyr.getBounds(), _ext.getBounds());
    }
    _ext.setBounds(_activeLyr.getBounds()); // update map extent to match bounds of active group
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
    drawLayer(_annotationLyr, _annotationCanv, _annotationStyle); // also hides
  };

  // lightweight way to update simplification of display lines
  // TODO: consider handling this as a model update
  this.setSimplifyPct = function(pct) {
    _activeLyr.setRetainedPct(pct);
    drawLayers();
  };

  function initMap() {
    var position = new ElementPosition(_layers);
    var mouse = new MouseArea(_layers.node(), position);
    // var mouse = new MouseArea(_root.node(), position);
    var ext = new MapExtent(position);
    var nav = new MapNav(_root, ext, mouse);
    var inspector = new InspectionControl(model, new HitControl(ext, mouse));
    ext.on('change', drawLayers);
    inspector.on('change', function(e) {
      var lyr = _activeLyr.getDisplayLayer().layer;
      _overlayStyle = MapStyle.getOverlayStyle(lyr, e);
      drawLayer(_activeLyr, _overlayCanv, _overlayStyle);
    });
    gui.on('resize', function() {
      position.update(); // kludge to detect new map size after console toggle
    });
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

  function initActiveLayer(o) {
    var lyr = new DisplayLayer(o.layer, o.dataset, _ext);
    _activeStyle = MapStyle.getActiveStyle(lyr.getDisplayLayer().layer);
    _inspector.updateLayer(lyr, _activeStyle);
    return lyr;
  }

  // Test if an update may have affected the visible shape of arcs
  // @flags Flags from update event
  function arcsMayHaveChanged(flags) {
    return flags.presimplify || flags.simplify || flags.proj ||
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

  function drawLayers() {
    // TODO: consider drawing active and reference layers to the same canvas
    drawLayer(_referenceLyr, _referenceCanv, referenceStyle());
    drawLayer(_activeLyr, _overlayCanv, _overlayStyle);
    drawLayer(_activeLyr, _activeCanv, activeStyle());
    drawLayer(_annotationLyr, _annotationCanv, _annotationStyle);
  }

  function drawLayer(lyr, canv, style) {
    if (style) {
      canv.prep(_ext);
      lyr.draw(canv, style);
    } else {
      canv.hide();
    }

  }
}

utils.inherit(MshpMap, EventDispatcher);
