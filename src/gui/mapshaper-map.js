/* @requires mapshaper-common, mapshaper-maplayer, mapshaper-map-nav, mapshaper-map-extent */

function MshpMap(el) {
  var _root = El(el),
      _ext = new MapExtent(_root, {padding: 12}),
      _nav = new MapNav(_ext, _root),
      _groups = [];

  _ext.on('change', refreshLayers);

  function refreshLayers() {
    _groups.forEach(function(lyr) {
      lyr.refresh();
    });
  }

  function getContentBounds() {
    return _groups.reduce(function(memo, lyr) {
      memo.mergeBounds(lyr.getBounds());
      return memo;
    }, new Bounds());
  }

  this.getExtent = function() {
    return _ext;
  };

  this.refresh = function() {
    refreshLayers();
  };

  this.addLayer = function(dataset) {
    var lyr = new LayerGroup(dataset);
    lyr.setMap(this);
    _groups.push(lyr);
    _ext.setBounds(getContentBounds());
    return lyr;
  };

  this.findLayer = function(dataset) {
    return utils.find(_groups, function(lyr) {
      return lyr.getDataset() == dataset;
    });
  };

  this.removeLayer = function(targetLyr) {
    _groups = _groups.reduce(function(memo, lyr) {
      if (lyr == targetLyr) {
        lyr.remove();
      } else {
        memo.push(lyr);
      }
      return memo;
    }, []);
  };

  this.getElement = function() {
    return _root;
  };
}

utils.inherit(MshpMap, EventDispatcher);
