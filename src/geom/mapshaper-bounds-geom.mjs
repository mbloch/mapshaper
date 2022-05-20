import geom from '../geom/mapshaper-geom';

export function testSegmentBoundsIntersection(a, b, bb) {
  if (bb.containsPoint(a[0], a[1])) {
    return true;
  }
  return !!(
    geom.segmentIntersection(a[0], a[1], b[0], b[1], bb.xmin, bb.ymin, bb.xmin, bb.ymax) ||
    geom.segmentIntersection(a[0], a[1], b[0], b[1], bb.xmin, bb.ymax, bb.xmax, bb.ymax) ||
    geom.segmentIntersection(a[0], a[1], b[0], b[1], bb.xmax, bb.ymax, bb.xmax, bb.ymin) ||
    geom.segmentIntersection(a[0], a[1], b[0], b[1], bb.xmax, bb.ymin, bb.xmin, bb.ymin));
}
