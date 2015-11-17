/* @require mapshaper-shapes, mapshaper-geom */

MapShaper.calcSimplifyError = function(arcs, use3D) {
  var distSq = use3D ? pointSegGeoDistSq : geom.pointSegDistSq,
      removed = 0,
      retained = 0,
      collapsedRings = 0,
      // collapsedPoints = 0,
      max = 0,
      sum = 0,
      sumSq = 0,
      measures = [],
      zz = arcs.getVertexData().zz,
      count;

  arcs.forEachSegment(function(i, j, xx, yy) {
    var ax, ay, bx, by, d2, d, skipped;
    if (zz[i] < Infinity) {
      retained++;
    }
    skipped = j - i - 1;
    if (skipped < 1) return;
    removed += skipped;
    ax = xx[i];
    ay = yy[i];
    bx = xx[j];
    by = yy[j];
    if (ax == bx && ay == by) {
      collapsedRings++;
      // collapsedPoints += skipped;
    } else {
      while (++i < j) {
        d2 = distSq(xx[i], yy[i], ax, ay, bx, by);
        sumSq += d2;
        d = Math.sqrt(d2);
        sum += d;
        max = Math.max(max, d);
        measures.push(d);
      }
    }
  });

  function pointSegGeoDistSq(alng, alat, blng, blat, clng, clat) {
    var xx = [], yy = [], zz = [];
    geom.convLngLatToSph([alng, blng, clng], [alat, blat, clat], xx, yy, zz);
    return geom.pointSegDistSq3D(xx[0], yy[0], zz[0], xx[1], yy[1], zz[1],
          xx[2], yy[2], zz[2]);
  }

  count = measures.length;
  return {
    median: count > 0 ? utils.findMedian(measures) : 0,
    avg: count > 0 ? sum / count : 0, // avg. displacement
    avg2: count > 0 ? sumSq / count : 0, // avg. squared displacement
    max: max,
    collapsed: collapsedRings,
    removed: removed,
    retained: retained
  };
};
