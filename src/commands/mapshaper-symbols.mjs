import cmd from '../mapshaper-cmd';
import { getSymbolDataAccessor } from '../svg/svg-properties';
import { requirePointLayer, requireSinglePointLayer, getLayerBounds, copyLayer, getLayerDataTable } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import { rotateCoords, scaleAndShiftCoords, getSymbolRadius, getSymbolFillColor,
  getSymbolStrokeColor, toItemList, toNumberList } from '../symbols/mapshaper-symbol-utils';
import { getFilledArrowCoords, getStickArrowCoords, getArrowCoords } from '../symbols/mapshaper-arrow-symbols';
import { getPolygonCoords } from '../symbols/mapshaper-basic-symbols';
import { getStarCoords } from '../symbols/mapshaper-star-symbols';
import { getRingCoords } from '../symbols/mapshaper-ring-symbols';
import { symbolFields, getArrowParams } from '../symbols/mapshaper-icon-symbols';
import { mergeOutputLayerIntoDataset } from '../dataset/mapshaper-dataset-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { requireProjectedDataset } from '../crs/mapshaper-projections';
import { featureHasLabel } from '../svg/svg-feature-utils';
import { parseLabelCoords, parseJsonArg, warnIfCurveIsUnprojected } from './mapshaper-label-geom';
import { DataTable } from '../datatable/mapshaper-data-table';
import { matchTargetFieldTypes } from '../datatable/mapshaper-match-field-types';
import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { getIdFilter } from './mapshaper-filter';
import utils from '../utils/mapshaper-utils';

// -symbols writes each point's symbol as attribute fields: icon= and its
// icon-* and arrow-* parameters, or r= for a plain circle, which the GUI
// draws on the canvas like a circle styled with -style r=. See
// mapshaper-icon-symbols.mjs for the fields and how they are drawn.
//
// Option values are resolved for each feature and stored as they are, so a
// symbol can be redrawn when one of its fields changes. Options that are
// rules for making a symbol rather than properties of it are applied here:
// scale= multiplies the stored sizes, and rotated= (or flipped=) turns into
// part of icon-rotation.
//
// With ids=, only those points are given new symbols; the others keep the
// fields they have, so that some symbols in a layer can be restyled.
//
// The geographic option instead replaces each point with a polygon or line
// shape in map units.
cmd.symbols = function(inputLyr, dataset, opts) {
  requirePointLayer(inputLyr);
  if (opts.geographic) {
    if (opts.ids) stop('The ids= option can not be combined with geographic');
    return makeGeographicSymbols(inputLyr, dataset, opts);
  }
  var lyr = opts.no_replace ? copyLayer(inputLyr) : inputLyr;
  var table = getLayerDataTable(lyr);
  var records = table.getRecords();
  var getSymbolData = getSymbolDataAccessor(lyr, opts);
  var selected = opts.ids ? getIdFilter(opts.ids) : null;
  var output = lyr.shapes.map(function(shp, i) {
    if (selected && !selected(i)) return null;
    return shp ? getSymbolFields(getSymbolData(i), records[i], opts) : null;
  });
  var outputFields = getOutputFieldNames(output);
  var changedFields = utils.uniq(symbolFields.filter(function(field) {
    return table.fieldExists(field);
  }).concat(outputFields));
  // listing the fields lets undo restore their values, not just the schema
  table.captureSchemaBefore({operation: 'symbols', fields: changedFields});
  output.forEach(function(o, i) {
    var rec = records[i] || (records[i] = {});
    if (!selected || selected(i)) {
      symbolFields.forEach(function(field) {
        delete rec[field];
      });
    }
    // Every record gets every field, so that the table has a single schema
    // when features have different kinds of symbol. A style field like fill
    // that this symbol doesn't use keeps the record's own value.
    outputFields.forEach(function(field) {
      if (o && field in o) {
        rec[field] = o[field];
      } else if (!(field in rec)) {
        rec[field] = undefined;
      }
    });
  });
  table.markSchemaChanged({operation: 'symbols'});
  return [lyr];
};

