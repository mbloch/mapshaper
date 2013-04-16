/* @requires mapshaper-common, mapshaper-index, core.geo */

MapShaper.calcArcBounds = function(xx, yy) {
  var xb = Utils.getArrayBounds(xx),
      yb = Utils.getArrayBounds(yy);
  return [xb.min, yb.min, xb.max, yb.max];
};

// ArcCollection has methods for finding the arcs inside a bounding box and the
//   nearest arc to an (x, y) location.
// Receive array of arcs; each arc is a two-element array: [[x0,x1,...],[y0,y1,...]
//
function ArcCollection(coords) {
  var len = coords.length, xxyy, bbox;

  var arcs = [],
      boxes = [],
      bounds = new BoundingBox();

  for (var i=0; i<len; i++) {
    xxyy = coords[i];
    bbox = MapShaper.calcArcBounds(xxyy[0], xxyy[1]);
    bounds.mergeBounds(bbox);
    boxes.push(bbox);
  }

  var index = new BoundsIndex(boxes);

  this.size = function() {
    return len;
  }

  this.getBounds = function() {
    return bounds;
  };

  this.getView = function(thresholds) {
    return new ArcView(thresholds);
  }

  function ArcView(thresholds) {
    if (thresholds.length != len) error("SimpleView() data mismatch");
    var arcs = [],
        limit = {lim: 0};

    for (var i=0; i<len; i++) {
      arcs.push(new SimpleArc(coords[i][0], coords[i][1], thresholds[i], limit))
    }

    this.setLimit = function(lim) {
      limit.lim = lim;
    };

    this.getArcsInBounds = function(bb) {
      var ids = index.getIntersection(bb);
      return new ArcGroup(ids, arcs);
    };

    this.getNearestArc = function(x, y, buf) {
      buf = buf || 0;
      var bb = new BoundingBox(x-buf, y+buf, x+buf, y-buf),
          ids = index.getIntersection(bb);

      if (ids.length == 0)
        return null;
      // TODO: actually measure distance from each candidate
      var arc = arcs[ids[0]];
      return arc;
    };      

  }
}

function ArcGroup(ids, arcs) {
  var i = 0,
      n = arcs.length;

  this.size = function() {
    return n;
  };

  this.next = function() {
    if (i >= n) {
      i = 0;
      return false;
    }
    return arcs[i++];
  };
}


function Arc(xx, yy) {
  this.addCoords(xx, yy);
}

Arc.prototype.addCoords = function(xx, yy) {
  if (!xx || !xx.length || xx.length !== yy.length)
    error("Arc#addCoords() missing data");
  this.xx = xx;
  this.yy = yy;
  this.len = xx.length;
  this.i = 0;
}

Arc.prototype.coords = function() {
  return [xx, yy];
}

Arc.prototype.hasNext = function() {
  var i = this.i++;
  if (i >= this.len) {
    this.i = 0;
    return false;
  }
  this.x = this.xx[i];
  this.y = this.yy[i];
};

Arc.prototype.size = function() {
  return this.len | 0;
};


function SimpleArc(xx, yy, zz, globalLimit) {
  this.addCoords(xx, yy);
  this.zz = zz;
  this.global = globalLimit;
  if (zz.length != this.size()) error("SimpleArc#setThresholds() array mismatch");
}

Opts.extendPrototype(SimpleArc, Arc);

SimpleArc.prototype.setLimit = function(z) {
  this.lim = z;
};

SimpleArc.prototype.hasNext = function() {
  var lim = this.lim || this.globalLimit.limit || 0;
      zz = this.zz;
  if (!zz || !lim)
    return Arc.prototype.hasNext.call(this);
  var xx = this.xx,
      yy = this.yy,
      i = this.i,
      len = this.len,
      z;

  while (i < len) {
    z = zz[i];
    i++;
    if (z >= lim) break;
  }
  if (i == len) {
    this.i = 0;
    return false;
  }
  this.x = xx[i];
  this.y = yy[i];
  return true;
};
