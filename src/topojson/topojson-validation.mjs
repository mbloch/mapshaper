import { getArcEndpointCoords } from '../paths/mapshaper-vertex-utils';
import { stop, message, verbose } from '../utils/mapshaper-logging';

function validateRingGeometry(ring, arcs) {
  var ringStart, arcStart, prevArcEnd;
  var coords;
  for (var i=0; i<ring.length; i++) {
    coords = getArcEndpointCoords(ring[i], arcs);
    arcStart = coords[0];
    if (i == 0) {
      ringStart = arcStart;
    } else {
      if (prevArcEnd[0] != arcStart[0] || prevArcEnd[1] != arcStart[1]) {
        warn(`Internal arc misalignment`,  prevArcEnd, arcStart);
      }
    }
    prevArcEnd = coords[1];
  }
  if (prevArcEnd[0] != ringStart[0] || prevArcEnd[1] != ringStart[1]) {
    warn(`Ring endpoint misalignment`, prevArcEnd, ringStart);
  }
}

function warn(msg, a, b) {
  message(msg, `x: ${a[0]} -- ${b[0]}  y: ${a[1]} -- ${b[1]}`);
}
