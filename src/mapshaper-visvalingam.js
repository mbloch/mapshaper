/* @requires mapshaper-common, core.geo */

var Visvalingam = {};

// Simplify an array of arcs using Visvalingam's algorithm, optionally
//   using a custom function for calculating "effective area."
// Returns an array of simplification thresholds matching the input arcs.
//
Visvalingam.simplifyArcs = function(arcs, opts) {
  var metric = opts && opts.metric || Visvalingam.standardMetric,
      calculator = new VisvalingamCalculator(metric);
  var data = Utils.map(arcs, function(arc, i) {
    var thresholds = calculator.calcArcData(arc[0], arc[1]);
    assert(thresholds.length == arc[0].length);
    return thresholds;
  });
  return data;
};

// Calc area of triangle given coords of three vertices.
//
function triangleArea(ax, ay, bx, by, cx, cy) {
  var area = Math.abs(((ay - cy) * (bx - cx) + (by - cy) * (cx - ax)) / 2);
  //var area2 = Math.abs((ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) / 2);
  //if (area != area2) trace(area, area2);
  return area;
}

function triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz) {

  
}

// Calc angle in radians given three coordinates with (bx,by) at the vertex.
// atan2() very slow; replaced by a faster formula 
/*
function innerAngle_v1(ax, ay, bx, by, cx, cy) {
  var a1 = Math.atan2(ay - by, ax - bx),
      a2 = Math.atan2(cy - by, cx - bx),
      a3 = Math.abs(a1 - a2);
  if (a3 > Math.PI) {
    a3 = 2 * Math.PI - a3;
  }
  return a3;
}
*/

function distance3D(ax, ay, az, bx, by, bz) {
  var dx = ax - bx,
      dy = ay - by,
      dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}


function innerAngle(ax, ay, bx, by, cx, cy) {
  var ab = Point.distance(ax, ay, bx, by),
      bc = Point.distance(bx, by, cx, cy),
      dp = (ax - bx) * (cx - bx) + (ay - by) * (cy - by) / (ab * bc);
      theta = dp >= 1 ? 0 : Math.acos(dp); // dp may exceed 1 due to rounding error.
  return theta;
}

/*
function innerAngle3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var ab = distance3D(ax, ay, az, bx, by, bz);
  var bc = distance3D(bx, by, bz, cx, cy, cz);
  var dp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / (ab * bc);
  var theta = dp >= 1 ? 0 : Math.acos(dp);
  return theta;
}
*/

// The standard Visvalingam metric is triangle area.
//
Visvalingam.standardMetric = triangleArea;


// The original mapshaper "modified Visvalingam" function uses a step function to 
// underweight more acute triangles.
//
Visvalingam.specialMetric = function(ax, ay, bx, by, cx, cy) {
  var area = triangleArea(ax, ay, bx, by, cx, cy),
      angle = innerAngle(ax, ay, bx, by, cx, cy),
      weight = angle < 0.5 ? 0.1 : angle < 1 ? 0.3 : 1;
  return area * weight;
};

/*
Visvalingam.specialMetric3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      angle = innerAngle3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      weight = angle < 0.5 ? 0.1 : angle < 1 ? 0.3 : 1;
  return area * weight;
};
*/

// Experimenting with a replacement for "Modified Visvalingam"
//
Visvalingam.specialMetric2 = function(ax, ay, bx, by, cx, cy) {
  var area = triangleArea(ax, ay, bx, by, cx, cy),
      standardLen = area * 1.4,
      hyp = Math.sqrt((ax + cx) * (ax + cx) + (ay + cy) * (ay + cy)),
      weight = hyp / standardLen;
  return area * weight;
};


