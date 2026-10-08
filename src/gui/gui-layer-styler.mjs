import { internal, utils } from './gui-core';

var darkStroke = "#334",
    activeStyle = { // outline style for the active layer
      type: 'outline',
      strokeColors: [null, darkStroke],
      strokeWidth: 0.8,
      dotColor: "#223",
      dotSize: 1
    },
    activeStyleDarkMode = {
      type: 'outline',
      strokeColors: [null, 'white'],
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
      strokeColors: [null, '#87b73b'], // was 78c110
      // strokeColors: [null, 'rgba(79,140,0,0.67)'],
      strokeWidth: 0.85,
      dotColor: "#73ba20",
      dotSize: 1
    },
    intersectionStyle = {
      dotColor: "#FF421D",
      dotSize: 1.3
    },
    compareStyle = { // "before" overlay for the comparison feature
      type: 'outline',
      strokeColors: [null, 'rgba(185, 0, 178, 0.45)'],
      strokeWidth: 1.1,
      dotColor: 'rgba(185, 0, 178, 0.45)',
      dotSize: 1
    };

export function getIntersectionStyle(lyr, opts) {
  return copyBaseStyle(intersectionStyle);
}

// Style for the temporary "before" comparison overlay (original shapes).
export function getCompareLayerStyle(lyr, opts) {
  return copyBaseStyle(compareStyle);
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
  } else if (internal.layerHasLabels(lyr) && opts.interactionMode == 'label_style') {
    style = {dotSize: 0};
  } else if (internal.layerHasLabels(lyr) && !opts.outlineMode) {
    style = copyBaseStyle(activeStyleForLabels);
  } else if (opts.darkMode) {
    style = copyBaseStyle(activeStyleDarkMode);
  } else {
    style = copyBaseStyle(activeStyle);
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
  // Arrowheads are drawn by the canvas as shapes, not set as attributes, so
  // they are not among the attribute fields. Assigned on every call, like the
  // rest, because the style object is reused from one feature to the next.
  var arrowFields = getLineArrowFields(lyr);
  var hasStrokeField = fields.includes('stroke');
  var hasWidthField = fields.includes('stroke-width');
  var hasStrokeFields = hasStrokeField || hasWidthField;
  // Glows are drawn from the record rather than set as attributes, like the
  // arrowheads. An outer glow that the whole layer shares is drawn once for the
  // layer (see svg-glow.mjs), so the shapes are then given none of their own.
  var hasGlows = layerHasGlowFields(lyr);
  var layerOuterGlow = hasGlows ? internal.svg.getLayerOuterGlow(lyr) : null;

  var styler = function(style, i) {
    var rec = records[i];
    var fname, val;
    // The stroke defaults below are worked out for each shape, so a value one
    // shape was given does not carry over to the next one in the reused style
    // object. (Without stroke fields, the layer-wide values set on the base
    // style below are the ones to keep.)
    if (hasStrokeFields) {
      if (!hasStrokeField) style.strokeColor = undefined;
      if (!hasWidthField) style.strokeWidth = undefined;
    }
    if (arrowFields) {
      style.lineStart = rec && rec['line-start'];
      style.lineEnd = rec && rec['line-end'];
      style.lineEndSize = rec && rec['line-end-size'];
      style.lineFade = rec && rec['line-fade'];
    }
    if (hasGlows) {
      style.outerGlow = layerOuterGlow ? null : internal.svg.getPolygonGlow(rec, 'outer');
      style.innerGlow = internal.svg.getPolygonGlow(rec, 'inner');
    }
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
    // A stroke with no width is 1px wide, as in SVG -- also in a layer whose
    // other shapes have widths, which gives this one an undefined width
    if (hasStrokeFields && style.strokeColor && isBlankStyleValue(style.strokeWidth)) {
      style.strokeWidth = 1;
    }
    if (style.radius > 0 && !style.strokeWidth && !style.fillColor && lyr.geometry_type == 'point') {
      style.fillColor = 'black';
    }
  };
  var style = {styler: styler, type: 'styled'};
  if (hasGlows) {
    style.layerOuterGlow = layerOuterGlow;
    // How far past its shapes the layer draws, which is how far outside the
    // view a shape can be and still reach into it.
    style.glowReach = internal.svg.getMaxGlowWidth(records) * internal.svg.GLOW_REACH;
  }
  // A line layer styled with nothing but arrowheads is drawn the way SVG
  // export draws it, with the black 1px line the layer's group gives it.
  if (arrowFields && !hasStrokeFields) {
    style.strokeColor = 'black';
    style.strokeWidth = 1;
  }
  // use squares if radius is missing... (TODO: check behavior with labels, etc)
  if (lyr.geometry_type == 'point' && fields.includes('r') === false) {
    style.dotSize = 1;
  }
  return style;
}

function isBlankStyleValue(val) {
  return val === undefined || val === null || val === '';
}

// check if layer should be displayed with a full style
export function layerHasDrawableStyle(lyr) {
  var fields = getStyleFields(lyr);
  if (lyr.geometry_type == 'point') {
    // return fields.indexOf('r') > -1; // require 'r' field for point symbols
    fields = fields.filter(function(field) {
      return field == 'fill' || field == 'r';
    }); // support colored squares
  } else {
    fields = utils.difference(fields, ['opacity', 'class']);
  }
  return layerHasStyleValues(lyr, fields) ||
    layerHasStyleValues(lyr, getLineArrowFields(lyr)) ||
    layerHasStyleValues(lyr, layerHasGlowFields(lyr) ? internal.svg.glowFields : null);
}

function layerHasStyleValues(lyr, fields) {
  if (!lyr.data || !fields || fields.length === 0) return false;
  // -style field= leaves an undefined key in the table so mixed-feature
  // columns keep their schema. An entirely empty column is not a drawable
  // style: the layer should go back to its unstyled map appearance.
  return lyr.data.getRecords().some(function(rec) {
    return fields.some(function(field) {
      return rec && !isBlankStyleValue(rec[field]);
    });
  });
}

function layerHasGlowFields(lyr) {
  if (lyr.geometry_type != 'polygon' || !lyr.data) return false;
  return lyr.data.getFields().some(function(f) {
    return internal.svg.glowFields.includes(f);
  });
}

// The arrowhead fields a line layer has, or null
function getLineArrowFields(lyr) {
  var fields;
  if (lyr.geometry_type != 'polyline' || !lyr.data) return null;
  fields = lyr.data.getFields().filter(function(f) {
    return internal.svg.lineArrowFields.includes(f);
  });
  return fields.length > 0 ? fields : null;
}

function getStyleFields(lyr) {
  var fields = lyr.data ? lyr.data.getFields() : [];
  return internal.findStylePropertiesBySymbolGeom(fields, lyr.geometry_type);
}
