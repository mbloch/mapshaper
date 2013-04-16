/* @requires core.geo, median */

function BoundsIndex(bounds, opts) {
  var defaults = {
    maxBinSize: 500
  };
  opts = Utils.extend(defaults, opts);

  var maxInCell = opts.maxBinSize;
  var capacity = 0,
      size = 0;
  var allCells = [newCell(new BoundingBox(-Infinity, Infinity, Infinity, -Infinity))];
  var bbs,
      ccx,
      ccy;

  populate(bounds);

  this.size = function() {
    return size;
  };

  // for testing
  this.binCount = function() {
    return allCells.length;
  }

  function populate(boxes) {
    var box;
    bbs = boxes;
    capacity = boxes.length;
    size = 0;
    // get cx, cy
    ccx = new Float64Array(capacity);
    ccy = new Float64Array(capacity);

    for (var i=0; i<capacity; i++) {
      box = boxes[i];
      ccx[i] = (box[0] + box[2]) / 2;
      ccy[i] = (box[1] + box[3]) / 2;
      indexItem(i);
    }
  };

  /*
  function SpatialView() {
    var inCells = allCells.concat(),
        outCells = [],
        partialCells = [];

    var bounds = new BoundingBox().setBounds(-Infinity, Infinity, Infinity, -Infinity);

    this.getItemsInBoundingBox(box) {
      // update....

    }
  } */

  this.getIntersection = function(box) {
    var targ = Utils.isArray(box) ? new BoundingBox(bbox[0], bbox[3], bbox[2], bbox[0]) : box;
    var ids = [];

    for (var i=0, n=allCells.length; i<n; i++) {
      var cell = allCells[i];
      if (targ.contains(cell.contentBounds)) {
        ids.push.apply(ids, cell.ids);
      } else if (targ.intersects(cell.contentBounds)) {
        testCandidates(cell.ids, targ, ids);
      }
    }

    return ids;
  };

  function testCandidates(cands, bbox, ids) {
    var bb = new BoundingBox();
    for (var i=0, n=cands.length; i<n; i++) {
      var id = cands[i];
      var box = bbs[id];
      bb.left = box[0];
      bb.bottom = box[1];
      bb.right = box[2];
      bb.top = box[3];
      if (bbox.intersects(bb)) {
        ids.push(id);
      }
    }
  }

  function indexItem(id) {
    if (size >= capacity) error("BoundsIndex#addItem() overflow");
    size++;
    var cell = placeItem(id, allCells);
    if (cell.ids.length > maxInCell) {
      divideCell(cell);
    }
  }

  function placeItem(id, cells) {
    var cx = ccx[id],
        cy = ccy[id],
        cell;

    for (var i=0, n=cells.length; i<n; i++) {
      cell = cells[i];
      if (cell.bounds.containsPoint(cx, cy)) {
        addItemToCell(id, cell);
        return cell;
      }
    }
    error("BoundsIndex#placeItem() couldn't evaluate symbol at:", cx, cy);
  }

  function addItemToCell(id, cell) {
    var box = bbs[id];
    cell.contentBounds.mergePoint(box[0], box[1]);
    cell.contentBounds.mergePoint(box[2], box[3]);
    cell.ids.push(id);
  }

  function splitBoxOnY(box, y) {
    if (!box.containsPoint(box.left, y)) error("Out-of-bounds y");
    var box2 = new BoundingBox();
    box2.setBounds(box.left, y, box.right, box.bottom);
    box.bottom = y;
    return box;
  }

  function splitBoxOnX(box, x) {
    if (!box.containsPoint(x, box.top)) error("Out-of-bounds x");
    var box2 = new BoundingBox();
    box2.setBounds(x, box.top, box.right, box.bottom);
    box.right = x;
    return box2;
  }

  function divideCell(cell) {
    var ids = cell.ids,
        splitVertically = cell.contentBounds.height() > cell.contentBounds.width(),
        centers = splitVertically ? ccy: ccx,
        coords = Utils.filterById(centers, ids); // copy selected coords into an array

    // find the partition value
    var median = Utils.findValueByRank(coords, (ids.length / 2) | 0);

    // remove content from original cell...
    cell.ids = [];
    cell.contentBounds = new BoundingBox();

    // reduce bbox of cell, create new cell from split-off part
    var box2 = splitVertically ? splitBoxOnY(cell.bounds, median) : splitBoxOnX(cell.bounds, median);
    var cell2 = newCell(box2);
    allCells.push(cell2);

    // add items to one of the two cells
    var cells = [cell, cell2];
    for (var i=0, n=ids.length; i<n; i++) {
      placeItem(ids[i], cells);
    }
  }

  function newCell(bb) {
    var cell = {
      bounds: bb,
      contentBounds: new BoundingBox(),
      ids: []
    }
    return cell;
  }
}