/* @require mapshaper-shape-geom */

// PolygonIndex indexes the coordinates in one polygon feature for efficient
// point-in-polygon tests

MapShaper.PolygonIndex = PolygonIndex;

function PolygonIndex(shape, arcs) {
  var data = arcs.getVertexData(),
      polygonBounds = arcs.getMultiShapeBounds(shape),
      boundsLeft,
      p1Arr, p2Arr,
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
    if (bucketId < bucketCount - 1) {
      count += countCrosses(x, y, bucketId + 1);
    }
    count += countCrosses(x, y, bucketCount); // check oflo bucket
    if (isNaN(count)) return -1;
    return count % 2 == 1 ? 1 : 0;
  };

  function init() {
    var xx = data.xx,
        segCount = 0,
        bucketId = 0,
        bucketLeft = boundsLeft,
        segId = 0,
        segments,
        lastX,
        head, tail,
        a, b, i, j, xmin, xmax;

    // get sorted array of segment ids
    MapShaper.forEachPathSegment(shape, arcs, function() {
      segCount++;
    });
    segments = new Uint32Array(segCount * 2);
    i = 0;
    MapShaper.forEachPathSegment(shape, arcs, function(a, b, xx, yy) {
      segments[i++] = a;
      segments[i++] = b;
    });
    MapShaper.sortSegmentIds(xx, segments);

    // populate buckets
    p1Arr = new Uint32Array(segCount);
    p2Arr = new Uint32Array(segCount);
    bucketCount = Math.ceil(segCount / 100);
    bucketOffsets = new Uint32Array(bucketCount + 1);
    lastX = xx[segments[segments.length - 2]]; // xmin of last segment
    bucketLeft = boundsLeft = xx[segments[0]]; // xmin of first segment
    bucketWidth = (lastX - boundsLeft) / bucketCount;
    head = 0;
    tail = segCount - 1;

    while (bucketId < bucketCount && segId < segCount) {
      j = segId * 2;
      a = segments[j];
      b = segments[j+1];
      xmin = xx[a];
      xmax = xx[b];

      if (xmin > bucketLeft + bucketWidth && bucketId < bucketCount - 1) {
        bucketId++;
        bucketLeft = bucketId * bucketWidth + boundsLeft;
        bucketOffsets[bucketId] = head;
      } else {
        if (getBucketId(xmin) != bucketId) console.log("wrong bucket");
        if (xmin < bucketLeft) error("out-of-range");
        if (xmax - xmin >= 0 === false) error("invalid segment");
        if (xmax > bucketLeft + 2 * bucketWidth) {
          p1Arr[tail] = a;
          p2Arr[tail] = b;
          tail--;
        } else {
          p1Arr[head] = a;
          p2Arr[head] = b;
          head++;
        }
        segId++;
      }
    }
    bucketOffsets[bucketCount] = head;
    if (head != tail + 1) error("counting error; head:", head, "tail:", tail);
  }

  function countCrosses(x, y, bucketId) {
    var offs = bucketOffsets[bucketId],
        n = (bucketId == bucketCount) ? p1Arr.length - offs : bucketOffsets[bucketId + 1] - offs,
        count = 0,
        xx = data.xx,
        yy = data.yy,
        a, b;

    for (var i=0; i<n; i++) {
      a = p1Arr[i + offs];
      b = p2Arr[i + offs];
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

}
