import { geom, internal } from './gui-core';
import { El } from './gui-el';
import { getDatasetCrsInfo, translateDisplayPoint } from './gui-display-utils';
import {
  getDistanceDisplay,
  getDistanceUnit,
  interpolateGreatCirclePoint,
  pointIsInLngLatRange,
  pointIsNearPole,
  segmentCrossesAntimeridian
} from './gui-ruler-utils';

var SVG_NS = 'http://www.w3.org/2000/svg';
var OUT_OF_RANGE_MESSAGE = 'out of range';
var GEODESIC_PIXEL_TOLERANCE = 1.5;
var GEODESIC_MAX_DEPTH = 14;
var GEODESIC_MAX_SEGMENT_PX = 18;
var GEODESIC_MAX_SUBDIVISIONS = 1500;
var ENDPOINT_HIT_RADIUS = 10;
var WEB_MERCATOR_HALF_WORLD = 6378137 * Math.PI;
var WEB_MERCATOR_MAX_Y = 6378137 * Math.log(Math.tan(Math.PI * 0.25 + 84 * Math.PI / 360));

export function RulerTool(gui, ext) {
  var mapLayers = gui.container.findChild('.map-layers');
  var parent = gui.container.findChild('.mshp-main-map');
  var svg = createSvgNode('svg');
  var directPath = createSvgNode('path');
  var geodesicPath = createSvgNode('path');
  var startMarker = createSvgNode('circle');
  var endMarker = createSvgNode('circle');
  var popup = El('div').addClass('ruler-popup rollover').appendTo(parent).hide();
  var content = El('div').addClass('ruler-popup-content').appendTo(popup);
  var closeBtn = El('button').addClass('label-style-close ruler-close-btn').appendTo(popup).text('×');
  var wgs84 = internal.parseCrsString('wgs84');
  var _on = false;
  var startPoint = null;
  var pointerPoint = null;
  var placed = false;
  var draggingEndpoint = null;
  var lastValidDragPoint = null;

  svg.classList.add('ruler-overlay');
  directPath.classList.add('ruler-line');
  geodesicPath.classList.add('ruler-line', 'ruler-great-circle');
  startMarker.classList.add('ruler-endpoint');
  endMarker.classList.add('ruler-endpoint');
  svg.appendChild(directPath);
  svg.appendChild(geodesicPath);
  svg.appendChild(startMarker);
  svg.appendChild(endMarker);
  mapLayers.node().appendChild(svg);

  closeBtn.on('click', function(e) {
    e.stopPropagation();
    reset();
    if (gui.interaction.getMode() == 'ruler') {
      gui.interaction.turnOff();
    }
  });

  gui.keyboard.on('keydown', function(e) {
    if (!_on || e.keyName != 'esc') return;
    clearRuler();
    ensureRulerMode();
    e.originalEvent.preventDefault();
    e.originalEvent.stopPropagation();
    e.stopPropagation();
  }, null, 10);

  gui.addMode('ruler_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'ruler') {
      gui.enterMode('ruler_tool');
    } else if (_on) {
      gui.clearMode();
    }
  });

  gui.on('map_click', function(e) {
    if (!_on) return;
    handleClick(e);
  });

  gui.map.getMouse().on('hover', function(e) {
    if (!_on || !startPoint || placed) return;
    pointerPoint = getRulerPoint(e.x, e.y);
    render();
  });

  gui.map.getMouse().on('dragstart', function(e) {
    if (!_on || !placed) return;
    draggingEndpoint = getHitEndpoint(e.x, e.y);
    if (!draggingEndpoint) return;
    lastValidDragPoint = getEndpoint(draggingEndpoint);
    mapLayers.addClass('ruler-dragging');
    e.stopPropagation();
  }, null, 10);

  gui.map.getMouse().on('drag', function(e) {
    var point;
    if (!draggingEndpoint) return;
    point = getRulerPoint(e.x, e.y);
    setEndpoint(draggingEndpoint, point);
    if (point.valid) {
      lastValidDragPoint = point;
    }
    render();
    e.stopPropagation();
  }, null, 10);

  gui.map.getMouse().on('dragend', function(e) {
    if (!draggingEndpoint) return;
    if (!getEndpoint(draggingEndpoint).valid && lastValidDragPoint) {
      setEndpoint(draggingEndpoint, lastValidDragPoint);
      render();
    }
    draggingEndpoint = null;
    lastValidDragPoint = null;
    mapLayers.removeClass('ruler-dragging');
    gui.dispatchEvent('map_interaction_end');
    e.stopPropagation();
  }, null, 10);

  gui.on('map_rendered', function() {
    if (_on) render();
  });

  gui.map.on('display_crs_change', function() {
    if (_on) reprojectStoredRulerPoints();
  });

  gui.model.on('update', function() {
    if (_on) reset();
  });

  function turnOn() {
    _on = true;
    mapLayers.addClass('ruler-tool');
    reset();
  }

  function turnOff() {
    _on = false;
    mapLayers.removeClass('ruler-tool');
    reset();
    if (gui.interaction.getMode() == 'ruler') {
      gui.interaction.turnOff();
    }
  }

  function handleClick(e) {
    var point = getRulerPoint(e.x, e.y);
    if (!point.valid) {
      if (startPoint && !placed) {
        pointerPoint = point;
        render();
      } else {
        showOutOfRangeNote();
      }
      return;
    }
    if (!startPoint || placed) {
      startPoint = point;
      pointerPoint = null;
      placed = false;
    } else {
      pointerPoint = point;
      placed = true;
    }
    render();
  }

  function reset() {
    clearRuler();
  }

  function clearRuler() {
    startPoint = null;
    pointerPoint = null;
    placed = false;
    draggingEndpoint = null;
    lastValidDragPoint = null;
    mapLayers.removeClass('ruler-dragging');
    clearSvgPath(directPath);
    clearSvgPath(geodesicPath);
    hideMarker(startMarker);
    hideMarker(endMarker);
    popup.hide();
  }

  function ensureRulerMode() {
    if (gui.interaction.getMode() != 'ruler') {
      gui.interaction.setMode('ruler');
    }
  }

  function render() {
    var endPoint = pointerPoint;
    var measurement;
    syncOverlaySize();
    if (!startPoint || !endPoint) {
      clearSvgPath(directPath);
      clearSvgPath(geodesicPath);
      drawMarker(startMarker, startPoint);
      hideMarker(endMarker);
      popup.hide();
      return;
    }

    if (!startPoint.valid || !endPoint.valid) {
      clearSvgPath(directPath);
      clearSvgPath(geodesicPath);
      drawMarker(startMarker, startPoint.valid ? startPoint : null, false);
      drawMarker(endMarker, placed && endPoint.valid ? endPoint : null, false);
      showOutOfRangeNote();
      return;
    }

    measurement = getMeasurement(startPoint, endPoint);
    drawRulerLines(startPoint, endPoint, measurement);
    drawMarker(startMarker, startPoint, measurement.isLatLng);
    if (placed) {
      drawMarker(endMarker, endPoint, measurement.isLatLng);
    } else {
      hideMarker(endMarker);
    }
    showPopup(measurement);
  }

  function drawRulerLines(a, b, measurement) {
    if (measurement.isLatLng) {
      drawPath(geodesicPath, getGeodesicPixels(a, b));
      clearSvgPath(directPath);
    } else {
      drawPath(directPath, [a.display, b.display]);
      drawPath(geodesicPath, measurement.greatCircleMeters ? getGeodesicPixels(a, b) : null);
    }
  }

  function showPopup(measurement) {
    content.empty();
    measurement.labels.forEach(function(label) {
      El('div').appendTo(content).text(label);
    });
    if (placed) {
      closeBtn.show();
    } else {
      closeBtn.hide();
    }
    popup.show();
  }

  function showOutOfRangeNote() {
    content.empty();
    El('div').appendTo(content).text(OUT_OF_RANGE_MESSAGE);
    if (placed) {
      closeBtn.show();
    } else {
      closeBtn.hide();
    }
    popup.show();
  }

  function getHitEndpoint(x, y) {
    var startDist = getEndpointPixelDistance(startPoint, x, y);
    var endDist = getEndpointPixelDistance(pointerPoint, x, y);
    if (startDist > ENDPOINT_HIT_RADIUS && endDist > ENDPOINT_HIT_RADIUS) return null;
    return startDist <= endDist ? 'start' : 'end';
  }

  function getEndpointPixelDistance(point, x, y) {
    var p;
    if (!point || !point.valid) return Infinity;
    p = ext.translateCoords(point.display[0], point.display[1]);
    return geom.distance2D(p[0], p[1], x, y);
  }

  function getEndpoint(endpoint) {
    return endpoint == 'start' ? startPoint : pointerPoint;
  }

  function setEndpoint(endpoint, point) {
    if (endpoint == 'start') {
      startPoint = point;
    } else {
      pointerPoint = point;
    }
  }

  function getRulerPoint(x, y) {
    var display = ext.pixCoordsToMapCoords(x, y);
    var lyr = gui.map.getActiveLayer();
    var displayCRS = gui.map.getDisplayCRS();
    var sourceCRS = getSourceCRS();
    if (!displayPointIsInRange(display, displayCRS)) {
      return {
        display,
        data: null,
        lngLat: null,
        sourceCRS,
        valid: false
      };
    }
    var data = lyr ? translateDisplayPoint(lyr, display) : display;
    var o = validateRulerPoint(data, sourceCRS);
    return {
      display,
      data,
      lngLat: o.lngLat,
      sourceCRS,
      valid: o.valid
    };
  }

  function reprojectStoredRulerPoints() {
    startPoint = reprojectRulerPoint(startPoint);
    pointerPoint = reprojectRulerPoint(pointerPoint);
    if (startPoint && !startPoint.valid || pointerPoint && !pointerPoint.valid) {
      showOutOfRangeNote();
    }
    render();
  }

  function reprojectRulerPoint(point) {
    var displayCRS = gui.map.getDisplayCRS();
    var sourceCRS = getSourceCRS();
    var data = point && point.data;
    var project, display, o;
    if (!point || !data) return point;
    if (displayCRS && sourceCRS && !internal.crsHaveSameTransform(sourceCRS, displayCRS)) {
      project = internal.getProjTransform2(sourceCRS, displayCRS);
      display = project && project(data[0], data[1]);
    } else {
      display = data;
    }
    if (!displayPointIsInRange(display, displayCRS)) {
      return Object.assign({}, point, {
        display,
        sourceCRS,
        valid: false
      });
    }
    o = validateRulerPoint(data, sourceCRS);
    return {
      display,
      data,
      lngLat: o.lngLat,
      sourceCRS,
      valid: o.valid
    };
  }

  function displayPointIsInRange(display, displayCRS) {
    if (!pointHasFiniteCoords(display)) return false;
    if (!displayCRS || !internal.isWebMercator(displayCRS)) return true;
    return display[0] >= -WEB_MERCATOR_HALF_WORLD &&
      display[0] <= WEB_MERCATOR_HALF_WORLD &&
      display[1] >= -WEB_MERCATOR_MAX_Y &&
      display[1] <= WEB_MERCATOR_MAX_Y;
  }

  function getSourceCRS() {
    var lyr = gui.map.getActiveLayer();
    var dataset = lyr && lyr.gui && lyr.gui.source && lyr.gui.source.dataset;
    var info = dataset ? getDatasetCrsInfo(dataset) : null;
    if (info && info.crs) return info.crs;
    if (!lyr) return gui.map.getDisplayCRS() || wgs84;
    return gui.map.getDisplayCRS() || null;
  }

  function validateRulerPoint(data, sourceCRS) {
    var lngLat;
    var valid;
    if (!pointHasFiniteCoords(data)) {
      return {valid: false, lngLat: null};
    }
    if (!sourceCRS) {
      return {valid: true, lngLat: null};
    }
    if (internal.isLatLngCRS(sourceCRS)) {
      return {
        valid: pointIsInLngLatRange(data),
        lngLat: pointIsInLngLatRange(data) ? data : null
      };
    }
    if (!internal.isInvertibleCRS(sourceCRS)) {
      return {valid: true, lngLat: null};
    }
    lngLat = internal.toLngLat(data, sourceCRS);
    valid = pointIsInLngLatRange(lngLat) && inverseProjectionLooksStable(data, lngLat, sourceCRS);
    return {
      valid,
      lngLat: valid ? lngLat : null
    };
  }

  function inverseProjectionLooksStable(data, lngLat, sourceCRS) {
    var fwd = internal.projectPoint(lngLat, wgs84, sourceCRS);
    var tolerance = sourceCRS.to_meter ? 10 / sourceCRS.to_meter : 10;
    return pointHasFiniteCoords(fwd) &&
      geom.distance2D(data[0], data[1], fwd[0], fwd[1]) <= tolerance;
  }

  function getMeasurement(a, b) {
    var isLatLng = internal.isLatLngCRS(a.sourceCRS);
    var projectedMeters = isLatLng ? null : getProjectedDistanceMeters(a, b);
    var greatCircleMeters = getGreatCircleDistanceMeters(a, b);
    var unit = getDistanceUnit(projectedMeters || greatCircleMeters || 0);
    var labels = [];

    if (projectedMeters !== null) {
      labels.push('Projected: ' + getDistanceDisplay(projectedMeters, unit).label);
      if (greatCircleMeters !== null) {
        labels.push('Great circle: ' + getDistanceDisplay(greatCircleMeters, unit).label);
      }
    } else if (greatCircleMeters !== null) {
      labels.push('Great circle: ' + getDistanceDisplay(greatCircleMeters, unit).label);
    }
    return {
      isLatLng,
      projectedMeters,
      greatCircleMeters,
      labels: labels.length ? labels : ['Distance unavailable']
    };
  }

  function getProjectedDistanceMeters(a, b) {
    var toMeter = a.sourceCRS && a.sourceCRS.to_meter || 1;
    if (!a.data || !b.data) return null;
    return geom.distance2D(a.data[0], a.data[1], b.data[0], b.data[1]) * toMeter;
  }

  function getGreatCircleDistanceMeters(a, b) {
    if (!a.lngLat || !b.lngLat) return null;
    return geom.greatCircleDistance(a.lngLat[0], a.lngLat[1], b.lngLat[0], b.lngLat[1]);
  }

  function getGeodesicPixels(a, b) {
    var displayCRS = gui.map.getDisplayCRS() || a.sourceCRS;
    var project = displayCRS ? internal.getProjTransform2(wgs84, displayCRS) : null;
    var points = [];
    var start = getGeodesicEndpoint(a);
    var end = getGeodesicEndpoint(b);
    var state = {subdivisions: 0};

    if (!a.lngLat || !b.lngLat || !project || !start || !end) return null;
    points.push(start.display);
    appendAdaptiveGeodesicSegment(points, start, end, project, 0, state);
    return countPathPoints(points) > 1 ? points : null;
  }

  function getGeodesicEndpoint(point) {
    // Anchor the rendered great-circle line to the actual ruler endpoint.
    // Some projections have inverse/forward roundoff near their boundary, so
    // projecting point.lngLat back to display coords can visibly miss the marker.
    return point.lngLat ? {lngLat: point.lngLat, display: point.display} : null;
  }

  function appendAdaptiveGeodesicSegment(points, a, b, project, depth, state) {
    var midLngLat = getGeodesicLngLatAt(a.lngLat, b.lngLat, 0.5);
    var mid = getProjectedGeodesicPoint(midLngLat, project);
    if (++state.subdivisions > GEODESIC_MAX_SUBDIVISIONS) {
      if (segmentCrossesAntimeridian(a.lngLat, b.lngLat)) {
        addPathBreak(points);
      }
      addPathPoint(points, b.display);
      return;
    }
    if (!mid) {
      handleInvalidGeodesicMidpoint(points, a, b, midLngLat, project, depth, state);
      return;
    }
    if (segmentCrossesAntimeridian(a.lngLat, b.lngLat)) {
      if (depth < GEODESIC_MAX_DEPTH) {
        appendAdaptiveGeodesicSegment(points, a, mid, project, depth + 1, state);
        appendAdaptiveGeodesicSegment(points, mid, b, project, depth + 1, state);
      } else {
        addPathBreak(points);
        addPathPoint(points, b.display);
      }
    } else if (depth < GEODESIC_MAX_DEPTH && segmentNeedsSubdivision(a, b, mid, project)) {
      appendAdaptiveGeodesicSegment(points, a, mid, project, depth + 1, state);
      appendAdaptiveGeodesicSegment(points, mid, b, project, depth + 1, state);
    } else {
      addPathPoint(points, b.display);
    }
  }

  function segmentNeedsSubdivision(a, b, mid, project) {
    var samples = [
      getGeodesicPointAt(a.lngLat, b.lngLat, 0.25, project),
      mid,
      getGeodesicPointAt(a.lngLat, b.lngLat, 0.75, project)
    ];
    return getScreenDistance(a.display, b.display) > GEODESIC_MAX_SEGMENT_PX ||
      getGeodesicPixelError(a.display, b.display, samples) > GEODESIC_PIXEL_TOLERANCE;
  }

  function getGeodesicPointAt(a, b, k, project) {
    return getProjectedGeodesicPoint(getGeodesicLngLatAt(a, b, k), project);
  }

  function getGeodesicLngLatAt(a, b, k) {
    return interpolateGreatCirclePoint(a, b, k);
  }

  function handleInvalidGeodesicMidpoint(points, a, b, midLngLat, project, depth, state) {
    var left, right;
    if (depth >= GEODESIC_MAX_DEPTH) {
      addPathBreak(points);
      addPathPoint(points, b.display);
      return;
    }
    left = findNearestValidGeodesicPoint(a.lngLat, midLngLat, project);
    right = findNearestValidGeodesicPoint(b.lngLat, midLngLat, project);
    if (left && lngLatPointsDiffer(a.lngLat, left.lngLat)) {
      appendAdaptiveGeodesicSegment(points, a, left, project, depth + 1, state);
    }
    addPathBreak(points);
    if (right && lngLatPointsDiffer(b.lngLat, right.lngLat)) {
      addPathPoint(points, right.display);
      appendAdaptiveGeodesicSegment(points, right, b, project, depth + 1, state);
    } else {
      addPathPoint(points, b.display);
    }
  }

  function findNearestValidGeodesicPoint(validLngLat, invalidLngLat, project) {
    var lo = 0;
    var hi = 1;
    var best = getProjectedGeodesicPoint(validLngLat, project, true);
    var p, k;
    if (!best) return null;
    for (var i = 0; i < 16; i++) {
      k = (lo + hi) / 2;
      p = getProjectedGeodesicPoint(getGeodesicLngLatAt(validLngLat, invalidLngLat, k), project);
      if (p) {
        best = p;
        lo = k;
      } else {
        hi = k;
      }
    }
    return best;
  }

  function lngLatPointsDiffer(a, b) {
    return a[0] != b[0] || a[1] != b[1];
  }

  function getProjectedGeodesicPoint(lngLat, project, allowNearPole) {
    var display;
    if (!pointIsInLngLatRange(lngLat) || !allowNearPole && pointIsNearPole(lngLat)) return null;
    display = project(lngLat[0], lngLat[1]);
    return pointHasFiniteCoords(display) ? {lngLat, display} : null;
  }

  function addPathBreak(points) {
    if (points.length > 0 && points[points.length - 1] !== null) {
      points.push(null);
    }
  }

  function addPathPoint(points, p) {
    if (points[points.length - 1] === null && points.length > 1) {
      points.push(p);
    } else if (points.length === 0 || points[points.length - 1] !== p) {
      points.push(p);
    }
  }

  function countPathPoints(points) {
    var count = 0;
    points.forEach(function(p) {
      if (p) count++;
    });
    return count;
  }

  function getGeodesicPixelError(a, b, samples) {
    var p1 = ext.translateCoords(a[0], a[1]);
    var p2 = ext.translateCoords(b[0], b[1]);
    return samples.reduce(function(max, sample) {
      var p3;
      if (!sample) return Infinity;
      p3 = ext.translateCoords(sample.display[0], sample.display[1]);
      return Math.max(max, pointSegDist(p3[0], p3[1], p1[0], p1[1], p2[0], p2[1]));
    }, 0);
  }

  function getScreenDistance(a, b) {
    var p1 = ext.translateCoords(a[0], a[1]);
    var p2 = ext.translateCoords(b[0], b[1]);
    return geom.distance2D(p1[0], p1[1], p2[0], p2[1]);
  }

  function syncOverlaySize() {
    svg.setAttribute('width', ext.width());
    svg.setAttribute('height', ext.height());
  }

  function drawPath(path, points) {
    var d, started = false;
    if (!points || countPathPoints(points) < 2) {
      clearSvgPath(path);
      return;
    }
    d = points.map(function(p) {
      if (!p) {
        started = false;
        return '';
      }
      var q = ext.translateCoords(p[0], p[1]);
      var cmd = started ? 'L' : 'M';
      started = true;
      return cmd + round(q[0]) + ' ' + round(q[1]);
    }).filter(Boolean).join(' ');
    path.setAttribute('d', d);
  }

  function clearSvgPath(path) {
    path.removeAttribute('d');
  }

  function drawMarker(marker, point, useGreatCircleStyle) {
    var p;
    if (!point) {
      hideMarker(marker);
      return;
    }
    p = ext.translateCoords(point.display[0], point.display[1]);
    marker.setAttribute('cx', round(p[0]));
    marker.setAttribute('cy', round(p[1]));
    marker.setAttribute('r', 4);
    marker.classList.toggle('ruler-great-circle-endpoint', !!useGreatCircleStyle);
    marker.removeAttribute('display');
  }

  function hideMarker(marker) {
    marker.classList.remove('ruler-great-circle-endpoint');
    marker.setAttribute('display', 'none');
  }
}

function createSvgNode(name) {
  return document.createElementNS(SVG_NS, name);
}

function round(n) {
  return Math.round(n * 10) / 10;
}

function pointHasFiniteCoords(p) {
  return !!p && isFinite(p[0]) && isFinite(p[1]);
}

function pointSegDist(px, py, ax, ay, bx, by) {
  var dx = bx - ax;
  var dy = by - ay;
  var lenSq = dx * dx + dy * dy;
  var k;
  if (lenSq === 0) {
    return geom.distance2D(px, py, ax, ay);
  }
  k = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  k = Math.max(0, Math.min(1, k));
  return geom.distance2D(px, py, ax + dx * k, ay + dy * k);
}
