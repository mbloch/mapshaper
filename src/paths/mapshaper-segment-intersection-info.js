// TODO: improve

// internal.getIntersectionDebugData = function(o, arcs) {
//   var data = arcs.getVertexData();
//   var a = o.a;
//   var b = o.b;
//   o = utils.extend({}, o);
//   o.ax1 = data.xx[a[0]];
//   o.ay1 = data.yy[a[0]];
//   o.ax2 = data.xx[a[1]];
//   o.ay2 = data.yy[a[1]];
//   o.bx1 = data.xx[b[0]];
//   o.by1 = data.yy[b[0]];
//   o.bx2 = data.xx[b[1]];
//   o.by2 = data.yy[b[1]];
//   return o;
// };

// internal.debugSegmentIntersection = function(p, ax, ay, bx, by, cx, cy, dx, dy) {
//   debug('[debugSegmentIntersection()]');
//   debug('  s1\n  dx:', Math.abs(ax - bx), '\n  dy:', Math.abs(ay - by));
//   debug('  s2\n  dx:', Math.abs(cx - dx), '\n  dy:', Math.abs(cy - dy));
//   debug('  s1 xx:', ax, bx);
//   debug('  s2 xx:', cx, dx);
//   debug('  s1 yy:', ay, by);
//   debug('  s2 yy:', cy, dy);
//   debug('  angle:', geom.signedAngle(ax, ay, bx, by, dx - cx + bx, dy - cy + by));
// };