/* @requires core */

// A heap data structure used for computing Visvalingam simplification data.
//
function Heap() {
  var maxItems,
      dataOffs, dataArr,
      itemsInHeap,
      poppedVal,
      heapArr, indexArr;

  //
  // PUBLIC METHODS
  //

  this.addValues = function(values, start, end) {
    var minId = start | 0,
        maxId = end == null ? values.length - 1 : end | 0;
        maxItems = maxId - minId + 1;
    dataOffs = minId,
    dataArr = values;
    reserveSpace(maxItems);
    itemsInHeap = 0;
    for (var i=0; i<maxItems; i++) {
      itemsInHeap++;
      // add item to bottom of heap and restore order
      updateHeap(i, i + dataOffs);
      reHeap(i);
    }
    poppedVal = -Infinity;
  };

  this.heapSize = function() {
    return itemsInHeap;
  };

  // Update a single value and re-heap.
  //
  this.updateValue = function(valId, val) {
    // TODO: move this logic out of heap
    if (val < poppedVal) {
      // don't give updated values a lesser value than the last popped vertex
      // (required by visvalingam)
      val = poppedVal;
    }
    dataArr[valId] = val;
    var heapIdx = indexArr[valId - dataOffs];
    if (heapIdx == null || heapIdx >= itemsInHeap) error("[updateValue()] out-of-range heap index.");
    reHeap(heapIdx);
  };


  this.testHeapOrder = function() {
    checkNode(0, -Infinity);
    return true;
  };

  // Return the idx of the lowest-value item in the heap
  //
  this.pop = function() {
    if (itemsInHeap <= 0) error("Tried to pop from an empty heap.");
    var minValId = heapArr[0],
        lastIdx = --itemsInHeap;
    if (itemsInHeap > 0) {
      updateHeap(0, heapArr[lastIdx]);// copy last item in heap into root position
      reHeap(0);
    }
    poppedVal = dataArr[minValId];
    return minValId;
  };

  //
  // PRIVATE
  //

  function reserveSpace(heapSize) {
    if (!heapArr || heapSize > heapArr.length) {
      var bufLen = heapSize * 1.2 | 0;
      heapArr = new Int32Array(bufLen);
      indexArr = new Int32Array(bufLen); 
    }
  };

  // Associate a heap idx with the id of a value in valuesArr
  function updateHeap(heapIdx, valId) {
    indexArr[valId - dataOffs] = heapIdx;
    heapArr[heapIdx] = valId;
  }

  // Check that heap is ordered starting at a given node
  // (traverses heap recursively)
  //
  function checkNode(heapIdx, parentVal) {
    if (heapIdx >= itemsInHeap) {
      return;
    }
    var val = dataArr[heapArr[heapIdx]];
    if (parentVal > val) error("Heap is out-of-order");
    var childIdx = heapIdx * 2 + 1;
    checkNode(childIdx, val);
    checkNode(childIdx + 1, val);
  }

  function getMinChildIdx(i, j) {
    if (i >= itemsInHeap) error("Heap index error");
    return j >= itemsInHeap || dataArr[heapArr[i]] <= dataArr[heapArr[j]] ? i : j;
  }

  // Function restores order to the heap (lesser values towards the top of the heap)
  // Receives the idx of a heap item that has just been changed or added.
  // (Assumes the rest of the heap is ordered, this item may be out-of-order)
  //
  function reHeap(currIdx) {
    var valId, currVal,
        parentIdx,
        parentValId,
        parentVal;

    if (currIdx < 0 || currIdx >= itemsInHeap) error("Out-of-bounds heap idx passed to reHeap()");
    valId = heapArr[currIdx];
    currVal = dataArr[valId];

    // Bubbling phase:
    // Move item up in the heap until it's at the top or is heavier than its parent
    //
    while (currIdx > 0) {
      parentIdx = (currIdx - 1) >> 1; // integer division by two gives idx of parent
      parentValId = heapArr[parentIdx];
      parentVal = dataArr[parentValId];

      if (parentVal <= currVal) {
        break;
      }

      // out-of-order; swap child && parent
      updateHeap(currIdx, parentValId);
      updateHeap(parentIdx, valId);
      currIdx = parentIdx;
      // if (dataArr[heapArr[currIdx]] !== currVal) error("Lost value association");
    }

    // Percolating phase:
    // Item gets swapped with any lighter children
    //
    var firstChildIdx = 2 * currIdx + 1,
        minChildIdx, childValId, childVal;

    while (firstChildIdx < itemsInHeap) {
      minChildIdx = getMinChildIdx(firstChildIdx, firstChildIdx + 1);
      childValId = heapArr[minChildIdx];
      childVal = dataArr[childValId];

      if (currVal <= childVal) {
        break;
      }

      // swap curr item and child w/ lesser value
      updateHeap(currIdx, childValId);
      updateHeap(minChildIdx, valId);

      // descend in the heap:
      currIdx = minChildIdx;
      firstChildIdx = 2 * currIdx + 1;
    }
  };
}