// -symbols coordinates= adds one symbol to the target layer, or to a new
// layer, like -labels coordinates=. One coordinate pair places a symbol; with
// several, type=curve draws a curve through them (a closed one if the last
// pair repeats the first), and any other type draws a symbol at each point.
//
// Option values are resolved as they are for a layer, against the new
// feature's properties= -- so they are mostly literal values.
cmd.addSymbol = function(targetLayers, targetDataset, opts) {
  var targetLyr, coords, props, d, feature, outputLyr, merged;
  if (targetLayers.length > 1) {
    stop('Command expects a single target layer');
  }
  if (opts.geographic) {
    stop('The geographic option can not be combined with coordinates=');
  }
  if (opts.ids) {
    stop('The ids= option can not be combined with coordinates=');
  }
  targetLyr = targetLayers[0]; // may be undefined
  if (targetLyr && !opts.no_replace && targetLyr.geometry_type &&
      targetLyr.geometry_type != 'point') {
    stop('Symbols can only be added to a point layer; target "' +
      (targetLyr.name || '[unnamed]') + '" contains ' + targetLyr.geometry_type + 's. ' +
      'Use no-replace to add a symbol as a new layer.');
  }
  coords = parseLabelCoords(opts.coordinates);
  props = opts.properties ? parseJsonArg(opts.properties, 'properties') : {};
  d = getSymbolDataAccessor({
    geometry_type: 'point',
    shapes: [coords],
    data: new DataTable([props])
  }, opts)(0);
  if (d.type == 'curve') {
    if (coords.length < 2) {
      stop('A curve needs at least two points');
    }
    warnIfCurveIsUnprojected(targetDataset, coords.length);
  }
  feature = {
    type: 'Feature',
    properties: Object.assign(props, getSymbolFields(d, props, opts)),
    geometry: coords.length == 1 ?
      {type: 'Point', coordinates: coords[0]} :
      {type: 'MultiPoint', coordinates: coords}
  };
  if (!opts.no_replace) {
    matchTargetFieldTypes(feature.properties, targetLyr);
  }
  outputLyr = mergeDatasetsIntoDataset(targetDataset, [importGeoJSON(feature)])[0];
  if (opts.no_replace || !targetLyr) {
    setOutputLayerName(outputLyr, targetLyr && targetLyr.name, 'symbols', opts);
    return [outputLyr];
  }
  // verbose: false and force, because a new symbol rarely has the same fields
  // as the layer it joins (see addLabel())
  merged = cmd.mergeLayers([targetLyr, outputLyr], {force: true, verbose: false});
  merged[0].name = targetLyr.name;
  return merged;
};

var NYT_STAR_COLOR = '#cc0000';

var POLYGON_SIDES = {
  triangle: 3,
  pentagon: 5,
  hexagon: 6,
  heptagon: 7,
  octagon: 8,
  nonagon: 9,
  decagon: 10
};

// Returns the fields for one feature's symbol
// d: the feature's resolved option values
// rec: the feature's record, or null
export function getSymbolFields(d, rec, opts) {
  var type = d.type || 'square';
  var scale = +opts.scale || 1;
  if (type == 'curve') return getCurveFields(d, scale);
  if (type == 'circle') return getCircleFields(d, rec, scale);
  if (type == 'arrow') return getArrowFields(d, opts, scale);
  if (type == 'pie') return getPieFields(d, scale);
  if (type == 'ring') return getRingFields(d, scale);
  if (type == 'star') return getStarFields(d, scale);
  if (type == 'nyt-star') return getNytStarFields(d, scale);
  if (type == 'square' && !d.sides) return getSquareFields(d, scale);
  if (type == 'polygon' || type == 'square' || type in POLYGON_SIDES) {
    return getPolygonFields(d, type, scale);
  }
  stop('Unsupported symbol type:', type);
}

