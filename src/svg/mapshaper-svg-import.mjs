import require from '../mapshaper-require';
import { importGeoJSON } from '../geojson/geojson-import';
import { mergeDatasets } from '../dataset/mapshaper-merging';

var INHERITED_STYLE_KEYS = [
  'fill', 'fill-opacity',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'opacity', 'vector-effect',
  'font-family', 'font-size', 'font-style', 'font-stretch', 'font-weight',
  'text-anchor', 'dominant-baseline', 'letter-spacing', 'line-height'
];

var INHERITED_STYLE_INDEX = INHERITED_STYLE_KEYS.reduce(function(memo, key) {
  memo[key] = true;
  return memo;
}, {});

var LAYER_SUFFIX = {
  polygon: 'polygons',
  polyline: 'lines',
  point: 'points'
};

export function importSVG(str, optsArg) {
  var opts = optsArg || {};
  var Parser = typeof DOMParser == 'undefined' ? require('@xmldom/xmldom').DOMParser : DOMParser;
  var doc = new Parser().parseFromString(str, 'text/xml');
  var root = doc && doc.documentElement;
  var groups = getTopLevelLayerGroups(root);
  var layerData = [];
  var datasets = [];

  groups.forEach(function(group) {
    var features = [];
    collectFeatures(group.node, {}, features, {
      forcePolylinePaths: layerHasOpenPaths(group.node)
    });
    if (features.length === 0) return;
    layerData.push({
      name: group.name,
      features: features
    });
  });

  flipYCoordinates(layerData);

  layerData.forEach(function(layer) {
    datasets.push(importLayerFeatures(layer.name, layer.features, opts));
  });

  if (datasets.length === 0) {
    return {layers: [], info: {}};
  }
  if (datasets.length === 1) {
    return datasets[0];
  }
  return mergeDatasets(datasets);
}

function importLayerFeatures(layerName, features, opts) {
  var dataset = importGeoJSON({
    type: 'FeatureCollection',
    features: features
  }, opts);
  if (dataset.layers.length === 1) {
    dataset.layers[0].name = layerName;
  } else {
    dataset.layers.forEach(function(lyr) {
      var suffix = LAYER_SUFFIX[lyr.geometry_type] || 'features';
      lyr.name = layerName + '_' + suffix;
    });
  }
  return dataset;
}

function getTopLevelLayerGroups(root) {
  var groups = [];
  var childNodes = getElementChildren(root);
  var defaultNode = null;
  var layerCount = 0;

  childNodes.forEach(function(node) {
    var tag = getTagName(node);
    if (tag == 'defs') return;
    if (tag == 'g') {
      groups.push({
        node: node,
        name: node.getAttribute('id') || getDefaultLayerName(++layerCount)
      });
    } else if (tag == 'path' || tag == 'circle' || tag == 'text') {
      if (!defaultNode) {
        defaultNode = {
          tagName: 'g',
          childNodes: [],
          attributes: []
        };
        groups.push({
          node: defaultNode,
          name: getDefaultLayerName(++layerCount)
        });
      }
      defaultNode.childNodes.push(node);
    }
  });

  if (groups.length === 0 && root) {
    groups.push({
      node: root,
      name: getDefaultLayerName(1)
    });
  }
  return groups;
}

function getDefaultLayerName(i) {
  return 'layer' + i;
}

function collectFeatures(node, inheritedStyles, features, layerOpts) {
  var tag = getTagName(node);
  var nodeStyles = getNodeStyles(node);
  var inherited = extendProps(inheritedStyles, nodeStyles);

  if (tag == 'defs') return;
  if (tag == 'g' || tag == 'svg') {
    getElementChildren(node).forEach(function(child) {
      collectFeatures(child, inherited, features, layerOpts);
    });
    return;
  }
  if (tag == 'path') {
    collectPathFeature(node, inherited, features, layerOpts);
  } else if (tag == 'circle') {
    collectCircleFeature(node, inherited, features);
  } else if (tag == 'text') {
    collectTextFeature(node, inherited, features);
  }
}

function collectPathFeature(node, inherited, features, layerOpts) {
  var d = node.getAttribute('d');
  var geom = parsePathGeometry(d, layerOpts && layerOpts.forcePolylinePaths);
  var props;
  if (!geom) return;
  props = getFeatureProperties(node, inherited, {d: true});
  features.push({
    type: 'Feature',
    geometry: geom,
    properties: props
  });
}

