/* @requires shapes, browser */


function MorphPct() {
  this.pct = 0;
  var _bb1, _bb2;
  this.getPct = function() {
    return this.pct;
  }

  this.setPct = function(pct) {
    this.pct = pct;
  }

  this.setBounds = function(bb1, bb2) {
    _bb1 = bb1.cloneBounds();
    _bb2 = bb2.cloneBounds();
  }

  this.getBounds = function() {
    var bb = new BoundingBox();
    var pct = this.getPct();
    bb.setBounds(
      Utils.interpolate(_bb1.left, _bb2.left, pct),
      Utils.interpolate(_bb1.top, _bb2.top, pct),
      Utils.interpolate(_bb1.right, _bb2.right, pct),
      Utils.interpolate(_bb1.bottom, _bb2.bottom, pct)
    );

    return bb;
  };
}


function MorphingVertexSet(xx1, yy1, xx2, yy2, morph) {
  var idx = 0;
  var size = 0;

  if (xx1.length != xx2.length) {
    trace("[MorphingVertexSet] mismatched vectors.");
    return;
  }

  size = xx1.length;

  var vec1 = new VertexSet(xx1, yy1);
  vec1.calcBounds();

  var vec2 = new VertexSet(xx2, yy2);
  vec2.calcBounds();

  this.mergeBounds(vec1);
  this.mergeBounds(vec2);

  this.hasNext = function() {
    var pct = morph.pct;
    if (idx >= size) {
      idx = 0;
      //trace("[MorphingVertexSet()] hasNext() == false")
      return false;
    }

    this.nextX = xx2[idx] * pct + xx1[idx] * (1 - pct);
    this.nextY = yy2[idx] * pct + yy1[idx] * (1 - pct);

    if (idx == 0) {
      trace("hasNext() x, y:", this.nextX, this.nextY);
    }

    idx++;
    return true;
  }
}


MorphingVertexSet.prototype = new BoundingBox();

MorphingVertexSet.prototype.draw = VertexSet.prototype.draw;

MorphingVertexSet.prototype.draw = function(ctx, ext) {
  trace("[MorphingVertexSet.draw()]")

  VertexSet.prototype.draw.call(this, ctx, ext);
};


