/* @require mapshaper-geom */

SVG.stringifyVertex = function(p) {
  return p[0] + ' ' + p[1]; // TODO: round coords by default?
};

SVG.stringifyCP = function(p) {
  return p[2].toFixed(2) + ' ' + p[3].toFixed(2);
};

SVG.stringifyLineStringCoords = function(coords) {
  var p1 = coords[0];
  var d;
  if (coords.length === 0) {
    d = '';
  } else if (coords.length == 2 && coords[0].length == 4 && coords[1].length == 4) {
    // cubic bezier control point coordinates are appended to [x, y] vertex coordinates.
    d = SVG.stringifyBezierArc(coords);
  } else {
    d = 'M ' + coords.map(SVG.stringifyVertex).join(' ');
  }
  return d;
};

SVG.stringifyBezierArc = function(coords) {
  var p1 = coords[0],
      p2 = coords[1];
  return 'M ' + SVG.stringifyVertex(p1) + ' C ' + SVG.stringifyCP(p1) + ' ' +
          SVG.stringifyCP(p2) + ' ' + SVG.stringifyVertex(p2);
};

SVG.findArcCenter = function(p1, p2, degrees) {
  var p3 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], // midpoint betw. p1, p2
      tan = 1 / Math.tan(degrees / 180 * Math.PI / 2),
      cp = internal.getAffineTransform(90, tan, [0, 0], p3)(p2[0], p2[1]);
  return cp;
};

SVG.addBezierArcControlPoints = function(p1, p2, degrees) {
  // source: https://stackoverflow.com/questions/734076/how-to-best-approximate-a-geometrical-arc-with-a-bezier-curve
  var cp = SVG.findArcCenter(p1, p2, degrees),
      xc = cp[0],
      yc = cp[1],
      ax = p1[0] - xc,
      ay = p1[1] - yc,
      bx = p2[0] - xc,
      by = p2[1] - yc,
      q1 = ax * ax + ay * ay,
      q2 = q1 + ax * bx + ay * by;
      k2 = 4/3 * (Math.sqrt(2 * q1 * q2) - q2) / (ax * by - ay * bx);

  p1.push(xc + ax - k2 * ay);
  p1.push(yc + ay + k2 * ax);
  p2.push(xc + bx + k2 * by);
  p2.push(yc + by - k2 * bx);
};
