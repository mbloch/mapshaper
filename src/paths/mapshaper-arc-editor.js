/* @require mapshaper-shapes */

MapShaper.editArcs = function(arcs, onPoint) {
  var nn2 = [],
      xx2 = [],
      yy2 = [],
      n;

  arcs.forEach(function(arc, i) {
    editArc(arc, onPoint);
  });
  arcs.updateVertexData(nn2, xx2, yy2);

  function append(p) {
    xx2.push(p.x);
    yy2.push(p.y);
    n++;
  }

  function editArc(arc, cb) {
    var x, y, xp, yp;
    var i = 0;
    n = 0;
    while (arc.hasNext()) {
      x = arc.x;
      y = arc.y;
      cb(append, x, y, xp, yp, i++);
      xp = x;
      yp = y;
    }
    if (n == 1) { // invalid arc len
      error("An invalid arc was created");
    }
    nn2.push(n);
  }
};
