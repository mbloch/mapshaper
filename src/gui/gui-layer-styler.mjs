import { internal, utils } from './gui-core';

var darkStroke = "#334",
    lightStroke = "#b7d9ea",
    activeStyle = { // outline style for the active layer
      type: 'outline',
      strokeColors: [lightStroke, darkStroke],
      strokeWidth: 0.8,
      dotColor: "#223",
      dotSize: 1
    },
    activeStyleDarkMode = {
      type: 'outline',
      strokeColors: [lightStroke, 'white'],
      strokeWidth: 0.9,
      dotColor: 'white',
      dotSize: 1
    },
    activeStyleForLabels = {
      dotColor: "rgba(250, 0, 250, 0.45)", // violet dot with transparency
      dotSize: 1
    },
    referenceStyle = { // outline style for reference layers
      type: 'outline',
      strokeColors: [null, '#78c110'], // upped saturation from #86c927
      strokeWidth: 0.85,
      dotColor: "#73ba20",
      dotSize: 1
    },
    intersectionStyle = {
      dotColor: "#FF421D",
      dotSize: 1.3
    };

export function getIntersectionStyle(lyr, opts) {
  return copyBaseStyle(intersectionStyle);
}

// Display style for unselected layers with visibility turned on
// (may be fully styled or outlined)
export function getReferenceLayerStyle(lyr, opts) {
  var style;
  if (layerHasDrawableStyle(lyr) && !opts.outlineMode) {
    // TODO: consider just copying lyr style
    style = getCanvasDisplayStyle(lyr);
  } else if (internal.layerHasLabels(lyr) && !opts.outlineMode) {
    style = {dotSize: 0}; // no reference dots if labels are visible
  } else {
    style = copyBaseStyle(referenceStyle);
  }
  return style;
}

export function getActiveLayerStyle(lyr, opts) {
  var style;
  if (layerHasDrawableStyle(lyr) && !opts.outlineMode) {
    style = getCanvasDisplayStyle(lyr);
  } else if (internal.layerHasLabels(lyr) && !opts.outlineMode) {
    style = copyBaseStyle(activeStyleForLabels);
  } else if (opts.darkMode) {
    style = copyBaseStyle(activeStyleDarkMode);
  } else {
    style = copyBaseStyle(activeStyle);
  }
  // kludge: no ghosted lines if not enabled
  if (style.strokeColors && !opts.ghostingOn) {
    style.strokeColors = [null, style.strokeColors[1]];
  }

  return style;
}

export function copyBaseStyle(baseStyle) {
  return Object.assign({}, baseStyle);
}

export function getCanvasDisplayStyle(lyr) {
  var styleIndex = {
        opacity: 'opacity',
        r: 'radius',
        'fill': 'fillColor',
        'fill-pattern': 'fillPattern',
        'fill-effect': 'fillEffect',
        'fill-opacity': 'fillOpacity',
        'stroke': 'strokeColor',
        'stroke-width': 'strokeWidth',
        'stroke-dasharray': 'lineDash',
        'stroke-opacity': 'strokeOpacity',
        'stroke-linecap': 'lineCap',
        'stroke-linejoin': 'lineJoin',
        'stroke-miterlimit': 'miterLimit'
      },
      // array of field names of relevant svg display properties
      fields = getStyleFields(lyr).filter(function(f) {return f in styleIndex;}),
      records = lyr.data.getRecords();

  var styler = function(style, i) {
    var rec = records[i];
    var fname, val;
    for (var j=0; j<fields.length; j++) {
      fname = fields[j];
      val = rec && rec[fname];
      if (val == 'none') {
        val = 'transparent'; // canvas equivalent of CSS 'none'
      }
      // convert svg property name to mapshaper style equivalent
      style[styleIndex[fname]] = val;
    }

    if (style.strokeWidth && !style.strokeColor) {
      style.strokeColor = 'black';
    }
    if (!('strokeWidth' in style) && style.strokeColor) {
      style.strokeWidth = 1;
    }
    if (style.radius > 0 && !style.strokeWidth && !style.fillColor && lyr.geometry_type == 'point') {
      style.fillColor = 'black';
    }
  };
  var style = {styler: styler, type: 'styled'};
  // use squares if radius is missing... (TODO: check behavior with labels, etc)
  if (lyr.geometry_type == 'point' && fields.includes('r') === false) {
    style.dotSize = 1;
  }
  return style;
}

// check if layer should be displayed with a full style
export function layerHasDrawableStyle(lyr) {
  var fields = getStyleFields(lyr);
  if (lyr.geometry_type == 'point') {
    // return fields.indexOf('r') > -1; // require 'r' field for point symbols
    return fields.includes('fill') || fields.includes('r'); // support colored squares
  }
  return utils.difference(fields, ['opacity', 'class']).length > 0;
}

function getStyleFields(lyr) {
  var fields = lyr.data ? lyr.data.getFields() : [];
  return internal.findStylePropertiesBySymbolGeom(fields, lyr.geometry_type);
}