// The VisvalingamCalculator class uses persistent buffers for temp simplification data,
// to avoid overhead of creating new buffers for each arc.
//
function VisvalingamCalculator(metric) {
  var bufLen = 0,
      heap = new VisvalingamHeap(),
      prevArr, nextArr;

  // Calculate Visvalingam simplification data for an arc
  // Receives two arrays, for x- and y- coordinates.
  // Returns an array of simplification thresholds, one per arc vertex.
  //
  this.calcArcData = function(xx, yy) {
    var arcLen = xx.length;
    if (arcLen > bufLen) {
      bufLen = Math.round(arcLen * 1.2);
      prevArr = new Int32Array(bufLen);
      nextArr = new Int32Array(bufLen);
    }

    heap.init(arcLen-2); // Initialize the heap with room for the arc's internal coordinates.

    // Initialize Visvalingam "effective area" values and references to prev/next points for each point in arc.
    //
    for (var i=1; i<arcLen-1; i++) {
      heap.addValue(i, metric(xx[i-1], yy[i-1], xx[i], yy[i], xx[i+1], yy[i+1]));
      nextArr[i] = i + 1;
      prevArr[i] = i - 1;
    }
    prevArr[arcLen-1] = arcLen - 2;
    nextArr[0] = 1;

    // Calculate removal thresholds for each internal point in the arc
    //
    var idx, nextIdx, prevIdx, area;
    var arr = [];
    while(heap.heapSize() > 0) {

      // Remove the point with the least effective area.
      idx = heap.pop();
      if (idx < 1 || idx > arcLen - 2) {
        error("Popped first or last arc vertex (error condition); idx:", idx, "len:", len);
      }

      // Recompute effective area of neighbors of the removed point.
      prevIdx = prevArr[idx];
      nextIdx = nextArr[idx];
      if (prevIdx > 0) {
        area = metric(xx[nextIdx], yy[nextIdx], xx[prevIdx], yy[prevIdx], xx[prevArr[prevIdx]], yy[prevArr[prevIdx]]);
        heap.updateValue(prevIdx, area);
      }
      if (nextIdx < arcLen-1) {
        area = metric(xx[prevIdx], yy[prevIdx], xx[nextIdx], yy[nextIdx], xx[nextArr[nextIdx]], yy[nextArr[nextIdx]]);
        heap.updateValue(nextIdx, area);
      }
      nextArr[prevIdx] = nextIdx;
      prevArr[nextIdx] = prevIdx;
    }
    return heap.values();
  };
}


