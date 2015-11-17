/* @require mapshaper-shapes, mapshaper-geom */

MapShaper.calcSimplifyError = function(arcs, use3D) {
  var distSq = use3D ? pointSegGeoDistSq : geom.pointSegDistSq,
      count = 0,
      removed = 0,
      collapsed = 0,
      max = 0,
      sum = 0,
      sumSq = 0;

  arcs.forEachSegment(function(i, j, xx, yy) {
    var ax, ay, bx, by, d2, d;
    if (j - i <= 1) return;
    removed += j - i - 1;
    ax = xx[i];
    ay = yy[i];
    bx = xx[j];
    by = yy[j];
    if (ax == bx && ay == by) {
      collapsed++;
    } else while (++i < j) {
      d2 = distSq(xx[i], yy[i], ax, ay, bx, by);
      sumSq += d2;
      d = Math.sqrt(d2);
      sum += d;
      max = Math.max(max, d);
      count++;
    }
  });

  function pointSegGeoDistSq(alng, alat, blng, blat, clng, clat) {
    var xx = [], yy = [], zz = [];
    geom.convLngLatToSph([alng, blng, clng], [alat, blat, clat], xx, yy, zz);
    return geom.pointSegDistSq3D(xx[0], yy[0], zz[0], xx[1], yy[1], zz[1],
          xx[2], yy[2], zz[2]);
  }

  return {
    avg: count > 0 ? sum / count : 0, // avg. displacement
    avg2: count > 0 ? sumSq / count : 0, // avg. squared displacement
    max: max,
    collapsed: collapsed,
    removed: removed
  };
};
