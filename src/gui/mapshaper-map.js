/* @requires
mapshaper-gui-lib
mapshaper-maplayer2
mapshaper-map-nav
mapshaper-map-extent
mapshaper-inspection-control
mapshaper-map-style
mapshaper-svg-display
mapshaper-layer-stack
*/

utils.inherit(MshpMap, EventDispatcher);

function MshpMap(model) {
  var _root = El('#mshp-main-map'),
      _referenceLayers = [],
      _intersectionLyr, _activeLyr, _overlayLyr,
      _needReset = false,
      _ext, _inspector, _stack;

  model.on('select', function(e) {
    _intersectionLyr = null;
    _overlayLyr = null;
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

    _activeLyr = getMapLayer(e.layer, e.dataset);
    _activeLyr.style = MapStyle.getActiveStyle(_activeLyr.layer);
    _inspector.updateLayer(_activeLyr);

    if (!prevLyr) {
      _needReset = true;
    } else if (prevLyr.tabular || _activeLyr.tabular) {
      _needReset = true;
    } else {
      _needReset = gui.mapNeedsReset(_activeLyr.bounds, prevLyr.bounds, _ext.getBounds());
    }

    // set 'home' extent to match bounds of active group
    _ext.setBounds(_activeLyr.bounds);

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
      _intersectionLyr = getMapLayer(lyr, dataset);
      _intersectionLyr.style = MapStyle.getIntersectionStyle(_intersectionLyr.layer);
    } else {
      _intersectionLyr = null;
    }
    _stack.drawOverlay2Layer(_intersectionLyr); // also hides
  };

  function initMap() {
    var el = El('#map-layers').node();
    var position = new ElementPosition(el);
    var mouse = new MouseArea(el, position);
    _ext = new MapExtent(position);
    new MapNav(_root, _ext, mouse);
    _stack = new LayerStack(el, _ext, mouse);
    _inspector = new InspectionControl(model, _ext, mouse);


    _ext.on('change', function() {
      drawLayers(!_needReset);
      _needReset = false;
    });
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

  // Remove layers that have been deleted from the catalog
  function updateReferenceLayers() {
    _referenceLayers = _referenceLayers.filter(function(o) {
      return !!model.findLayer(o.source.layer);
    });
  }

  this.isActiveLayer = function(lyr) {
    return lyr == _activeLyr.source.layer;
  };

  this.isReferenceLayer = function(lyr) {
    return _referenceLayers.filter(function(o) {
      return o.source.layer == lyr;
    }).length > 0;
  };

  this.removeReferenceLayer = function(lyr) {
    _referenceLayers = _referenceLayers.filter(function(o) {
      return o.source.layer != lyr;
    });
  };

  this.addReferenceLayer = function(lyr, dataset) {
    if (this.isReferenceLayer(lyr)) return;
    if (lyr && internal.layerHasGeometry(lyr)) {
      _referenceLayers.push(getMapLayer(lyr, dataset));
    }
  };

  this.redraw = drawLayers;

  function getDrawableLayers() {
    // delete any layers that have been dropped from the catalog
    updateReferenceLayers();
    if (_activeLyr.tabular) {
       // don't show reference layers if active layer is displayed as a table
      return [_activeLyr];
    }
    // concat active and reference layers, excluding dupes
    return [_activeLyr].concat(_referenceLayers.filter(function(o) {
      return o.source.layer != _activeLyr.source.layer && o.geographic;
    }));
  }

  function updateLayerStyles(layers) {
    layers.forEach(function(mapLayer, i) {
      if (i === 0) {
        if (mapLayer.style.type != 'styled' && layers.length > 1 && mapLayer.style.strokeColors) {
          // kludge to hide ghosted layers when reference layers are present
          // TODO: consider never showing ghosted layers (which appear after
          // commands like dissolve and filter).
          mapLayer.style = utils.defaults({
            strokeColors: [null, mapLayer.style.strokeColors[1]]
          }, mapLayer.style);
        }
        mapLayer.active = true;
      } else {
        if (mapLayer.layer == _activeLyr.layer) {
          console.error("Error: shared map layer");
        }
        mapLayer.active = false;
        // reference style
        mapLayer.style = MapStyle.getReferenceStyle(mapLayer.layer);
      }
      // data for the renderer in layer-stack to use
      mapLayer.canvas = true;
      mapLayer.svg = internal.layerHasLabels(mapLayer.layer);
    });
  }

  // onlyNav (bool): only map extent has changed, symbols are unchanged
  function drawLayers(onlyNav) {
    // draw active and reference layers
    var layers = getDrawableLayers();
    if (!onlyNav) {
      updateLayerStyles(layers);
    }
    _stack.drawLayers(layers, onlyNav);
    // draw intersection dots
    _stack.drawOverlay2Layer(_intersectionLyr);
    // draw hover & selection effects
    _stack.drawOverlayLayer(_overlayLyr);
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
