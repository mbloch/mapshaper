/* @requires mapshaper-common, mapshaper-maplayer, mapshaper-map-nav, mapshaper-map-extent */

function MshpMap(el, model) {
  var _root = El(el),
      _ext = new MapExtent(_root, {padding: 12}),
      _nav = new MapNav(_ext, _root),
      _groups = [],
      _highGroup,
      _activeGroup;

  var foregroundStyle = {
        strokeColor: "#335",
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
    var group = findGroup(e.dataset);
    if (!group) group = addGroup(e.dataset);
    group.showLayer(e.layer);
    group.setRetainedPct(e.simplify_pct);
    _activeGroup = group;
    refreshLayers();
  });

  model.on('update', function(e) {
    var group = findGroup(e.dataset);
    group.setRetainedPct(e.simplify_pct);
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
      highStyle.dotSize = calcDotSize(MapShaper.countPointsInLayer(lyr));
      refreshLayer(_highGroup);
    }
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

  function getContentBounds() {
    return _groups.reduce(function(memo, group) {
      memo.mergeBounds(group.getBounds());
      return memo;
    }, new Bounds());
  }

  function addGroup(dataset) {
    var group = new LayerGroup(dataset);
    group.getElement().appendTo(_root);
    _groups.push(group);
    _ext.setBounds(getContentBounds());
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
