/* @requires mapshaper-common */

var SVG = {};

SVG.defaultStyles = {
  polygon: {
    stroke: 'black',
    fill: '#eee'
  },
  polyline: {
    stroke: 'black'
  },
  point: {
    fill: 'black'
  }
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

SVG.importGeoJSONFeatures = function(geojson) {
  var arr = geojson.features || geojson.geometries || (geojson.type ? [geojson] : []);
  return arr.map(function(obj) {
    var geom = obj.type == 'Feature' ? obj.geometry : obj; // could be null
    var geomType = geom && geom.type;
    var svgObj;
    if (!geomType) {
      return {tag: 'g'}; // empty element
    }
    svgObj = SVG.geojsonImporters[geomType](geom.coordinates);
    if ('id' in obj) {
      svgObj.properties = svgObj.properties || {};
      svgObj.properties.id = obj.id;
    }
    // TODO: apply feature-level attributes
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

SVG.reducePathCoord = function(memo, p, i) {
  if (i === 0) {
    memo = 'M';
  }
  memo += ' ' + p[0] + ' ' + -p[1];
  return memo;
};

SVG.importLineString = function(coords) {
  return {
    tag: 'path',
    properties: {
      d: coords.reduce(SVG.reducePathCoord, '')
    }
  };
};

SVG.importPoint = function(p) {
  return {
    tag: 'circle',
    properties: {
      cx: p[0],
      cy: -p[1],
      r: 2
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