// A circle is r=, unless the feature is a label: a label's fill and opacity are
// its text's, so its circle is an icon.
function getCircleFields(d, rec, scale) {
  var r = getSymbolRadius(d) * scale;
  var o;
  if (featureHasLabel(rec)) {
    return addFilledStyle({icon: 'circle', 'icon-size': r * 2}, d);
  }
  o = {r: r, fill: getSymbolFillColor(d)};
  addStroke(o, d);
  if (hasValue(d.opacity)) o.opacity = d.opacity;
  return o;
}

function getSquareFields(d, scale) {
  // the radius of a square symbol reaches its corners
  var o = {icon: 'square', 'icon-size': roundToHundredths(getSymbolRadius(d) * Math.SQRT2 * scale)};
  addRotation(o, getNumber(d.rotation) + getOrientationRotation(d, 4));
  return addFilledStyle(o, d);
}

function getPolygonFields(d, type, scale) {
  var sides = +d.sides || POLYGON_SIDES[type] || 4;
  var o;
  if (sides >= 3 === false) {
    stop(`Invalid number of sides (${sides})`);
  }
  o = {icon: 'polygon', 'icon-sides': sides, 'icon-size': getSymbolRadius(d) * 2 * scale};
  addRotation(o, getNumber(d.rotation) + getOrientationRotation(d, sides));
  return addFilledStyle(o, d);
}

function getStarFields(d, scale) {
  var points = +d.points || d.sides && d.sides / 2 || 5;
  var o;
  if (points < 5) {
    stop(`Invalid number of points for a star (${points})`);
  }
  o = {icon: 'star', 'icon-size': getSymbolRadius(d) * 2 * scale};
  if (points != 5) o['icon-points'] = points;
  addRotation(o, getNumber(d.rotation) + getOrientationRotation(d, points));
  return addFilledStyle(o, d);
}

// Not advertised, like icon=nyt-star (see svg-icons.mjs): the web UI offers it
// only to some users. stroke= is its outline, NYT red unless given, at a width
// fixed by its size; fill= is its middle, white unless given. Not rotated.
function getNytStarFields(d, scale) {
  var o = {icon: 'nyt-star', 'icon-size': getSymbolRadius(d) * 2 * scale,
    'icon-stroke': hasValue(d.stroke) ? d.stroke : NYT_STAR_COLOR};
  if (hasValue(d.fill)) o['icon-fill'] = d.fill;
  if (hasValue(d.opacity)) o['icon-opacity'] = d.opacity;
  return o;
}

// Without radii=, one ring reaching radius=, the stroked circle a label's
// icon=ring draws; with them, concentric rings. A ring is a stroke, so with no
// stroke= given, fill= is its color, as it always was.
function getRingFields(d, scale) {
  var radii, o;
  if (!hasValue(d.radii)) {
    o = {icon: 'ring', 'icon-size': getSymbolRadius(d) * 2 * scale};
    if (hasValue(d.stroke)) {
      o['icon-stroke'] = d.stroke;
      if (hasValue(d.fill)) o['icon-fill'] = d.fill;
    } else {
      o['icon-stroke'] = getSymbolFillColor(d);
    }
    if (hasValue(d['stroke-width'])) o['icon-stroke-width'] = d['stroke-width'];
    if (hasValue(d.opacity)) o['icon-opacity'] = d.opacity;
    return o;
  }
  radii = toNumberList(d.radii).filter(function(r) {
    return r >= 0;
  }).map(function(r) {
    return r * scale;
  });
  utils.genericSort(radii, true);
  o = {icon: 'ring', 'icon-radii': utils.uniq(radii).join(','), 'icon-color': getSymbolFillColor(d)};
  if (hasValue(d.opacity)) o['icon-opacity'] = d.opacity;
  return o;
}

