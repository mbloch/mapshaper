/* @requires mapshaper-common, mapshaper-maplayer, mapshaper-map-nav, mapshaper-map-extent */

function MshpMap(model) {
  var _root = El("#mshp-main-map"),
      _ext = new MapExtent(_root),
      _nav = new MapNav(_ext, _root),
      _groups = [],
      _highGroup,
      _activeGroup;

  var darkStroke = "#335",
      lightStroke = "#f5d4f9"; // "#e8d3ea";

  var foregroundStyle = {
        strokeColor: darkStroke,
        dotColor: "#223"
      };

  var bgStyle = {
        strokeColor: "#aaa",
        dotColor: "#aaa"
      };

  var highStyle = {
      dotColor: "#F24400"
  };

  _ext.on('change', refreshLayers);

  model.on('delete', function(e) {
    deleteGroup(e.dataset);
  });

  model.on('select', function(e) {
    var group;
    if (model.size() > 2) {
      model.removeDataset(model.getDatasets().shift());
    }
    group = findGroup(e.dataset);
    if (!group) {
      group = addGroup(e.dataset);
      updateMapBounds();
    }
    group.showLayer(e.layer);
    _activeGroup = group;
    updateGroupStyle(foregroundStyle, group);
    refreshLayers();
  });

  model.on('update', function(e) {
    var group = findGroup(e.dataset);
    group.updated();
    group.showLayer(e.layer);
    updateGroupStyle(foregroundStyle, group);
    updateMapBounds();
    refreshLayer(group);
  });

  this.setHighlightLayer = function(lyr, dataset) {
    if (_highGroup) {
      deleteGroup(_highGroup.getDataset());
      _highGroup = null;
    }
    if (lyr) {
      _highGroup = addGroup(dataset);
      _highGroup.showLayer(lyr);
      updateGroupStyle(highStyle, _highGroup);
      refreshLayer(_highGroup);
    }
  };

  this.setSimplifyPct = function(pct) {
    _activeGroup.setRetainedPct(pct);
    refreshLayers(_activeGroup);
  };

  this.refreshLayer = function(dataset) {
    refreshLayer(findGroup(dataset));
  };

  this.getElement = function() {
    return _root;
  };

  this.getExtent = function() {
    return _ext;
  };

  this.refresh = function() {
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

  function refreshLayer(group) {
    var style = bgStyle;
    if (group == _activeGroup) {
      style = foregroundStyle;
    } else if (group == _highGroup) {
      style = highStyle;
    }
    group.draw(style, _ext);
  }

  function updateMapBounds() {
    var bounds = _groups.reduce(function(memo, group) {
      if (group != _highGroup) {
        memo.mergeBounds(group.getBounds());
      }
      return memo;
    }, new Bounds());
    _ext.setBounds(bounds);
  }

  function addGroup(dataset) {
    var group = new LayerGroup(dataset);
    group.getElement().appendTo(_root);
    _groups.push(group);
    return group;
  }

  function deleteGroup(dataset) {
    _groups = _groups.reduce(function(memo, g) {
      if (g.getDataset() == dataset) {
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
