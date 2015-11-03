/* @require mapshaper-shapes, mapshaper-geom */

MapShaper.calcSimplifyError = function(arcs) {
  var count = 0,
      sum = 0,
      sumSq = 0;

  arcs.forEachSegment(function(i, j, xx, yy) {
    var ax, ay, bx, by, k, distSq;
    if (j - i <= 1) return;
    ax = xx[i];
    ay = yy[i];
    bx = xx[j];
    by = yy[j];
    for (k=i+1; k<j; k++) {
      distSq = geom.pointSegDistSq(xx[k], yy[k], ax, ay, bx, by);
      sumSq += distSq;
      sum += Math.sqrt(distSq);
      count++;
    }
  });

  return {
    avg: count > 0 ? sum / count : 0, // avg. displacement
    avg2: count > 0 ? sumSq / count : 0, // avg. squared displacement
    count: count // # of removed vertices
  };
};
