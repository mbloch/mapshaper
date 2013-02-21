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
function calcTriangleArea(ax, ay, bx, by, cx, cy) {
  var area = ((ay - cy) * (bx - cx) + (by - cy) * (cx - ax)) / 2;
  return Math.abs(area);
}

// Calc angle in radians given three coordinates with (bx,by) at the vertex.
//
function calcInnerAngle(ax, ay, bx, by, cx, cy) {
  var a1 = Math.atan2(ay - by, ax - bx);
  var a2 = Math.atan2(cy - by, cx - bx);
  var a3 = Math.abs(a1 - a2);
  if (a3 > Math.PI) {
    a3 = 2 * Math.PI - a3;
  }
  return a3;
}

// The standard Visvalingam metric is triangle area.
//
Visvalingam.standardMetric = calcTriangleArea;


// The original mapshaper "modified Visvalingam" function uses a step function to 
// underweight more acute triangles.
//
Visvalingam.specialMetric = function(ax, ay, bx, by, cx, cy) {
  var area = calcTriangleArea(ax, ay, bx, by, cx, cy),
      angle = calcInnerAngle(ax, ay, bx, by, cx, cy),
      weight = angle < 0.5 ? 0.1 : angle < 1 ? 0.3 : 1;
  return area * weight;
};

// Experimenting with a replacement for "Modified Visvalingam"
//
Visvalingam.specialMetric2 = function(ax, ay, bx, by, cx, cy) {
  var area = calcTriangleArea(ax, ay, bx, by, cx, cy),
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

    heap.init(arcLen);

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
    while(heap.size() > 0) {

      // Remove the point with the least effective area.
      idx = heap.pop();
      if (idx < 1 || idx > arcLen - 2) {
        error("Popped first or last arc vertex (error condition); idx:", idx, "len:", len);
      }

      // Recompute effective area of new triangles formed by removing a vertex.
      //
      prevIdx = prevArr[idx];
      if (prevIdx > 0) {
        area = metric(xx[idx], yy[idx], xx[prevIdx], yy[prevIdx], xx[prevArr[prevIdx]], yy[prevArr[prevIdx]]);
        heap.updateValue(prevIdx, area);
      }
      nextIdx = nextArr[idx];
      if (nextIdx < arcLen-1) {
        area = metric(xx[idx], yy[idx], xx[nextIdx], yy[nextIdx], xx[nextArr[nextIdx]], yy[nextArr[nextIdx]]);
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
  var capacity = 0,
      initSize = 0,
      itemsInHeap = 0,
      poppedVal = 0,
      heapArr, indexArr, valueArr;

  // Prepare the heap for simplifying a new arc.
  //
  this.init = function(size) {
    if (size > capacity) {
      capacity = Math.round(size * 1.2);
      heapArr = new Int32Array(capacity);
      indexArr = new Int32Array(capacity);
    }
    itemsInHeap = 0;
    valueArr = new Float64Array(size);
    valueArr[0] = valueArr[size-1] = Infinity;
    initSize = size;
  };

  // Add an item to the bottom of the heap and restore heap order.
  //
  this.addValue = function(valIdx, val) {
    var heapIdx = itemsInHeap++;
    assert(itemsInHeap < capacity, "Heap overflow");
    valueArr[valIdx] = val;
    heapArr[heapIdx] = valIdx
    indexArr[valIdx] = heapIdx;
    reHeap(heapIdx);
  };

  // Return an array of threshold data after simplification is complete.
  //
  this.values = function() {
    return valueArr;
  }

  this.size = function() {
    return itemsInHeap;
  }

  // Update the value of a point in the arc.
  //
  this.updateValue = function(valIdx, val) {
    if (val < poppedVal) {
      // don't give updated values a lesser value than the last popped vertex...
      val = poppedVal;
    }
    valueArr[valIdx] = val;
    var heapIdx = indexArr[valIdx];
    assert(heapIdx >= 0 && heapIdx < itemsInHeap, "[updateValue()] out-of-range heap index.");
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

    assert(currIdx >= 0 && currIdx < itemsInHeap, "Out-of-bounds heap idx passed to reHeap()");
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
    var retnIdx = heapArr[0];
    itemsInHeap--;

    if (itemsInHeap > 0) {
      var lastValIdx = heapArr[itemsInHeap];
      heapArr[0] = lastValIdx; // copy last item in heap into root position
      indexArr[lastValIdx] = 0;
      reHeap(0);
    }

    poppedVal = valueArr[retnIdx];
    return retnIdx;
  };
}
