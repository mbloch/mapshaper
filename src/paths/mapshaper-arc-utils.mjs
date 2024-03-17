import utils from '../utils/mapshaper-utils';
import { error } from '../utils/mapshaper-logging';

export function absArcId(arcId) {
  return arcId >= 0 ? arcId : ~arcId;
}

export function calcArcBounds(xx, yy, start, len) {
  var i = start | 0,
      n = isNaN(len) ? xx.length - i : len + i,
      x, y, xmin, ymin, xmax, ymax;
  if (n > 0) {
    xmin = xmax = xx[i];
    ymin = ymax = yy[i];
  }
  for (i++; i<n; i++) {
    x = xx[i];
    y = yy[i];
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  return [xmin, ymin, xmax, ymax];
}

export function getUnfilteredArcLength(arcId, arcs) {
  var data = arcs.getVertexData();
  return data.nn[arcId];
}

export function getUnfilteredArcCoords(arcId, arcs) {
  var data = arcs.getVertexData();
  var coords = [];
  var start = data.ii[arcId];
  var n = data.nn[arcId];
  for (var i=0; i<n; i++) {
    coords.push([data.xx[start + i], data.yy[start + i]]);
  }
  return coords;
}

export function findArcIdFromVertexId(i, ii) {
  // binary search
  // possible optimization: use interpolation to find a better partition value.
  var lower = 0, upper = ii.length - 1;
  var middle;
  while (lower < upper) {
    middle = Math.ceil((lower + upper) / 2);
    if (i < ii[middle]) {
      upper = middle - 1;
    } else {
      lower = middle;
    }
  }
  return lower; // assumes dataset is not empty
}

export function deleteLastArc(arcs) {
  var data = arcs.getVertexData();
  var arcId = arcs.size() - 1;
  var arcLen = data.nn[arcId];
  var n = data.xx.length;
  var z = arcs.getRetainedInterval();
  var xx2 = new Float64Array(data.xx.buffer, 0, n-arcLen);
  var yy2 = new Float64Array(data.yy.buffer, 0, n-arcLen);
  var nn2 = new Int32Array(data.nn.buffer, 0, arcs.size() - 1);
  var zz2 = arcs.isFlat() ?
    null :
    new Float64Array(data.zz.buffer, 0, n-arcLen);
  arcs.updateVertexData(nn2, xx2, yy2, zz2);
  arcs.setRetainedInterval(z);
}

export function deleteVertex(arcs, i) {
  var data = arcs.getVertexData();
  var nn = data.nn;
  var n = data.xx.length;
  // avoid re-allocating memory
  var xx2 = new Float64Array(data.xx.buffer, 0, n-1);
  var yy2 = new Float64Array(data.yy.buffer, 0, n-1);
  var zz2 = arcs.isFlat() ? null : new Float64Array(data.zz.buffer, 0, n-1);
  var z = arcs.getRetainedInterval();
  var count = 0;
  var found = false;
  for (var j=0; j<nn.length; j++) {
    count += nn[j];
    if (count >= i && !found) { // TODO: confirm this
      nn[j] = nn[j] - 1;
      found = true;
    }
  }
  utils.copyElements(data.xx, 0, xx2, 0, i);
  utils.copyElements(data.yy, 0, yy2, 0, i);
  utils.copyElements(data.xx, i+1, xx2, i, n-i-1);
  utils.copyElements(data.yy, i+1, yy2, i, n-i-1);
  if (zz2) {
    utils.copyElements(data.zz, 0, zz2, 0, i);
    utils.copyElements(data.zz, i+1, zz2, i, n-i-1);
  }
  arcs.updateVertexData(nn, xx2, yy2, zz2);
  arcs.setRetainedInterval(z);
}

export function appendEmptyArc(arcs) {
  var data = arcs.getVertexData();
  var nn = utils.extendBuffer(data.nn, data.nn.length + 1, data.nn.length);
  arcs.updateVertexData(nn, data.xx, data.yy, data.zz);
}

// adds vertex to last arc
// (used when adding lines in the GUI)
// p: [x, y] point in display coordinates
export function appendVertex(arcs, p) {
  var i = arcs.getPointCount(); // one past the last idx
  insertVertex(arcs, i, p);
}

export function insertVertex(arcs, i, p) {
  var data = arcs.getVertexData();
  var nn = data.nn;
  var n = data.xx.length;
  var count = 0;
  var xx2, yy2, zz2;
  // avoid re-allocating memory on each insertion
  if (data.xx.buffer.byteLength >= data.xx.length * 8 + 8) {
    xx2 = new Float64Array(data.xx.buffer, 0, n+1);
    yy2 = new Float64Array(data.yy.buffer, 0, n+1);
  } else {
    xx2 = new Float64Array(new ArrayBuffer((n + 50) * 8), 0, n+1);
    yy2 = new Float64Array(new ArrayBuffer((n + 50) * 8), 0, n+1);
  }
  if (!arcs.isFlat()) {
    zz2 = new Float64Array(new ArrayBuffer((n + 1) * 8), 0, n+1);
  }
  if (i < 0 || i > n) {
    error('Out-of-range vertex insertion index:', i);
  } else if (i == n) {
    // appending vertex to last arc
    nn[nn.length - 1]++;
  } else {
    for (var j=0; j<nn.length; j++) {
      count += nn[j];
      if (count >= i) { // TODO: confirm this
        nn[j] = nn[j] + 1;
        break;
      }
    }
  }

  utils.copyElements(data.xx, 0, xx2, 0, i);
  utils.copyElements(data.yy, 0, yy2, 0, i);
  utils.copyElements(data.xx, i, xx2, i+1, n-i);
  utils.copyElements(data.yy, i, yy2, i+1, n-i);
  xx2[i] = p[0];
  yy2[i] = p[1];
  if (zz2) {
    zz2[i] = Infinity;
    utils.copyElements(data.zz, 0, zz2, 0, i);
    utils.copyElements(data.zz, i, zz2, i+1, n-i);
  }
  arcs.updateVertexData(nn, xx2, yy2, zz2);
}

export function countFilteredVertices(zz, zlimit) {
  var count = 0;
  for (var i=0, n = zz.length; i<n; i++) {
    if (zz[i] >= zlimit) count++;
  }
  return count;
}

export function filterVertexData(o, zlimit) {
  if (!o.zz) error('Expected simplification data');
  var xx = o.xx,
      yy = o.yy,
      zz = o.zz,
      len2 = countFilteredVertices(zz, zlimit),
      arcCount = o.nn.length,
      xx2 = new Float64Array(len2),
      yy2 = new Float64Array(len2),
      zz2 = new Float64Array(len2),
      nn2 = new Int32Array(arcCount),
      i = 0, i2 = 0,
      n, n2;

  for (var arcId=0; arcId < arcCount; arcId++) {
    n2 = 0;
    n = o.nn[arcId];
    for (var end = i+n; i < end; i++) {
      if (zz[i] >= zlimit) {
        xx2[i2] = xx[i];
        yy2[i2] = yy[i];
        zz2[i2] = zz[i];
        i2++;
        n2++;
      }
    }
    if (n2 == 1) {
      error("Collapsed arc");
      // This should not happen (endpoints should be z == Infinity)
      // Could handle like this, instead of throwing an error:
      // n2 = 0;
      // xx2.pop();
      // yy2.pop();
      // zz2.pop();
    } else if (n2 === 0) {
      // collapsed arc... ignoring
    }
    nn2[arcId] = n2;
  }
  return {
    xx: xx2,
    yy: yy2,
    zz: zz2,
    nn: nn2
  };
}

