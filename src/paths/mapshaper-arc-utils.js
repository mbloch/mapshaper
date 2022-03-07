import utils from '../utils/mapshaper-utils';

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

export function deleteVertex(arcs, i) {
  var data = arcs.getVertexData();
  var nn = data.nn;
  var n = data.xx.length;
  // avoid re-allocating memory
  var xx2 = new Float64Array(data.xx.buffer, 0, n-1);
  var yy2 = new Float64Array(data.yy.buffer, 0, n-1);
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
  arcs.updateVertexData(nn, xx2, yy2, null);
}

export function insertVertex(arcs, i, p) {
  // TODO: add extra bytes to the buffers, to reduce new memory allocation
  var data = arcs.getVertexData();
  var nn = data.nn;
  var n = data.xx.length;
  var count = 0;
  var found = false;
  var xx2, yy2;
  // avoid re-allocating memory on each insertion
  if (data.xx.buffer.byteLength >= data.xx.length * 8 + 8) {
    xx2 = new Float64Array(data.xx.buffer, 0, n+1);
    yy2 = new Float64Array(data.yy.buffer, 0, n+1);
  } else {
    xx2 = new Float64Array(new ArrayBuffer((n + 20) * 8), 0, n+1);
    yy2 = new Float64Array(new ArrayBuffer((n + 20) * 8), 0, n+1);
  }
  for (var j=0; j<nn.length; j++) {
    count += nn[j];
    if (count >= i && !found) { // TODO: confirm this
      nn[j] = nn[j] + 1;
      found = true;
    }
  }
  utils.copyElements(data.xx, 0, xx2, 0, i);
  utils.copyElements(data.yy, 0, yy2, 0, i);
  utils.copyElements(data.xx, i, xx2, i+1, n-i);
  utils.copyElements(data.yy, i, yy2, i+1, n-i);
  xx2[i] = p[0];
  yy2[i] = p[1];
  arcs.updateVertexData(nn, xx2, yy2, null);
}
