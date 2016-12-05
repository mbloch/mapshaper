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
  if (!prevBounds) return true;
  if (prevBounds.xmin === 0 || newBounds.xmin === 0) return true; // kludge to handle tables
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
      _ext = new MapExtent(_layers),
      _mouse = new MouseArea(_layers.node()),
      _nav = new MapNav(_root, _ext, _mouse),
      _inspector = new InspectionControl(model, new HitControl(_ext, _mouse));

  var _activeCanv = new DisplayCanvas().appendTo(_layers), // data layer shapes
      _overlayCanv = new DisplayCanvas().appendTo(_layers), // hover and selection shapes
      _annotationCanv = new DisplayCanvas().appendTo(_layers), // used for line intersections
      _annotationLyr, _annotationStyle,
      _activeLyr, _activeStyle, _overlayStyle;

  _ext.on('change', drawLayers);

  _inspector.on('change', function(e) {
    var lyr = _activeLyr.getDisplayLayer().layer;
    _overlayStyle = MapStyle.getOverlayStyle(lyr, e);
    drawLayer(_activeLyr, _overlayCanv, _overlayStyle);
  });

  model.on('select', function(e) {
    _annotationStyle = null;
    _overlayStyle = null;
  });

  model.on('update', function(e) {
    var prevBounds = _activeLyr ?_activeLyr.getBounds() : null,
        needReset = false;
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
    needReset = gui.mapNeedsReset(_activeLyr.getBounds(), prevBounds, _ext.getBounds());
    _ext.setBounds(_activeLyr.getBounds()); // update map extent to match bounds of active group
    if (needReset) {
      // zoom to full view of the active layer and redraw
      _ext.reset(true);
    } else {
      // refresh without navigating
      drawLayers();
    }
  });

  this.setHighlightLayer = function(lyr, dataset) {
    if (lyr) {
      _annotationLyr = new DisplayLayer(lyr, dataset, _ext);
      _annotationStyle = MapStyle.getHighlightStyle(lyr);
      drawLayer(_annotationLyr, _annotationCanv, _annotationStyle);
    } else {
      _annotationStyle = null;
      _annotationLyr = null;
    }
  };

  // lightweight way to update simplification of display lines
  // TODO: consider handling this as a model update
  this.setSimplifyPct = function(pct) {
    _activeLyr.setRetainedPct(pct);
    drawLayers();
  };

  function initActiveLayer(o) {
    var lyr = new DisplayLayer(o.layer, o.dataset, _ext);
    _inspector.updateLayer(lyr);
    _activeStyle = MapStyle.getActiveStyle(lyr.getDisplayLayer().layer);
    lyr.updateStyle(_activeStyle);
    return lyr;
  }

  // Test if an update may have affected the visible shape of arcs
  // @flags Flags from update event
  function arcsMayHaveChanged(flags) {
    return flags.presimplify || flags.simplify || flags.proj ||
        flags.arc_count || flags.repair || flags.clip || flags.erase || flags.slice || false;
  }

  function drawLayers() {
    drawLayer(_activeLyr, _overlayCanv, _overlayStyle);
    drawLayer(_activeLyr, _activeCanv, _activeStyle);
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
