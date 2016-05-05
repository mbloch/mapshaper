/* @requires
mapshaper-gui-lib
mapshaper-maplayer
mapshaper-map-nav
mapshaper-map-extent
mapshaper-hit-control
mapshaper-inspection-control
mapshaper-map-style
*/

MapShaper.getBoundsOverlap = function(bb1, bb2) {
  var area = 0;
  if (bb1.intersects(bb2)) {
    area = (Math.min(bb1.xmax, bb2.xmax) - Math.max(bb1.xmin, bb2.xmin)) *
      (Math.min(bb1.ymax, bb2.ymax) - Math.max(bb1.ymin, bb2.ymin));
  }
  return area;
};

// Test if map should be re-framed to show updated layer
gui.mapNeedsReset = function(newBounds, prevBounds, mapBounds) {
  if (!prevBounds) return true;
  if (prevBounds.xmin === 0 || newBounds.xmin === 0) return true; // kludge to handle tables
  // TODO: consider similarity of prev and next bounds
  //var overlapPct = 2 * MapShaper.getBoundsOverlap(newBounds, prevBounds) /
  //    (newBounds.area() + prevBounds.area());
  var boundsChanged = !prevBounds.equals(newBounds);
  var intersects = newBounds.intersects(mapBounds);
  // TODO: compare only intersecting portion of layer with map bounds
  var areaRatio = newBounds.area() / mapBounds.area();
  if (!boundsChanged) return false; // don't reset if layer extent hasn't changed
  if (!intersects) return true; // reset if layer is out-of-view
  return areaRatio > 500 || areaRatio < 0.05; // reset if layer is not at a viewable scale
};

function MshpMap(model) {
  var _root = El('#mshp-main-map'),
      _layers = El('#map-layers'),
      _ext = new MapExtent(_layers),
      _mouse = new MouseArea(_layers.node()),
      _nav = new MapNav(_root, _ext, _mouse),
      _inspector = new InspectionControl(model, new HitControl(_ext, _mouse));

  var _activeCanv = new DisplayCanvas().appendTo(_layers), // data layer shapes
      _selectionCanv = new DisplayCanvas().appendTo(_layers), // selected subset
      _highlightCanv = new DisplayCanvas().appendTo(_layers), // inspected shape
      _annotationCanv = new DisplayCanvas().appendTo(_layers), // used for line intersections
      _annotationLyr, _annotationStyle,
      _activeLyr, _activeStyle, _selectionStyle, _highlightStyle;

  _ext.on('change', drawLayers);

  _inspector.on('change', function(e) {
    // issue: returns a filtered version of the layer
    var lyr = _activeLyr.getDisplayLayer().layer;
    var selection = e.selection;
    if (e.id > -1) {
      selection = utils.difference(selection, [e.id]);
    }
    _highlightStyle = null;
    _selectionStyle = null;

    if (e.id > -1) {
      _highlightStyle = MapStyle.getHoverStyle(lyr, [e.id], e.pinned);
    }
    if (selection.length > 0) {
      _selectionStyle = MapStyle.getSelectionStyle(lyr, selection);
    }
    drawLayer(_activeLyr, _selectionCanv, _selectionStyle);
    drawLayer(_activeLyr, _highlightCanv, _highlightStyle);
  });

  model.on('select', function(e) {
    _annotationStyle = null;
    _highlightStyle = null;
    _selectionStyle = null;
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
      _annotationStyle = MapStyle.getHighlightStyle();
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
    _activeStyle = MapStyle.getActiveStyle(o.layer);
    lyr.updateStyle(_activeStyle);
    return lyr;
  }

  // Test if an update may have affected the visible shape of arcs
  // @flags Flags from update event
  function arcsMayHaveChanged(flags) {
    return flags.presimplify || flags.simplify || flags.proj ||
        flags.arc_count || flags.repair;
  }

  function drawLayers() {
    drawLayer(_activeLyr, _highlightCanv, _highlightStyle);
    drawLayer(_activeLyr, _selectionCanv, _selectionStyle);
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
