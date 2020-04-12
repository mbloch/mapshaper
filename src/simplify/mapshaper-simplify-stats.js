import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';
import { NodeCollection } from '../topology/mapshaper-nodes';

export function calcSimplifyStats(arcs, use3D) {
  var distSq = use3D ? pointSegGeoDistSq : geom.pointSegDistSq,
      calcAngle = use3D ? geom.signedAngleSph : geom.signedAngle,
      removed = 0,
      retained = 0,
      collapsedRings = 0,
      max = 0,
      sum = 0,
      sumSq = 0,
      iprev = -1,
      jprev = -1,
      measures = [],
      angles = [],
      zz = arcs.getVertexData().zz,
      count, stats;

  arcs.forEachSegment(function(i, j, xx, yy) {
    var ax, ay, bx, by, d2, d, skipped, angle, tmp;
    ax = xx[i];
    ay = yy[i];
    bx = xx[j];
    by = yy[j];

    if (i == jprev) {
      angle = calcAngle(xx[iprev], yy[iprev], ax, ay, bx, by);
      if (angle > Math.PI) angle = 2 * Math.PI - angle;
      if (!isNaN(angle)) {
        angles.push(angle * 180 / Math.PI);
      }
    }
    iprev = i;
    jprev = j;

    if (zz[i] < Infinity) {
      retained++;
    }
    skipped = j - i - 1;
    if (skipped < 1) return;
    removed += skipped;

    if (ax == bx && ay == by) {
      collapsedRings++;
    } else {
      d2 = 0;
      while (++i < j) {
        tmp = distSq(xx[i], yy[i], ax, ay, bx, by);
        d2 = Math.max(d2, tmp);
      }
      sumSq += d2;
      d = Math.sqrt(d2);
      sum += d;
      measures.push(d);
      max = Math.max(max, d);
    }
  });

  function pointSegGeoDistSq(alng, alat, blng, blat, clng, clat) {
    var xx = [], yy = [], zz = [];
    geom.convLngLatToSph([alng, blng, clng], [alat, blat, clat], xx, yy, zz);
    return geom.pointSegDistSq3D(xx[0], yy[0], zz[0], xx[1], yy[1], zz[1],
          xx[2], yy[2], zz[2]);
  }

  stats = {
    angleMean: 0,
    displacementMean: 0,
    displacementMax: max,
    collapsedRings: collapsedRings,
    removed: removed,
    retained: retained,
    uniqueCount: countUniqueVertices(arcs),
    removableCount: removed + retained
  };

  if (angles.length > 0) {
    // stats.medianAngle = utils.findMedian(angles);
    stats.angleMean = utils.sum(angles) / angles.length;
    // stats.lt30 = utils.findRankByValue(angles, 30) / angles.length * 100;
    // stats.lt45 = utils.findRankByValue(angles, 45) / angles.length * 100;
    // stats.lt60 = utils.findRankByValue(angles, 60) / angles.length * 100;
    // stats.lt90 = utils.findRankByValue(angles, 90) / angles.length * 100;
    // stats.lt120 = utils.findRankByValue(angles, 120) / angles.length * 100;
    // stats.lt135 = utils.findRankByValue(angles, 135) / angles.length * 100;
    stats.angleQuartiles = [
      utils.findValueByPct(angles, 0.75),
      utils.findValueByPct(angles, 0.5),
      utils.findValueByPct(angles, 0.25)
    ];
  }

  if (measures.length > 0) {
    stats.displacementMean = sum / measures.length;
    // stats.median = utils.findMedian(measures);
    // stats.stdDev = Math.sqrt(sumSq / measures.length);
    stats.displacementQuartiles = [
      utils.findValueByPct(measures, 0.75),
      utils.findValueByPct(measures, 0.5),
      utils.findValueByPct(measures, 0.25)
    ];
  }
  return stats;
}

function countUniqueVertices(arcs) {
  // TODO: exclude any zero-length arcs
  var endpoints = arcs.size() * 2;
  var nodes = new NodeCollection(arcs).size();
  return arcs.getPointCount() - endpoints + nodes;
}
