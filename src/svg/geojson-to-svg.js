/* @requires geojson-common, mapshaper-svg-style */

var SVG = {};

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
  var properties = svgObj.properties;
  var invalidStyles = MapShaper.invalidSvgTypes[GeoJSON.translateGeoJSONType(geomType)];
  var fields = MapShaper.getStyleFields(Object.keys(rec), MapShaper.svgStyles, invalidStyles);
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
