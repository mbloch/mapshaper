import { sortSegmentIds } from '../paths/mapshaper-segment-sorting';
import { forEachSegmentInShape } from '../paths/mapshaper-path-utils';
import { error } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';

// PolygonIndex indexes the coordinates in one polygon feature for efficient
// point-in-polygon tests

export function PolygonIndex(shape, arcs, opts) {
  var data = arcs.getVertexData(),
      polygonBounds = arcs.getMultiShapeBounds(shape),
      boundsLeft,
      xminIds, xmaxIds, // vertex ids of segment endpoints
      bucketCount,
      bucketOffsets,
      bucketWidth;

  init();

  // Return 0 if outside, 1 if inside, -1 if on boundary
  this.pointInPolygon = function(x, y) {
    if (!polygonBounds.containsPoint(x, y)) {
      return false;
    }
    var bucketId = getBucketId(x);
    var count = countCrosses(x, y, bucketId);
    if (bucketId > 0) {
      count += countCrosses(x, y, bucketId - 1);
    }
    count += countCrosses(x, y, bucketCount); // check oflo bucket
    if (isNaN(count)) return -1;
    return count % 2 == 1 ? 1 : 0;
  };

  function countCrosses(x, y, bucketId) {
    var offs = bucketOffsets[bucketId],
        count = 0,
        xx = data.xx,
        yy = data.yy,
        n, a, b;
    if (bucketId == bucketCount) { // oflo bucket
      n = xminIds.length - offs;
    } else {
      n = bucketOffsets[bucketId + 1] - offs;
    }
    for (var i=0; i<n; i++) {
      a = xminIds[i + offs];
      b = xmaxIds[i + offs];
      count += geom.testRayIntersection(x, y, xx[a], yy[a], xx[b], yy[b]);
    }
    return count;
  }

  function getBucketId(x) {
    var i = Math.floor((x - boundsLeft) / bucketWidth);
    if (i < 0) i = 0;
    if (i >= bucketCount) i = bucketCount - 1;
    return i;
  }

  function getBucketCount(segCount) {
    // default is this many segs per bucket (average)
    // var buckets = opts && opts.buckets > 0 ? opts.buckets : segCount / 200;
    // using more segs/bucket for more complex shapes, based on trial and error
    var buckets = Math.pow(segCount, 0.75) / 10;
    return Math.ceil(buckets);
  }

  function init() {
    var xx = data.xx,
        segCount = 0,
        segId = 0,
        bucketId = -1,
        prevBucketId,
        segments,
        head, tail,
        a, b, i, j, xmin, xmax;

    // get array of segments as [s0p0, s0p1, s1p0, s1p1, ...], sorted by xmin coordinate
    forEachSegmentInShape(shape, arcs, function() {
      segCount++;
    });
    segments = new Uint32Array(segCount * 2);
    i = 0;
    forEachSegmentInShape(shape, arcs, function(a, b, xx, yy) {
      segments[i++] = a;
      segments[i++] = b;
    });
    sortSegmentIds(xx, segments);

    // assign segments to buckets according to xmin coordinate
    xminIds = new Uint32Array(segCount);
    xmaxIds = new Uint32Array(segCount);
    bucketCount = getBucketCount(segCount);
    bucketOffsets = new Uint32Array(bucketCount + 1); // add an oflo bucket
    boundsLeft = xx[segments[0]]; // xmin of first segment
    bucketWidth = (xx[segments[segments.length - 2]] - boundsLeft) / bucketCount;
    head = 0; // insertion index for next segment in the current bucket
    tail = segCount - 1; // insertion index for next segment in oflo bucket

    while (segId < segCount) {
      j = segId * 2;
      a = segments[j];
      b = segments[j+1];
      xmin = xx[a];
      xmax = xx[b];
      prevBucketId = bucketId;
      bucketId = getBucketId(xmin);

      while (bucketId > prevBucketId) {
        prevBucketId++;
        bucketOffsets[prevBucketId] = head;
      }

      if (xmax - xmin >= 0 === false) error("Invalid segment");
      if (getBucketId(xmax) - bucketId > 1) {
        // if segment extends to more than two buckets, put it in the oflo bucket
        xminIds[tail] = a;
        xmaxIds[tail] = b;
        tail--; // oflo bucket fills from right to left
      } else {
        // else place segment in a bucket based on x coord of leftmost endpoint
        xminIds[head] = a;
        xmaxIds[head] = b;
        head++;
      }
      segId++;
    }
    bucketOffsets[bucketCount] = head;
    if (head != tail + 1) error("Segment indexing error");
  }
}
