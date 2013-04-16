/* @requires core.geo */



function Circle(x, y, r) {
  return new Ellipse(x, y, r, r, 0);
}

function Ellipse(x, y, rx, ry, rot) {
  var _x = x || 0,
      _y = y || 0,
      _rx = rx || 1,
      _ry = ry || 1,
      _rotation = rot || 0; // clockwise rotation, 0-1; 1 = 180 degrees
      PI = Math.PI;

  this.area = function() {
    return PI * _ry * _rx;
  };

  this.clone = function() {
    return new Ellipse(_x, _y, _rx, _ry, _rotation);
  };

  this.shift = function(dx, dy) {
    _x += dx;
    _y += dy;
    return this;
  };

  this.scale = function(kx, ky, focusX, focusY) {
    if (isNaN(focusY)) focusY = _y;
    if (isNaN(focusX)) focusX = _x;
    var dx = (1 - kx) * (focusX - _x); // focusX - _x,
        dy = (1 - ky) * (focusY - _y); // focusY - _y;

    _rx *= kx;
    _ry *= ky;
    _x += dx;
    _y += dy;
  };


  this.setArea = function(a) {
    if (a > 0 == false) error("Ellipse#setArea() invalid area:", a);
    var xyRatio = _ry / _rx;
    _ry = Math.sqrt(a / PI * xyRatio);
    _rx = _ry / xyRatio;
    return this;
  };

  this.centerX = function() {
    return _x;
  };

  this.centerY = function() {
    return _y;
  };

  this.setCenter = function(x, y) {
    _x = x;
    _y = y;
    return this;
  };

  // todo: calculate this correctly:
  // http://old.nabble.com/RE%3A-Bounding-box-of-a-rotated-ellipse-p646077.html
  //
  //
  this.getBounds = function() {
    var rmax = Math.max(_rx, _ry),
        bounds;
    if (_rotation == 0) {
      bounds = [_x - _rx, _y - _ry, _x + _rx, _y + _ry];
    } else {
      bounds = [_x - rmax, _y - rmax, _x + rmax, _y + rmax]
    }
    return bounds;
  };

  this.containsXY = function(x, y) {
    // get angle of (x, y)
    var dx = x - _x,
        dy = y - _y,
        theta = Math.atan2(dy, dx);

    trace("containsXY() theta:", theta)

    // test distance
    var xy = this.getXY(theta);
    return Point.distance(xy.x, xy.y, _x, _y) >= Math.sqrt(dx * dx + dy * dy);
  }

  // x coord at @angle radians (0 - 2 * PI, clockwise)
  this.getXY = function(angle) {
    var theta = angle - _rotation * PI;
    return {x: getX(theta), y: getY(theta)};  
  }

  function getX(theta) {
    return _x - (_ry * Math.sin(theta)) * Math.sin(_rotation * PI) + (_rx * Math.cos(theta)) * Math.cos(_rotation * PI);
  };

  function getY(theta) {
     return _y + (_rx * Math.cos(theta)) * Math.sin(_rotation * PI) + (_ry * Math.sin(theta)) * Math.cos(_rotation * PI);
  };

  this.getCoords = function(n) {
    n = n || 200;
    var lim = 2 * PI,
        inc = lim / (n - 1),
        xx = [],
        yy = [],
        points = [x, y];

    for (var i=0; i < lim; i += inc) {
      xx.push(getX(i));
      yy.push(getY(i));
    }
    xx.push(xx[0]);
    yy.push(yy[0]);
    return points;
  };

  this.draw = function(ctx) {
    var lim = 2 * PI,
        inc = lim / 200;
    for (var i = 0; i < lim; i += inc ) {
      var x = getX(i);
      var y = getY(i);

      if (i == 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
  };
}
