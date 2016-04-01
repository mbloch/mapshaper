/* @requires
mapshaper-gui-lib
mapshaper-maplayer
mapshaper-map-nav
mapshaper-map-extent
mapshaper-hit-control
mapshaper-info-control
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
      _hit = new HitControl(_ext, _mouse),
      _info = new InfoControl(model, _hit);

  var _activeCanv = new DisplayCanvas().appendTo(_layers),
      _hoverCanv = new DisplayCanvas().appendTo(_layers),
      _highCanv = new DisplayCanvas().addClass('highlight-layer').appendTo(_layers),
      _highLyr, _activeLyr, _highStyle, _activeStyle, _hoverStyle;

  _ext.on('change', drawLayers);

  _hit.on('change', function(e) {
    var lyr = _activeLyr.getDisplayLayer().layer;
    _hoverStyle = null;
    if (e.id >= 0) {
      _hoverStyle = e.pinned ? MapStyle.getSelectionStyle(lyr, [e.id]) :
        MapStyle.getHoverStyle(lyr, [e.id]);
    }
    drawLayer(_activeLyr, _hoverCanv, _hoverStyle);
  });

  model.on('select', function(e) {
    _highStyle = null;
    _hoverStyle = null;
  });

  model.on('update', function(e) {
    var prevBounds = _activeLyr ?_activeLyr.getBounds() : null,
        needReset = false,
        displayLyr = initActiveLayer(e);

    if (arcsMayHaveChanged(e.flags)) {
      // update filtered arcs when simplification thresholds are calculated
      // or arcs are updated
      delete e.dataset.filteredArcs;

      // reset simplification after projection (thresholds have changed)
      // TODO: reset is not needed if -simplify command is run after -proj
      if (e.flags.proj && e.dataset.arcs) {
        displayLyr.setRetainedPct(1);
      }
    }
    _activeLyr = displayLyr;
    needReset = gui.mapNeedsReset(displayLyr.getBounds(), prevBounds, _ext.getBounds());
    _ext.setBounds(displayLyr.getBounds()); // update map extent to match bounds of active group
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
      _highLyr = new DisplayLayer(lyr, dataset);
      _highStyle = MapStyle.getHighlightStyle();
      // _highLyr.setStyle(highStyle);
      // refreshLayer(_highGroup);
      drawLayer(_highLyr, _highCanv, _highStyle);
    } else {
      _highStyle = null;
      _highLyr = null;
    }
  };

  // lightweight way to update simplification of display lines
  // TODO: consider handling this as a model update
  this.setSimplifyPct = function(pct) {
    _activeLyr.setRetainedPct(pct);
    drawLayers();
  };

  function initActiveLayer(o) {
    var lyr = new DisplayLayer(o.layer, o.dataset);
    _hit.update(lyr.getDisplayLayer(_ext));
    _activeStyle = MapStyle.getOutlineStyle(o.layer);
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
    drawLayer(_activeLyr, _hoverCanv, _hoverStyle);
    drawLayer(_activeLyr, _activeCanv, _activeStyle);
    drawLayer(_highLyr, _highCanv, _highStyle);
  }

  function drawLayer(lyr, canv, style) {
    if (style) {
      canv.prep(_ext);
      lyr.draw(canv, style, _ext);
    } else {
      canv.hide();
    }

  }
}

utils.inherit(MshpMap, EventDispatcher);
