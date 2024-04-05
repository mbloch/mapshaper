
// TODO: make this stricter (could give false positive on some degenerate paths)
export function pathIsRectangle(ids, arcs) {
  var bbox = arcs.getSimpleShapeBounds(ids).toArray();
  var iter = arcs.getShapeIter(ids);
  var count = 0;
  while (iter.hasNext()) {
    if (iter.x != bbox[0] && iter.x != bbox[2] ||
        iter.y != bbox[1] && iter.y != bbox[3]) {
      return false;
    }
    count++;
  }
  if (count < 5) return false;
  if (bbox[2] > bbox[0] === false || bbox[3] > bbox[1] === false) return false;
  return true;
}

export function bboxToCoords(bbox) {
  return [[bbox[0], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]],
      [bbox[2], bbox[1]], [bbox[0], bbox[1]]];
}
