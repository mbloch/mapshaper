/* @requires mapshaper-common */

//
//
//
//

MapShaper.repairTopology = function(obj, chainedIds, bb, resolution) {
  var minx = bb.left,
      maxx = bb.right,
      miny = bb.bottom,
      maxy = bb.top;

  var MAX_SIDE = 40000;

  var rows = Math.ceil((maxy - miny) / resolution);
      cols = Math.ceil((maxx - minx) / resolution);

  function getRow(y) {

  }

  function getCol(x) {

  }

  function hash(x, y) {
    
  }


};