function collectCircleFeature(node, inherited, features) {
  var x = parseNumber(node.getAttribute('cx'));
  var y = parseNumber(node.getAttribute('cy'));
  var props;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return;
  props = getFeatureProperties(node, inherited, {cx: true, cy: true});
  addNumericProperty(props, 'r', node.getAttribute('r'));
  features.push({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [x, y]
    },
    properties: props
  });
}

function collectTextFeature(node, inherited, features) {
  var baseX = parseNumber(node.getAttribute('x')) || 0;
  var baseY = parseNumber(node.getAttribute('y')) || 0;
  var translate = parseTranslate(node.getAttribute('transform'));
  var hasTranslate = nodeHasTranslate(node.getAttribute('transform'));
  var x = hasTranslate ? translate[0] : baseX;
  var y = hasTranslate ? translate[1] : baseY;
  var text = (node.textContent || '').trim();
  var props = getFeatureProperties(node, inherited, {x: true, y: true, transform: true});

  props['label-text'] = text;
  if (hasTranslate && node.getAttribute('x') !== null) {
    props.dx = baseX;
  }
  if (hasTranslate && node.getAttribute('y') !== null) {
    props.dy = baseY;
  }
  features.push({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [x, y]
    },
    properties: props
  });
}

function getFeatureProperties(node, inherited, excluded) {
  var props = extendProps({}, inherited);
  var attrs = node.attributes || [];
  var styleMap = parseStyleString(node.getAttribute && node.getAttribute('style'));

  Object.keys(styleMap).forEach(function(name) {
    if (name == 'fill-rule') return;
    props[name] = styleMap[name];
  });
  for (var i = 0; i < attrs.length; i++) {
    var attr = attrs[i];
    var key = attr && attr.name;
    var val = attr && attr.value;
    if (!key || key == 'style' || (excluded && excluded[key])) continue;
    if (key == 'id' || key == 'class' || key.indexOf('data-') === 0 || INHERITED_STYLE_INDEX[key]) {
      props[key] = val;
    }
  }
  return props;
}

function getNodeStyles(node) {
  var styles = {};
  var attrs = node.attributes || [];
  var styleMap = parseStyleString(node.getAttribute && node.getAttribute('style'));
  var i, attr, key;

  Object.keys(styleMap).forEach(function(name) {
    if (INHERITED_STYLE_INDEX[name]) {
      styles[name] = styleMap[name];
    }
  });

  for (i = 0; i < attrs.length; i++) {
    attr = attrs[i];
    key = attr && attr.name;
    if (key && INHERITED_STYLE_INDEX[key]) {
      styles[key] = attr.value;
    }
  }
  return styles;
}

function parseStyleString(style) {
  var out = {};
  var parts, i, part, idx, key, val;
  if (!style) return out;
  parts = String(style).split(';');
  for (i = 0; i < parts.length; i++) {
    part = parts[i].trim();
    if (!part) continue;
    idx = part.indexOf(':');
    if (idx == -1) continue;
    key = part.substr(0, idx).trim();
    val = part.substr(idx + 1).trim();
    if (!key) continue;
    out[key] = val;
  }
  return out;
}

