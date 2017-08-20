/* @requires geojson-common, svg-common, mapshaper-svg-style */

SVG.importGeoJSONFeatures = function(features) {
  return features.map(function(obj, i) {
    var geom = obj.type == 'Feature' ? obj.geometry : obj; // could be null
    var geomType = geom && geom.type;
    var svgObj = null;
    if (geomType && geom.coordinates) {
      svgObj = SVG.geojsonImporters[geomType](geom.coordinates, obj.properties);
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
      svgObj.properties.id = obj.id;
    }
    return svgObj;
  });
};

SVG.stringify = function(obj) {
  var svg = '<' + obj.tag;
  // w.s. is significant in text elements
  var joinStr = obj.tag == 'text' || obj.tag == 'tspan' ? '' : '\n';
  if (obj.properties) {
    svg += SVG.stringifyProperties(obj.properties);
  }
  if (obj.children || obj.value) {
    svg += '>' + joinStr;
    if (obj.value) {
      svg += obj.value;
    }
    if (obj.children) {
      svg += obj.children.map(SVG.stringify).join(joinStr);
    }
    svg += joinStr + '</' + obj.tag + '>';
  } else {
    svg += '/>';
  }
  return svg;
};

SVG.stringEscape = (function() {
  // See http://commons.oreilly.com/wiki/index.php/SVG_Essentials/The_XML_You_Need_for_SVG
  var rxp = /[&<>"']/g,
      map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;'
      };
  return function(s) {
    return String(s).replace(rxp, function(s) {
      return map[s];
    });
  };
}());

SVG.stringifyProperties = function(o) {
  return Object.keys(o).reduce(function(memo, key, i) {
    var val = o[key],
        strval = utils.isString(val) ? val : JSON.stringify(val);
    return memo + ' ' + key + '="' + SVG.stringEscape(strval) + '"';
  }, '');
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
  }
};

SVG.importMultiPoint = function(coords, rec) {
  var children = [], p;
  for (var i=0; i<coords.length; i++) {
    p = SVG.importPoint(coords[i], rec);
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

SVG.importLabel = function(p, rec) {
  var line = rec['label-text'] || '';
  var morelines, obj;
  // Accepting \n (two chars) as an alternative to the newline character
  // (sometimes, '\n' is not converted to newline, e.g. in a Makefile)
  // Also accepting <br>
  var newline = /\n|\\n|<br>/i;
  var properties = {
    x: p[0],
    y: p[1]
  };
  if (rec.dx) properties.dx = rec.dx;
  if (rec.dy) properties.dy = rec.dy;
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
          x: p[0],
          dy: rec['line-height'] || '1.1em'
        }
      };
      if (rec.dx) tspan.properties.dx = rec.dx;
      obj.children.push(tspan);
    });
  }
  return obj;
};

SVG.importPoint = function(coords, d) {
  var rec = d || {};
  var isLabel = 'label-text' in rec;
  var children = [];
  var p;
  // if not a label, create a circle even without a radius
  // (radius can be set via CSS)
  if (rec.r || !isLabel) {
    p = {
    tag: 'circle',
    properties: {
      cx: coords[0],
      cy: coords[1]
    }};
    if (rec.r) {
      p.properties.r = rec.r;
    }
    children.push(p);
  }
  if (isLabel) {
    children.push(SVG.importLabel(coords, rec));
  }
  return children.length > 1 ? {tag: 'g', children: children} : children[0];
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

SVG.geojsonImporters = {
  Point: SVG.importPoint,
  Polygon: SVG.importPolygon,
  LineString: SVG.importLineString,
  MultiPoint: function(coords, rec) {
    return SVG.importMultiPoint(coords, rec);
  },
  MultiLineString: function(coords) {
    return SVG.importMultiPath(coords, SVG.importLineString);
  },
  MultiPolygon: function(coords) {
    return SVG.importMultiPath(coords, SVG.importPolygon);
  }
};
