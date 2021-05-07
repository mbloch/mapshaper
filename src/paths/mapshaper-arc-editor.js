import { message } from '../utils/mapshaper-logging';

// Returns number of arcs that were removed
export function editArcs(arcs, onPoint) {
  var nn2 = [],
      xx2 = [],
      yy2 = [],
      errors = 0,
      n;

  arcs.forEach(function(arc, i) {
    editArc(arc, onPoint);
  });
  arcs.updateVertexData(nn2, xx2, yy2);
  return errors;

  function append(p) {
    if (p) {
      xx2.push(p[0]);
      yy2.push(p[1]);
      n++;
    }
  }

  function editArc(arc, cb) {
    var x, y, xp, yp, retn;
    var valid = true;
    var i = 0;
    n = 0;
    while (arc.hasNext()) {
      x = arc.x;
      y = arc.y;
      retn = cb(append, x, y, xp, yp, i++);
      if (retn === false) {
        valid = false;
        // assumes that it's ok for the arc iterator to be interrupted.
        break;
      }
      xp = x;
      yp = y;
    }
    if (valid && n == 1) {
      // only one valid point was added to this arc (invalid)
      // e.g. this could happen during reprojection.
      // making this arc empty
      // error("An invalid arc was created");
      message("An invalid arc was created");
      valid = false;
    }
    if (valid) {
      nn2.push(n);
    } else {
      // remove any points that were added for an invalid arc
      while (n-- > 0) {
        xx2.pop();
        yy2.pop();
      }
      nn2.push(0); // add empty arc (to preserve mapping from paths to arcs)
      errors++;
    }
  }
}