var ShapeMorphing = (function(){
  var api = {};

  function interpolateXY(xx, yy, x1, y1, d1, x2, y2, d2, d3) {
    if (d1 >= d2) {
      trace("[ShapeMorphing.interpolateXY()] interpolating segment invalid; d1, d2:", d1, d2);
      xx.push(x1);
      yy.push(y1);
      return;
    }
    else if (d3 >= d2) {
      trace("[ShapeMorphing.interpolateXY()] interpolated distance to0 large; d1, d2, d3:", d1, d2, d3);
      d3 = d2;
    }
    else if (d3 <= d1) {
      trace("[ShapeMorphing.interpolateXY()] interpolated distance too small; d1, d2, d3:", d1, d2, d3);
      d3 = d1;
    }

    var pct = (d3 - d1) / (d2 - d1);
    var x = x1 + pct * (x2 - x1);
    var y = y1 + pct * (y2 - y1);
    xx.push(x);
    yy.push(y);
  }

  function getVectorMorph(vec1, vec2, morph) {
    var ax1 = vec1.xx,
      ay1 = vec1.yy,
      ax2 = vec2.xx,
      ay2 = vec2.yy,
      ad1 = vec1.dd,
      ad2 = vec2.dd;

    //trace("dd1:", ad1);
    //trace("dd2:", ad2);

    var xp1 = ax1[0],
      yp1 = ay1[0],
      xp2 = ax2[0],
      yp2 = ay2[0],
      x1 = ax1[1],
      y1 = ay1[1],
      x2 = ax2[1],
      y2 = ay2[1],
      d1 = ad1[1],
      d2 = ad2[1],
      dp1 = 0,
      dp2 = 0;

    var bx1 = [xp1],
      by1 = [yp1],
      bx2 = [xp2],
      by2 = [yp2];

    var i1=1, i2=1;
    var len1 = ax1.length,
      len2 = ax2.length;

    var adv1, adv2;

    // trace("getVectorMorph() i1:", i1, "len1:", len1, "i2:", i1, "len2:", len2);

    while(i1 < len1 || i2 < len2) {
      adv1 = false;
      adv2 = false;

      if (d1 < d2 || i2 >= len2) {
        // interpolate p1 to vector2
        interpolateXY(bx2, by2, xp2, yp2, dp2, x2, y2, d2, d1);
        // advance vector1 index
        adv1 = true;
      }
      else if (d2 < d1 || i1 >= len1) {
        interpolateXY(bx1, by1, xp1, yp1, dp1, x1, y1, d1, d2);
        adv2 = true;
      }
      else {
        bx1.push(x1);
        by1.push(y1);
        bx2.push(x2);
        by2.push(y2);
        adv1 = true;
        adv2 = true;
      }

      if (adv1) {
        bx1.push(x1);
        by1.push(y1);
        i1++;
        xp1 = x1;
        yp1 = y1;
        dp1 = d1;
        x1 = ax1[i1];
        y1 = ay1[i1];
        d1 = ad1[i1];
      }

      if (adv2) {
        bx2.push(x2);
        by2.push(y2);
        i2++;
        xp2 = x2;
        yp2 = y2;
        dp2 = d2;
        x2 = ax2[i2];
        y2 = ay2[i2];
        d2 = ad2[i2];
      }
    }

    // trace(">> morph len: bx1:", bx1.length, "bx2:", bx2.length);

    var vec = new MorphingVertexSet(bx1, by1, bx2, by2, morph);
    return vec;

  }


  function getLargestPart(shp) {
    var largestVec = null;
    var largestArea = 0;
    var parts = shp.parts;
    for (var i=0; i<parts.length; i++) {
      var vec = parts[i];
      var area = vec.width() * vec.height();
      if (area > largestArea) {
        largestArea = area
        largestVec = vec;
      }

    }
    return largestVec;

  }

  function getVertexData(vec) {
    var xx, yy, zz,
      total = 0;

    var prevX, prevY, x, y;
    if (vec.hasNext()) {
      x = vec.nextX;
      y = vec.nextY;
      xx = [x];
      yy = [y];
      dd = [0];

      while(vec.hasNext()) {
        prevX = x;
        prevY = y;
        x = vec.nextX;
        y = vec.nextY;
        var dx = prevX - x;
        var dy = prevY - y;
        var d = Math.sqrt(dx * dx + dy * dy);
        total += d;
        xx.push(x);
        yy.push(y);
        dd.push(total);
      }

    }

    //trace(">> dd0:", dd);
    for(var i=0, len=xx.length; i<len; i++) {
      dd[i] /= total;
    }

    //trace(">> lens:", xx.length, yy.length, dd.length);

    var obj = {xx: xx, yy: yy, dd: dd};
    return obj;

  }



  api.getShapeMorph = function(shape1, shape2, morphPct) {
    // get parts to associate
    //trace("[getShaepMorph()]", shape1, shape2);
    var vec1 = getLargestPart(shape1);
    var vec2 = getLargestPart(shape2);


    if (!vec1 || !vec2) {
      trace("[ShapeMorphing.getShapeMorph()] missing a part; skipping.");
      return null;
    }

    // KLUDGE // make sure we're using simplified lines, if relevant
    vec1._scale && vec1._scale.updateContentWidth(300);
    vec2._scale && vec2._scale.updateContentWidth(300);


    var obj1 = getVertexData(vec1);
    var obj2 = getVertexData(vec2);

    var vec = getVectorMorph(obj1, obj2, morphPct);
    var shp = new ShapeVector(-1, vec);

    // TODO: handle smaller parts

    return shp;

  };


  return api;
}());