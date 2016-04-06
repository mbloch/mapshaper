/* @requires mapshaper-common */

var SVG = {};

SVG.styleIndex = {
  // svgClass: 'class',
  opacity: 'opacity',
  radius: 'r',
  fillColor: 'fill',
  strokeColor: 'stroke',
  strokeWidth: 'stroke-width'
};

SVG.stringifyProperties = function(o) {
  return Object.keys(o).reduce(function(memo, key, i) {
    var val = o[key],
        strval = JSON.stringify(val);
    if (strval.charAt(0) != '"') {
      if (!utils.isFiniteNumber(val)) {
        // not a string or number -- skipping
        return memo;
      }
      strval = '"' + strval + '"';
    }
    return memo + ' ' + key + "=" + strval;
  }, '');
};

SVG.stringify = function(obj) {
  var svg = '<' + obj.tag;
  if (obj.properties) {
    svg += SVG.stringifyProperties(obj.properties);
  }
  if (obj.children) {
    svg += '>\n';
    svg += obj.children.map(SVG.stringify).join('\n');
    svg += '\n</' + obj.tag + '>';
  } else {
    svg += '/>';
  }
  return svg;
};

SVG.applyStyleAttributes = function(svgObj, rec) {
  var properties = svgObj.properties;
  var fields = MapShaper.getStyleFields(Object.keys(rec), MapShaper.svgStyles);
  var k;
  for (var i=0, n=fields.length; i<n; i++) {
    k = fields[i];
    SVG.setAttribute(svgObj, k.replace('_', '-'), rec[k]);
  }
};

SVG.setAttribute = function(obj, k, v) {
  var children, child;
  if ((k == 'r' || k == 'class') && obj.children) {
    // 'r' is a geometry attribute and can't be applied to a 'g' container
    // 'class' may refer to a CSS class with a value for 'r'
    children = obj.children;
    for (var i=0; i<children.length; i++) {
      child = children[i];
      if (!child.properties) child.properties = {};
      child.properties[k] = v;
    }
  } else {
    if (!obj.properties) obj.properties = {};
    obj.properties[k] = v;
  }
};

SVG.importGeoJSONFeatures = function(features) {
  return features.map(function(obj, i) {
    var geom = obj.type == 'Feature' ? obj.geometry : obj; // could be null
    var geomType = geom && geom.type;
    var svgObj;
    if (!geomType) {
      return {tag: 'g'}; // empty element
    }
    svgObj = SVG.geojsonImporters[geomType](geom.coordinates);
    if (obj.properties) {
      SVG.applyStyleAttributes(svgObj, obj.properties);
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

SVG.importMultiGeometry = function(coords, importer) {
  var o = {
    tag: 'g',
    children: []
  };
  for (var i=0; i<coords.length; i++) {
    o.children.push(importer(coords[i]));
  }
  return o;
};

SVG.mapVertex = function(p) {
  return p[0] + ' ' + -p[1];
};

SVG.importLineString = function(coords) {
  var d = 'M ' + coords.map(SVG.mapVertex).join(' ');
  return {
    tag: 'path',
    properties: {d: d}
  };
};

SVG.importPoint = function(p) {
  return {
    tag: 'circle',
    properties: {
      cx: p[0],
      cy: -p[1]
    }
  };
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
  MultiPoint: function(coords) {
    return SVG.importMultiGeometry(coords, SVG.importPoint);
  },
  MultiLineString: function(coords) {
    return SVG.importMultiGeometry(coords, SVG.importLineString);
  },
  MultiPolygon: function(coords) {
    return SVG.importMultiGeometry(coords, SVG.importPolygon);
  }
};