function getPieFields(d, scale) {
  var o, hole;
  if (!d.values) {
    stop('A pie symbol requires a values= option.');
  }
  if (!d.fills) {
    stop('A pie symbol requires a fills= option.');
  }
  o = {
    icon: 'pie',
    'icon-size': getSymbolRadius(d) * 2 * scale,
    // missing, non-numeric and negative values all count as zero
    'icon-values': toNumberList(d.values).map(function(n) {
      return n > 0 ? n : 0;
    }).join(','),
    // a missing color leaves a gap in the pie
    'icon-fills': toItemList(d.fills).map(function(val) {
      return hasValue(val) ? String(val).trim() : 'none';
    }).join(',')
  };
  hole = getNumber(d.hole);
  if (hole) o['icon-hole'] = hole * scale;
  addRotation(o, getNumber(d.rotation));
  addStroke(o, d);
  if (hasValue(d.opacity)) o['icon-opacity'] = d.opacity;
  return o;
}

function getArrowFields(d, opts, scale) {
  var o = {icon: 'arrow'};
  var len = (d.radius || d.length || d.r || 0) * scale;
  var stick = opts.arrow_style == 'stick';
  if (len > 0) o['icon-size'] = len;
  addRotation(o, getNumber(d.direction) + getNumber(d.rotation));
  if (stick) {
    o['arrow-style'] = 'stick';
    o['icon-color'] = getSymbolStrokeColor(d);
    o['stroke-width'] = d['stroke-width'] || 2;
    if (hasValue(d.opacity)) o['icon-opacity'] = d.opacity;
  } else {
    addFilledStyle(o, d);
  }
  ['stem-width', 'head-width', 'head-length', 'stem-length'].forEach(function(name) {
    if (isNumber(d[name])) o['arrow-' + name] = d[name] * scale;
  });
  if (scale != 1 && !isNumber(d['stem-width'])) {
    // the default stem width, which sets the default head size
    o['arrow-stem-width'] = 2 * scale;
  }
  ['head-angle', 'stem-taper', 'stem-curve', 'min-stem-ratio'].forEach(function(name) {
    if (isNumber(d[name])) o['arrow-' + name] = d[name];
  });
  if (hasValue(d.anchor)) o['arrow-anchor'] = d.anchor;
  // reports an impossible arrow now, rather than leaving it to draw as nothing
  getArrowCoords(getArrowParams(o), stick ? 'stick' : 'standard');
  return o;
}

// A curve through the feature's points. Whether it is open or closed comes
// from its points, so the fields can't tell: fill= is kept for a closed one,
// and with no color given at all, the stroke gets the default.
function getCurveFields(d, scale) {
  var o = {icon: 'curve'};
  if (hasValue(d.stroke)) o.stroke = d.stroke;
  if (hasValue(d.fill)) o.fill = d.fill;
  if (!hasValue(d.stroke) && !hasValue(d.fill)) o.stroke = getSymbolStrokeColor(d);
  if (isNumber(d['stroke-width'])) o['stroke-width'] = d['stroke-width'] * scale;
  if (isNumber(d['line-end-size'])) o['line-end-size'] = d['line-end-size'] * scale;
  ['stroke-dasharray', 'stroke-opacity', 'opacity', 'line-start', 'line-end',
    'line-fade', 'line-taper'].forEach(function(name) {
    if (hasValue(d[name])) o[name] = d[name];
  });
  return o;
}

function addFilledStyle(o, d) {
  o['icon-fill'] = getSymbolFillColor(d);
  if (hasValue(d.stroke)) o['icon-stroke'] = d.stroke;
  if (hasValue(d['stroke-width'])) o['icon-stroke-width'] = d['stroke-width'];
  if (hasValue(d.opacity)) o['icon-opacity'] = d.opacity;
  return o;
}

function addStroke(o, d) {
  if (hasValue(d.stroke)) o.stroke = d.stroke;
  if (hasValue(d['stroke-width'])) o['stroke-width'] = d['stroke-width'];
}

function addRotation(o, rotation) {
  if (rotation) o['icon-rotation'] = rotation;
}

// rotated= turns a polygon or star to its alternate orientation: a half step
// between two vertices (flipped= is an old name for it)
function getOrientationRotation(d, n) {
  return d.rotated || d.flipped ? 180 / n : 0;
}

function getOutputFieldNames(output) {
  var index = {};
  var fields = [];
  output.forEach(function(o) {
    Object.keys(o || {}).forEach(function(field) {
      if (field in index) return;
      index[field] = true;
      fields.push(field);
    });
  });
  return fields;
}

