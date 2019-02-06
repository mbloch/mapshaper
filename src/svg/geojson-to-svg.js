/* @requires geojson-common, svg-common, mapshaper-svg-style, svg-stringify */

SVG.importGeoJSONFeatures = function(features, opts) {
  opts = opts || {};
  return features.map(function(obj, i) {
    var geom = obj.type == 'Feature' ? obj.geometry : obj; // could be null
    var geomType = geom && geom.type;
    var svgObj = null;
    if (geomType && geom.coordinates) {
      svgObj = SVG.geojsonImporters[geomType](geom.coordinates, obj.properties, opts);
    }
    if (!svgObj) {
      return {tag: 'g'}; // empty element
    }
    // TODO: fix error caused by null svgObj (caused by e.g. MultiPolygon with [] coordinates)
    if (obj.properties) {
      SVG.applyStyleAttributes(svgObj, geomType, obj.properties);
    }
    if ('id' in obj) {
      if (!svgObj.properties) {
        svgObj.properties = {};
      }
      svgObj.properties.id = (opts.id_prefix || '') + obj.id;
    }
    return svgObj;
  });
};

SVG.applyStyleAttributes = function(svgObj, geomType, rec) {
  var symbolType = GeoJSON.translateGeoJSONType(geomType);
  if (symbolType == 'point' && ('label-text' in rec)) {
    symbolType = 'label';
  }
  var fields = SVG.findPropertiesBySymbolGeom(Object.keys(rec), symbolType);
  for (var i=0, n=fields.length; i<n; i++) {
    SVG.setAttribute(svgObj, fields[i], rec[fields[i]]);
  }
};

SVG.setAttribute = function(obj, k, v) {
  if (k == 'r') {
    // assigned by importPoint()
  } else {
    if (!obj.properties) obj.properties = {};
    obj.properties[k] = v;
    if (k == 'stroke-dasharray' && v) {
      // kludge for cleaner dashes... make butt the default?
      obj.properties['stroke-linecap'] = 'butt';
    }
  }
};

SVG.importMultiPoint = function(coords, rec, layerOpts) {
  var children = [], p;
  for (var i=0; i<coords.length; i++) {
    p = SVG.importPoint(coords[i], rec, layerOpts);
    if (p.tag == 'g' && p.children) {
      children = children.concat(p.children);
    } else {
      children.push(p);
    }
  }
  return children.length > 0 ? {tag: 'g', children: children} : null;
};

SVG.importMultiPath = function(coords, importer) {
  var o;
  for (var i=0; i<coords.length; i++) {
    if (i === 0) {
      o = importer(coords[i]);
    } else {
      o.properties.d += ' ' + importer(coords[i]).properties.d;
    }
  }
  return o;
};

SVG.mapVertex = function(p) {
  return p[0] + ' ' + p[1];
};

SVG.importLineString = function(coords) {
  var d = 'M ' + coords.map(SVG.mapVertex).join(' ');
  return {
    tag: 'path',
    properties: {d: d}
  };
};

// Kludge for applying fill and other styles to a <text> element
// (for rendering labels in the GUI with the dot in Canvas, not SVG)
SVG.importStyledLabel = function(rec, p) {
  var o = SVG.importLabel(rec, p);
  SVG.applyStyleAttributes(o, 'Point', rec);
  return o;
};

SVG.importLabel = function(rec, p) {
  var line = rec['label-text'] || '';
  var morelines, obj;
  // Accepting \n (two chars) as an alternative to the newline character
  // (sometimes, '\n' is not converted to newline, e.g. in a Makefile)
  // Also accepting <br>
  var newline = /\n|\\n|<br>/i;
  var dx = rec.dx || 0;
  var dy = rec.dy || 0;
  var properties = {
    // using x, y instead of dx, dy for shift, because Illustrator doesn't apply
    // dx value when importing text with text-anchor=end
    y: dy,
    x: dx
  };
  if (p) {
    properties.transform = SVG.getTransform(p);
  }
  if (newline.test(line)) {
    morelines = line.split(newline);
    line = morelines.shift();
  }
  obj = {
    tag: 'text',
    value: line,
    properties: properties
  };
  if (morelines) {
    // multiline label
    obj.children = [];
    morelines.forEach(function(line) {
      var tspan = {
        tag: 'tspan',
        value: line,
        properties: {
          x: dx,
          dy: rec['line-height'] || '1.1em'
        }
      };
      obj.children.push(tspan);
    });
  }
  return obj;
};

SVG.importPoint = function(coords, rec, layerOpts) {
  rec = rec || {};
  if ('svg-symbol' in rec) {
    return SVG.importSymbol(rec['svg-symbol'], coords);
  }
  return SVG.importStandardPoint(coords, rec, layerOpts || {});
};

SVG.importPolygon = function(coords) {
  var d, o;
  for (var i=0; i<coords.length; i++) {
    d = o ? o.properties.d + ' ' : '';
    o = SVG.importLineString(coords[i]);
    o.properties.d = d + o.properties.d + ' Z';
  }
  return o;
};

SVG.importStandardPoint = function(coords, rec, layerOpts) {
  var isLabel = 'label-text' in rec;
  var symbolType = layerOpts.point_symbol || '';
  var children = [];
  var halfSize = rec.r || 0; // radius or half of symbol size
  var p;
  // if not a label, create a symbol even without a size
  // (circle radius can be set via CSS)
  if (halfSize > 0 || !isLabel) {
    if (symbolType == 'text') {
      p = {
        tag: 'text',
        properties: {
          x: coords[0],
          y: coords[1],
          dx: 0,
          dy: rec['font-size'] ? rec['font-size'] / 4 : 7,
          'font-size': rec['font-size'] ? rec['font-size'] - 2 : 10,
          'text-anchor': 'middle'
        },
        value: rec['point-text'] ? rec['point-text'] : '●'
      }
    } else if (symbolType == 'square') {
      p = {
        tag: 'rect',
        properties: {
          x: coords[0] - halfSize,
          y: coords[1] - halfSize,
          width: halfSize * 2,
          height: halfSize * 2
        }};
    } else { // default is circle
      p = {
        tag: 'circle',
        properties: {
          cx: coords[0],
          cy: coords[1]
        }};
      if (halfSize > 0) {
        p.properties.r = halfSize;
      }
    }
    children.push(p);
  }
  if (isLabel) {
    children.push(SVG.importLabel(rec, coords));
  }
  return children.length > 1 ? {tag: 'g', children: children} : children[0];
};

SVG.geojsonImporters = {
  Point: SVG.importPoint,
  Polygon: SVG.importPolygon,
  LineString: SVG.importLineString,
  MultiPoint: function(coords, rec, opts) {
    return SVG.importMultiPoint(coords, rec, opts);
  },
  MultiLineString: function(coords) {
    return SVG.importMultiPath(coords, SVG.importLineString);
  },
  MultiPolygon: function(coords) {
    return SVG.importMultiPath(coords, SVG.importPolygon);
  }
};
