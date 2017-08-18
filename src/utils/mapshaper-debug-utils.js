/* @requires mapshaper-nodes */

internal.debugNode = function(arcId, nodes) {
  var ids = [arcId];
  var arcs = nodes.arcs;
  nodes.forEachConnectedArc(arcId, function(id) {
    ids.push(id);
  });

  message("node ids:",  ids);
  ids.forEach(printArc);

  function printArc(id) {
    var str = id + ": ";
    var len = arcs.getArcLength(id);
    if (len > 0) {
      var p1 = arcs.getVertex(id, -1);
      str += utils.format("[%f, %f]", p1.x, p1.y);
      if (len > 1) {
        var p2 = arcs.getVertex(id, -2);
        str += utils.format(", [%f, %f]", p2.x, p2.y);
        if (len > 2) {
          var p3 = arcs.getVertex(id, 0);
          str += utils.format(", [%f, %f]", p3.x, p3.y);
        }
        str += " len: " + distance2D(p1.x, p1.y, p2.x, p2.y);
      }
    } else {
      str = "[]";
    }
    message(str);
  }
};