// Replaces each point with a polygon (or for stick arrows, a line) in map
// units, scaled so that the symbol is the size it would be drawn at
function makeGeographicSymbols(inputLyr, dataset, opts) {
  // Only the first point of each feature is used to place a generated shape,
  // so the other points of a multi-point feature would be dropped.
  requireSinglePointLayer(inputLyr);
  requireProjectedDataset(dataset);
  var lyr = opts.no_replace ? copyLayer(inputLyr) : inputLyr;
  var metersPerPx = opts.pixel_scale || getMetersPerPixel(lyr, dataset);
  var table = getLayerDataTable(lyr);
  var styleFields = ['fill', 'stroke', 'opacity'].filter(function(field) {
    return field in opts;
  });
  var hasNewFields = styleFields.some(function(field) {
    return !table.fieldExists(field);
  });
  if (styleFields.length > 0) {
    if (hasNewFields) {
      table.captureSchemaBefore({operation: 'symbols', fields: styleFields});
    } else {
      table.captureFieldsBefore(styleFields, {operation: 'symbols'});
    }
  }
  var records = table.getRecords();
  var getSymbolData = getSymbolDataAccessor(lyr, opts);
  var geometries = lyr.shapes.map(function(shp, i) {
    if (!shp) return null;
    var d = getSymbolData(i);
    var rec = records[i] || {};
    var geojsonType = 'Polygon';
    var coords;
    if (d.type == 'pie') {
      // a pie has a fill for each wedge, which a shape's single fill field
      // can't express
      stop('The pie symbol type does not support the geographic option.');
    }
    if (d.type == 'arrow' && opts.arrow_style == 'stick') {
      coords = getStickArrowCoords(d);
      geojsonType = 'MultiLineString';
    } else if (d.type == 'arrow') {
      coords = getFilledArrowCoords(d);
    } else if (d.type == 'ring') {
      coords = getRingCoords(d);
      geojsonType = 'MultiPolygon';
    } else if (d.type == 'star') {
      coords = getStarCoords(d);
    } else {
      coords = getPolygonCoords(d);
    }
    if (!coords) return null;
    rotateCoords(coords, +d.rotation || 0);
    if (+opts.scale) {
      scaleAndShiftCoords(coords, +opts.scale, [0, 0]);
    }
    scaleAndShiftCoords(coords, metersPerPx, shp[0]);
    if (d.fill) rec.fill = d.fill;
    if (d.stroke) rec.stroke = d.stroke;
    if (d.opacity) rec.opacity = d.opacity;
    return {type: geojsonType, coordinates: coords};
  });
  var dataset2 = importGeometries(geometries, records);
  var outputLyr = mergeOutputLayerIntoDataset(inputLyr, dataset, dataset2, opts);
  outputLyr.data = lyr.data;
  if (styleFields.length > 0) {
    if (hasNewFields) {
      table.markSchemaChanged({operation: 'symbols'});
    } else {
      table.markFieldsChanged(styleFields, {operation: 'symbols'});
    }
  }
  return [outputLyr];
}

function importGeometries(geometries, records) {
  var features = geometries.map(function(geom, i) {
    return {
      type: 'Feature',
      properties: records[i] || null,
      geometry: geom
    };
  });
  return importGeoJSON({type: 'FeatureCollection', features: features});
}

function getMetersPerPixel(lyr, dataset) {
  var bounds = getLayerBounds(lyr);
  // TODO: need a better way to handle a single point with no extent
  var extent = bounds.width() || bounds.height() || 1000;
  return extent / 800;
}

function roundToHundredths(n) {
  return Math.round(n * 100) / 100;
}

function getNumber(val) {
  var num = Number(val);
  return hasValue(val) && isFinite(num) ? num : 0;
}

function isNumber(val) {
  return hasValue(val) && isFinite(val);
}

function hasValue(val) {
  return val !== undefined && val !== null && val !== '';
}
