/* @requires
mapshaper-common
mapshaper-maplayer
mapshaper-map-nav
mapshaper-map-extent
mapshaper-hit-control
mapshaper-info-control
*/

// Test if map should be re-framed to show updated layer
gui.mapNeedsReset = function(newBounds, prevBounds, mapBounds) {
  var boundsChanged = !prevBounds || !prevBounds.equals(newBounds);
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
      _info = new InfoControl(model, _hit),
      _groups = [],
      _highGroup,
      _hoverGroup,
      _activeGroup;

  var darkStroke = "#334",
      lightStroke = "rgba(135, 178, 0, 0.35)",
      activeStyle = {
        strokeColor: darkStroke,
        strokeWidth: 0.7,
        dotColor: "#223"
      },
      highStyle = {
        dotColor: "#F24400"
      },
      hoverStyles = {
        polygon: {
          fillColor: "rgba(255, 120, 162, 0.2)", // "#ffebf1",
          strokeColor: "black",
          strokeWidth: 1.2
        }, point:  {
          dotColor: "black",
          dotSize: 8
        }, polyline:  {
          strokeColor: "black",
          strokeWidth: 3
        }
      },
      pinnedStyles = {
        polygon: {
          fillColor: "rgba(255, 120, 162, 0.2)",
          strokeColor: "#f74b80",
          strokeWidth: 1.5
        }, point:  {
          dotColor: "#f74b80",
          dotSize: 8
        }, polyline:  {
          strokeColor: "#f74b80",
          strokeWidth: 4
        }
      },
      hoverStyle;

  _ext.on('change', refreshLayers);

  _hit.on('change', function(e) {
    var style;
    if (!_hoverGroup) {
      _hoverGroup = addGroup(null);
      _hoverGroup.getElement().addClass('hover-layer');
    }
    _hoverGroup.setArcs(_activeGroup.getArcs());
    _hoverGroup.showLayer(e.layer);
    hoverStyle = getHoverStyle(e.layer, e.pinned);
    refreshLayer(_hoverGroup);
  });

  model.on('delete', function(e) {
    var group = findGroup(e.dataset);
    while (group) {
      deleteGroup(group);
      group = findGroup(e.dataset);
    }
  });

  model.on('select', function(e) {
    if (_hoverGroup) {
      deleteGroup(_hoverGroup);
      _hoverGroup = null;
    }
  });

  model.on('update', function(e) {
    var prevBounds = _activeGroup ?_activeGroup.getBounds() : null,
        group = findGroup(e.dataset),
        needReset;
    if (!group) {
      group = addGroup(e.dataset);
    } else if (e.flags.presimplify || e.flags.simplify || e.flags.proj || e.flags.arc_count) {
      // update filtered arcs when simplification thresholds are calculated
      // or arcs are updated
      if (e.flags.proj && e.dataset.arcs) {
         // reset simplification after projection (thresholds have changed)
         // TODO: reset is not needed if -simplify command is run after -proj
        e.dataset.arcs.setRetainedPct(1);
      }
      group.updated();
    }
    group.showLayer(e.layer);
    updateGroupStyle(activeStyle, group);
    _activeGroup = group;
    needReset = gui.mapNeedsReset(group.getBounds(), prevBounds, _ext.getBounds());
    _ext.setBounds(group.getBounds()); // update map extent to match bounds of active group
    if (needReset) {
      // zoom to full view of the active layer and redraw
      _ext.reset(true);
    } else {
      // refresh without navigating
      refreshLayers();
    }
  });

  this.setHighlightLayer = function(lyr, dataset) {
    if (_highGroup) {
      deleteGroup(_highGroup);
      _highGroup = null;
    }
    if (lyr) {
      _highGroup = addGroup(dataset);
      _highGroup.showLayer(lyr);
      _highGroup.getElement().addClass('highlight-layer');
      updateGroupStyle(highStyle, _highGroup);
      refreshLayer(_highGroup);
    }
  };

  this.setSimplifyPct = function(pct) {
    _activeGroup.setRetainedPct(pct);
    refreshLayers();
  };

  function updateGroupStyle(style, group) {
    var lyr = group.getLayer(),
        dataset = group.getDataset();
    style.dotSize = calcDotSize(MapShaper.countPointsInLayer(lyr));
    style.strokeColor = getStrokeStyle(lyr, dataset.arcs);
  }

  function getStrokeStyle(lyr, arcs) {
    var stroke = lightStroke,
        counts;
    if (MapShaper.layerHasPaths(lyr)) {
      counts = new Uint8Array(arcs.size());
      MapShaper.countArcsInShapes(lyr.shapes, counts);
      stroke = function(i) {
        return counts[i] > 0 ? darkStroke : lightStroke;
      };
    }
    return stroke;
  }

  function calcDotSize(n) {
    return n < 20 && 5 || n < 500 && 4 || 3;
  }

  function refreshLayers() {
    _groups.forEach(refreshLayer);
  }

  function getHoverStyle(lyr, pinned) {
    return (pinned ? pinnedStyles : hoverStyles)[lyr.geometry_type];
  }

  function refreshLayer(group) {
    var style;
    if (group == _activeGroup) {
      style = activeStyle;
    } else if (group == _highGroup) {
      style = highStyle;
    } else if (group == _hoverGroup) {
      style = hoverStyle;
    }
    if (!style) {
      group.hide();
    } else if (group == _hoverGroup) {
      group.drawShapes(group.getLayer(), style, _ext);
    } else {
      group.drawStructure(group.getLayer(), style, _ext);
    }
  }

  function addGroup(dataset, opts) {
    var group = new LayerGroup(dataset, opts);
    group.getElement().appendTo(_layers);
    _groups.push(group);
    return group;
  }

  function deleteGroup(group) {
    _groups = _groups.reduce(function(memo, g) {
      if (g == group) {
        g.remove();
      } else {
        memo.push(g);
      }
      return memo;
    }, []);
  }

  function findGroup(dataset) {
    return utils.find(_groups, function(group) {
      return group.getDataset() == dataset;
    });
  }
}

utils.inherit(MshpMap, EventDispatcher);