// A heap data structure used for computing Visvalingam simplification data.
// 
function VisvalingamHeap() {
  var bufLen = 0,
      maxItems = 0,
      maxIdx, minIdx,
      itemsInHeap,
      poppedVal,
      heapArr, indexArr, valueArr;

  // Prepare the heap for simplifying a new arc.
  //
  this.init = function(size) {
    if (size > bufLen) {
      bufLen = Math.round(size * 1.2);
      heapArr = new Int32Array(bufLen);
      indexArr = new Int32Array(bufLen + 2); // requires larger...
    }
    itemsInHeap = 0;
    poppedVal = -Infinity;
    valueArr = new Float64Array(size + 2);
    valueArr[0] = valueArr[size+1] = Infinity;
    minIdx = 1; 
    maxIdx = size;
    maxItems = size;
  };

  // Add an item to the bottom of the heap and restore heap order.
  //
  this.addValue = function(valIdx, val) {
    var heapIdx = itemsInHeap++;
    if (itemsInHeap > maxItems) error("Heap overflow.");
    if (valIdx < minIdx || valIdx > maxIdx) error("Out-of-bounds point index.");
    valueArr[valIdx] = val;
    heapArr[heapIdx] = valIdx
    indexArr[valIdx] = heapIdx;
    reHeap(heapIdx);
  };

  // Return an array of threshold data after simplification is complete.
  //
  this.values = function() {
    assert(itemsInHeap == 0, "[VisvalingamHeap.values()] Items remain on the heap.");
    return valueArr;
  }

  this.heapSize = function() {
    return itemsInHeap;
  }

  // Update the value of a point in the arc.
  //
  this.updateValue = function(valIdx, val) {
    if (valIdx < minIdx || valIdx > maxIdx) error("Out-of-range point index.");
    if (val < poppedVal) {
      // don't give updated values a lesser value than the last popped vertex...
      val = poppedVal;
    }
    valueArr[valIdx] = val;
    var heapIdx = indexArr[valIdx];
    if (heapIdx < 0 || heapIdx >= itemsInHeap) error("[updateValue()] out-of-range heap index.");
    reHeap(heapIdx);
  };

  // Check that heap is ordered starting at a given node
  // (traverses heap recursively)
  //
  function checkNode(heapIdx, parentVal) {
    if (heapIdx >= itemsInHeap) {
      return;
    }
    var valIdx = heapArr[heapIdx];
    var val = valueArr[valIdx];
    assert(parentVal <= val, "[checkNode()] heap is out-of-order at idx:", heapIdx, "-- parentVal:", parentVal, "nodeVal:", val);
    var childIdx = heapIdx * 2 + 1;
    checkNode(childIdx, val);
    checkNode(childIdx + 1, val);
  }

  function checkHeapOrder() {
    checkNode(0, -Infinity);
  }

  function getHeapValues() {
    var arr = [];
    for (var i=0; i<itemsInHeap; i++) {
      arr.push(valueArr[heapArr[i]]);
    }
    return arr;
  }

  // Function restores order to the heap (lesser values towards the top of the heap)
  // Receives the idx of a heap item that has just been changed or added.
  // (Assumes the rest of the heap is ordered, this item may be out-of-order)
  //
  function reHeap(currIdx) {
    var currValIdx,
        currVal,
        parentIdx,
        parentValIdx,
        parentVal;

    if (currIdx < 0 || currIdx >= itemsInHeap) error("Out-of-bounds heap idx passed to reHeap()");
    currValIdx = heapArr[currIdx];
    currVal = valueArr[currValIdx];

    // Bubbling phase:
    // Move item up in the heap until it's at the top or is heavier than its parent
    //
    while (currIdx > 0) {
      parentIdx = (currIdx - 1) >> 1; // integer division by two gives idx of parent
      parentValIdx = heapArr[parentIdx];
      parentVal = valueArr[parentValIdx];

      if (parentVal <= currVal) {
        break;
      }

      // out-of-order; swap child && parent
      indexArr[parentValIdx] = currIdx;
      indexArr[currValIdx] = parentIdx;
      heapArr[parentIdx] = currValIdx;
      heapArr[currIdx] = parentValIdx;
      currIdx = parentIdx;
      if(valueArr[heapArr[currIdx]] !== currVal) error("Lost value association");
    }

    // Percolating phase:
    // Item gets swapped with any lighter children
    //
    var childIdx = 2 * currIdx + 1,
        childValIdx, childVal,
        otherChildIdx, otherChildValIdx, otherChildVal;

    while (childIdx < itemsInHeap) {
      childValIdx = heapArr[childIdx];
      childVal = valueArr[childValIdx];

      otherChildIdx = childIdx + 1;
      if (otherChildIdx < itemsInHeap) {
        otherChildValIdx = heapArr[otherChildIdx];
        otherChildVal = valueArr[otherChildValIdx];
        if (otherChildVal < childVal) {
          childIdx = otherChildIdx;
          childValIdx = otherChildValIdx;
          childVal = otherChildVal;
        }
      }

      if (currVal <= childVal) {
        break;
      }

      // swap curr item and child w/ lesser value
      heapArr[childIdx] = currValIdx;
      heapArr[currIdx] = childValIdx;
      indexArr[childValIdx] = currIdx;
      indexArr[currValIdx] = childIdx;

      // descend in the heap:
      currIdx = childIdx;
      childIdx = 2 * currIdx + 1;
    }
  };

  // Return the idx of the lowest-value item in the heap
  //
  this.pop = function() {
    if (itemsInHeap <= 0) error("Tried to pop from an empty heap.");
    if (poppedVal === -Infinity) {
      if (itemsInHeap != maxItems) error("pop() called before heap is populated.");
      // trace(indexArr.subarray(1, itemsInHeap + 1));
    }
    // get min-val item from top of heap...
    var minIdx = heapArr[0],
        minVal = valueArr[minIdx],
        lastIdx;

    lastIdx = --itemsInHeap;
    if (itemsInHeap > 0) {
      heapArr[0] = heapArr[lastIdx]; // copy last item in heap into root position
      indexArr[heapArr[0]] = 0;
      reHeap(0);
    }

    if (minVal < poppedVal) error("[VisvalingamHeap.pop()] out-of-sequence value; prev:", poppedVal, "new:", minVal);
    poppedVal = minVal;
    return minIdx;
  };
}