function parsePathGeometry(d, forcePolylinePaths) {
  var subpaths = parsePathData(d);
  var lines = [];
  var rings = [];
  var parts = [];
  var polygonGeom, polylineGeom;

  subpaths.forEach(function(path) {
    var coords = path.coords;
    if (coords.length < 2) return;
    if (forcePolylinePaths) {
      lines.push(path.closed || pointsEqual(coords[0], coords[coords.length - 1]) ? closeRing(coords) : coords);
      return;
    }
    if (path.closed || pointsEqual(coords[0], coords[coords.length - 1])) {
      if (coords.length >= 3) {
        rings.push(closeRing(coords));
      }
    } else {
      lines.push(coords);
    }
  });

  if (rings.length > 0) {
    polygonGeom = buildPolygonGeometry(rings);
    if (polygonGeom) parts.push(polygonGeom);
  }
  if (lines.length > 0) {
    polylineGeom = lines.length == 1 ? {
      type: 'LineString',
      coordinates: lines[0]
    } : {
      type: 'MultiLineString',
      coordinates: lines
    };
    parts.push(polylineGeom);
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return {
    type: 'GeometryCollection',
    geometries: parts
  };
}

function buildPolygonGeometry(rings) {
  var ringData = rings.map(function(coords, i) {
    return {
      id: i,
      coords: coords,
      area: Math.abs(getRingArea(coords)),
      containers: [],
      depth: 0,
      parent: null
    };
  });

  ringData.forEach(function(ring, i) {
    var point = getRingSamplePoint(ring.coords);
    ringData.forEach(function(other, j) {
      if (i == j) return;
      if (pointInRing(point, other.coords)) {
        ring.containers.push(other.id);
      }
    });
    ring.depth = ring.containers.length;
  });

  ringData.forEach(function(ring) {
    var parentDepth = ring.depth - 1;
    if (parentDepth < 0) return;
    ring.containers.forEach(function(parentId) {
      var candidate = ringData[parentId];
      if (candidate.depth != parentDepth) return;
      if (!ring.parent || candidate.area < ring.parent.area) {
        ring.parent = candidate;
      }
    });
  });

  var polygons = [];
  ringData.forEach(function(ring) {
    if (ring.depth % 2 !== 0) return;
    polygons.push([ring.coords]);
  });

  ringData.forEach(function(ring) {
    var polygon;
    if (ring.depth % 2 !== 1 || !ring.parent) return;
    polygon = polygons.find(function(coords) {
      return coords[0] === ring.parent.coords;
    });
    if (polygon) {
      polygon.push(ring.coords);
    }
  });

  if (polygons.length === 0) return null;
  if (polygons.length == 1) {
    return {
      type: 'Polygon',
      coordinates: polygons[0]
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: polygons.map(function(coords) {
      return [coords[0]].concat(coords.slice(1));
    })
  };
}

function parsePathData(d) {
  var tokens = tokenizePath(d || '');
  var paths = [];
  var cmd = null;
  var i = 0;
  var currX = 0;
  var currY = 0;
  var startX = 0;
  var startY = 0;
  var path = null;

  function startPath(x, y) {
    if (path && path.coords.length > 0) {
      paths.push(path);
    }
    path = {
      coords: [[x, y]],
      closed: false
    };
    currX = x;
    currY = y;
    startX = x;
    startY = y;
  }

  function addPoint(x, y) {
    if (!path) {
      startPath(x, y);
      return;
    }
    path.coords.push([x, y]);
    currX = x;
    currY = y;
  }

  while (i < tokens.length) {
    if (isPathCommand(tokens[i])) {
      cmd = tokens[i++];
      if (cmd == 'Z' || cmd == 'z') {
        if (path) {
          path.closed = true;
          currX = startX;
          currY = startY;
        }
      }
      continue;
    }
    if (!cmd) {
      i++;
      continue;
    }

    if (cmd == 'M' || cmd == 'm') {
      if (!hasPair(tokens, i)) break;
      var moveX = Number(tokens[i++]);
      var moveY = Number(tokens[i++]);
      if (cmd == 'm') {
        moveX += currX;
        moveY += currY;
      }
      startPath(moveX, moveY);
      cmd = cmd == 'm' ? 'l' : 'L';
      continue;
    }

    if (cmd == 'L' || cmd == 'l') {
      if (!hasPair(tokens, i)) break;
      var lineX = Number(tokens[i++]);
      var lineY = Number(tokens[i++]);
      if (cmd == 'l') {
        lineX += currX;
        lineY += currY;
      }
      addPoint(lineX, lineY);
      continue;
    }

    if (cmd == 'H' || cmd == 'h') {
      var x = Number(tokens[i++]);
      if (cmd == 'h') x += currX;
      addPoint(x, currY);
      continue;
    }

    if (cmd == 'V' || cmd == 'v') {
      var y = Number(tokens[i++]);
      if (cmd == 'v') y += currY;
      addPoint(currX, y);
      continue;
    }

    // Unsupported command -- skip following numeric tokens until next command.
    while (i < tokens.length && !isPathCommand(tokens[i])) {
      i++;
    }
  }

  if (path && path.coords.length > 0) {
    paths.push(path);
  }
  return paths;
}

function layerHasOpenPaths(node) {
  var hasOpenPath = false;

  function scan(el) {
    var tag = getTagName(el);
    if (!tag || tag == 'defs' || hasOpenPath) return;
    if (tag == 'path') {
      hasOpenPath = pathContainsOpenSubpath(el.getAttribute('d'));
      return;
    }
    getElementChildren(el).forEach(scan);
  }

  scan(node);
  return hasOpenPath;
}

function pathContainsOpenSubpath(d) {
  var subpaths = parsePathData(d);
  for (var i = 0; i < subpaths.length; i++) {
    var coords = subpaths[i].coords;
    if (coords.length < 2) continue;
    if (!subpaths[i].closed && !pointsEqual(coords[0], coords[coords.length - 1])) {
      return true;
    }
  }
  return false;
}

function flipYCoordinates(layerData) {
  var range = getYRange(layerData);
  if (!range) return;
  layerData.forEach(function(layer) {
    layer.features.forEach(function(feature) {
      if (feature && feature.geometry) {
        flipGeometryY(feature.geometry, range);
      }
    });
  });
}

function getYRange(layerData) {
  var minY = Infinity;
  var maxY = -Infinity;
  layerData.forEach(function(layer) {
    layer.features.forEach(function(feature) {
      forEachGeometryCoordinate(feature && feature.geometry, function(coord) {
        if (coord[1] < minY) minY = coord[1];
        if (coord[1] > maxY) maxY = coord[1];
      });
    });
  });
  if (!isFinite(minY) || !isFinite(maxY)) return null;
  return {min: minY, max: maxY};
}

function flipGeometryY(geom, range) {
  forEachGeometryCoordinate(geom, function(coord) {
    coord[1] = range.min + range.max - coord[1];
  });
}

function forEachGeometryCoordinate(geom, cb) {
  if (!geom || !geom.type) return;
  if (geom.type == 'Point') {
    cb(geom.coordinates);
  } else if (geom.type == 'LineString' || geom.type == 'MultiPoint') {
    geom.coordinates.forEach(cb);
  } else if (geom.type == 'Polygon' || geom.type == 'MultiLineString') {
    geom.coordinates.forEach(function(path) {
      path.forEach(cb);
    });
  } else if (geom.type == 'MultiPolygon') {
    geom.coordinates.forEach(function(poly) {
      poly.forEach(function(ring) {
        ring.forEach(cb);
      });
    });
  } else if (geom.type == 'GeometryCollection') {
    (geom.geometries || []).forEach(function(child) {
      forEachGeometryCoordinate(child, cb);
    });
  }
}

function tokenizePath(d) {
  var rxp = /[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/ig;
  return String(d).match(rxp) || [];
}

function parseTranslate(str) {
  var match = String(str || '').match(/translate\(\s*([^\s,()]+)(?:[\s,]+([^\s,()]+))?/i);
  var x = 0;
  var y = 0;
  if (match) {
    x = parseNumber(match[1]) || 0;
    y = parseNumber(match[2]) || 0;
  }
  return [x, y];
}

function nodeHasTranslate(str) {
  return /translate\(/i.test(String(str || ''));
}

function closeRing(coords) {
  var ring = coords.map(function(p) { return [p[0], p[1]]; });
  if (!pointsEqual(ring[0], ring[ring.length - 1])) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return ring;
}

function getRingSamplePoint(ring) {
  return ring[0];
}

function getRingArea(ring) {
  var area = 0;
  for (var i = 0, n = ring.length - 1; i < n; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

function pointInRing(point, ring) {
  var x = point[0];
  var y = point[1];
  var inside = false;
  var i, j, xi, yi, xj, yj, intersects;
  for (i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    xi = ring[i][0];
    yi = ring[i][1];
    xj = ring[j][0];
    yj = ring[j][1];
    intersects = ((yi > y) != (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-30) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function addNumericProperty(props, key, strVal) {
  var num = parseNumber(strVal);
  if (isFiniteNumber(num)) {
    props[key] = num;
  }
}

function parseNumber(str) {
  var num = Number(str);
  return isFiniteNumber(num) ? num : null;
}

function hasPair(tokens, i) {
  return i + 1 < tokens.length && !isPathCommand(tokens[i]) && !isPathCommand(tokens[i + 1]);
}

function isPathCommand(token) {
  return /^[a-z]$/i.test(token);
}

function pointsEqual(a, b) {
  return a && b && a[0] == b[0] && a[1] == b[1];
}

function isFiniteNumber(val) {
  return typeof val == 'number' && isFinite(val);
}

function getTagName(node) {
  return node && node.tagName ? String(node.tagName).toLowerCase() : '';
}

function getElementChildren(node) {
  var out = [];
  var childNodes = node && node.childNodes ? node.childNodes : [];
  for (var i = 0; i < childNodes.length; i++) {
    if (childNodes[i] && childNodes[i].nodeType == 1) {
      out.push(childNodes[i]);
    }
  }
  return out;
}

function extendProps(dest, src) {
  var out = {};
  var key;
  if (dest) {
    for (key in dest) out[key] = dest[key];
  }
  if (src) {
    for (key in src) out[key] = src[key];
  }
  return out;
}
