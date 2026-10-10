import { prepareDatasetForSVG, renderSVGDocument, getEmptyLayerForSVG,
  exportDataAttributesForSVG, getJpegQuality } from '../svg/mapshaper-svg';
import { exportDatasetAsGeoJSON } from '../geojson/geojson-export';
import { importGeoJSONFeatures } from '../svg/geojson-to-svg';
import { featureIsPathLabel, getDefaultStartOffset, initPathLabelReport,
  reportPathLabels } from '../svg/svg-label-paths';
import { convertPropertiesToDefinitions } from '../svg/svg-definitions';
import { stringify, stringEscape } from '../svg/svg-stringify';
import { rasterizeSVG, getPixelRatio } from '../svg/mapshaper-svg-rasterize';
import { getCurveLength, getPointAtCurveLength } from '../curves/mapshaper-curve-fit';
import { layerHasFurniture } from '../furniture/mapshaper-furniture';
import { isFrameLayer } from '../furniture/mapshaper-frame-utils';
import { layerHasRaster } from '../dataset/mapshaper-layer-utils';
import { getOutputFileBase } from '../utils/mapshaper-filename-utils';
import { convertTextStylesToClasses, formatTextClassesAsCss } from './html-text-classes';
import { applyWebFonts } from './html-font-stacks';
import { HtmlLabelClasses, renderHtmlLabelBox, labelHasHtmlText,
  getHtmlLabelCss } from './html-labels';
import { stop, warn } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// HTML output, modeled on the ai2html script for Adobe Illustrator: the map's
// shapes are drawn in an image, and its point symbols -- labels, icons, dots --
// are drawn over it as inline SVG. Each symbol is anchored to a position given
// as a percentage of the map's width and height, so that a map that resizes
// with its container keeps its symbols where they belong without scaling them.
//
// A label along a path is anchored the same way, at the point on its path
// where its text is attached, and keeps the shape and size of its path.
//
// With html-labels, anchored labels and text blocks are written as HTML text
// instead, above the SVG overlay -- see html-labels.mjs. Their callouts and
// icons, and path labels, stay in the overlay.

var CLASS_PREFIX = 'ms-';

export async function exportHTML(dataset, opts) {
  var responsiveness = getResponsiveness(opts);
  var imageFormat = getImageFormat(opts);
  var pixelRatio = getPixelRatio(opts);
  var o = prepareDatasetForSVG(dataset, Object.assign({}, opts, {
    // raster layers are resampled to the pixel density of the image
    raster_res: opts.raster_res || pixelRatio,
    linked_images: false,
    // covers the seams between polygons in the image -- see applySeamStroke()
    seam_stroke_width: 1 / pixelRatio
  }));
  var frame = o.frame;
  var base = getHtmlFileBase(o.dataset, opts);
  var layers = splitLayersForHTML(o.dataset.layers, o.dataset);
  var imageFile = base + (imageFormat == 'jpeg' ? '.jpg' : '.png');
  var image = await rasterizeSVG(renderSVGDocument(o.dataset, frame, layers.image, o.opts), {
    width: frame.width,
    height: frame.height,
    scale: pixelRatio,
    format: imageFormat,
    quality: getJpegQuality(opts)
  });
  var html = renderHtmlFragment({
    id: getContainerId(base),
    frame: frame,
    responsiveness: responsiveness,
    imageFile: imageFile,
    overlay: renderOverlay(o.dataset, frame, layers.overlay, o.opts)
  });
  return [{
    filename: opts.file || base + '.html',
    content: html
  }, {
    filename: imageFile,
    content: image
  }];
}

// Point layers go in the overlay; everything else is drawn in the image,
// beneath them. Layers are listed bottom to top.
export function splitLayersForHTML(layers, dataset) {
  var image = [], overlay = [];
  layers.forEach(function(lyr) {
    if (layerGoesInOverlay(lyr)) {
      overlay.push(lyr);
    } else {
      if (overlay.length > 0 && !isFrameLayer(lyr, dataset.arcs)) {
        warn(utils.format('Layer "%s" is drawn in the map image, beneath point layer "%s", which is above it in the layer order.',
          lyr.name || '[unnamed]', overlay[overlay.length - 1].name || '[unnamed]'));
      }
      image.push(lyr);
    }
  });
  return {image: image, overlay: overlay};
}

function layerGoesInOverlay(lyr) {
  return lyr.geometry_type == 'point' && !layerHasFurniture(lyr) &&
    !layerHasRaster(lyr);
}

function renderOverlay(dataset, frame, layers, opts) {
  var defs = [];
  var labelClasses = opts.html_labels ? new HtmlLabelClasses() : null;
  var labelLayers = [];
  var objects = layers.map(function(lyr) {
    var o = renderOverlayLayer(lyr, dataset, frame, opts, labelClasses);
    convertPropertiesToDefinitions(o.svg, defs);
    if (o.labels.length > 0) labelLayers.push(o.labels);
    return o.svg;
  });
  var classes = convertTextStylesToClasses(objects, CLASS_PREFIX + 'text-')
    .concat(labelClasses ? labelClasses.classes : []);
  classes.forEach(function(o) {
    applyWebFonts(o.style);
  });
  return {
    defs: defs,
    layers: objects,
    labelLayers: labelLayers,
    classes: classes
  };
}

// Returns {svg: the layer's SVG object, labels: [HTML string, ...]}
// @labelClasses: from HtmlLabelClasses(), for drawing anchored labels as HTML,
//   or null
function renderOverlayLayer(lyr, dataset, frame, opts, labelClasses) {
  var layerObj = getEmptyLayerForSVG(lyr, opts);
  var geojson = exportDatasetAsGeoJSON(utils.defaults({layers: [lyr]}, dataset), opts);
  var features = geojson.features || geojson.geometries || (geojson.type ? [geojson] : []);
  var dataAttributes = getDataAttributes(lyr, opts);
  var report = initPathLabelReport();
  var anchors = [];
  var htmlLabels = [];
  var labels = [];
  // each feature is rendered at the origin, and placed by a container
  var localFeatures = features.map(function(feat, i) {
    var geom = feat && feat.type == 'Feature' ? feat.geometry : feat;
    var props = feat && feat.properties || {};
    var localGeom = null;
    anchors[i] = [];
    if (!geom || !geom.coordinates) {
      // empty feature
    } else if (featureIsPathLabel(geom, props)) {
      anchors[i].push(getPathLabelAnchor(geom.coordinates, props));
      localGeom = {
        type: 'MultiPoint',
        coordinates: shiftCoords(geom.coordinates, anchors[i][0])
      };
    } else if (geom.type == 'Point' || geom.type == 'MultiPoint') {
      // the points of a multipoint feature (other than a path label) are drawn
      // with the same symbol
      anchors[i] = geom.type == 'Point' ? [geom.coordinates] : geom.coordinates;
      localGeom = {type: 'Point', coordinates: [0, 0]};
      if (labelClasses && labelHasHtmlText(props)) {
        htmlLabels[i] = renderHtmlLabelBox(props, labelClasses);
      }
    }
    return {
      type: 'Feature',
      id: feat && feat.id,
      properties: props,
      geometry: localGeom
    };
  }).map(function(feat) {
    if (feat.id === undefined) delete feat.id;
    return feat;
  });
  var symbols = importGeoJSONFeatures(localFeatures, utils.defaults({
    path_label_report: report,
    omit_label_text: !!labelClasses
  }, opts));
  reportPathLabels(report, lyr);

  htmlLabels.forEach(function(box, i) {
    if (!box) return;
    anchors[i].forEach(function(xy) {
      labels.push(`<div class="${CLASS_PREFIX}label" style="left:${formatPct(xy[0], frame.width)};top:${formatPct(xy[1], frame.height)}"` +
        formatDataAttributes(dataAttributes ? dataAttributes[i] : null) + '>' + box + '</div>');
    });
  });

  symbols.forEach(function(sym, i) {
    if (isEmptySymbol(sym)) return;
    removeOriginTransform(sym);
    anchors[i].forEach(function(xy, j) {
      layerObj.children.push({
        tag: 'svg',
        properties: Object.assign({
          x: formatPct(xy[0], frame.width),
          y: formatPct(xy[1], frame.height),
          overflow: 'visible'
        }, dataAttributes ? dataAttributes[i] : null),
        children: [j === 0 ? sym : copySymbolWithoutId(sym)]
      });
    });
  });
  return {svg: layerObj, labels: labels};
}

function formatDataAttributes(o) {
  return Object.keys(o || {}).map(function(k) {
    return ' ' + k + '="' + stringEscape(o[k]) + '"';
  }).join('');
}

// The point on a label's path where its text is attached: its start offset,
// which is where text-anchor places the text.
function getPathLabelAnchor(knots, rec) {
  var offset = String(rec['label-start-offset'] || getDefaultStartOffset(rec));
  var len = getCurveLength(knots);
  var dist = parseFloat(offset);
  var p;
  if (/%$/.test(offset)) {
    dist = dist / 100 * len;
  }
  p = getPointAtCurveLength(knots, utils.isFiniteNumber(dist) ? dist : len / 2) || knots[0];
  return [roundCoord(p[0]), roundCoord(p[1])];
}

function shiftCoords(coords, origin) {
  return coords.map(function(p) {
    return [roundCoord(p[0] - origin[0]), roundCoord(p[1] - origin[1])];
  });
}

function roundCoord(c) {
  return Math.round(c * 100) / 100;
}

function getDataAttributes(lyr, opts) {
  var fields;
  if (!opts.svg_data || !lyr.data) return null;
  fields = opts.svg_data.includes('*') ? lyr.data.getFields() :
    opts.svg_data.filter(function(name) { return lyr.data.fieldExists(name); });
  return exportDataAttributesForSVG(lyr.data.getRecords(), fields);
}

function isEmptySymbol(o) {
  return !o || o.tag == 'g' && (!o.children || o.children.length === 0);
}

// Symbols rendered at the origin are given a transform that places them there
function removeOriginTransform(o) {
  if (o.properties && o.properties.transform == 'translate(0 0)') {
    delete o.properties.transform;
  }
}

// ids must be unique, so only the first copy of a multipoint symbol keeps it
function copySymbolWithoutId(o) {
  var copy = JSON.parse(JSON.stringify(o));
  if (copy.properties) delete copy.properties.id;
  return copy;
}

export function formatPct(val, total) {
  var pct = total > 0 ? val / total * 100 : 0;
  return String(Math.round(pct * 1000) / 1000) + '%';
}

function renderHtmlFragment(o) {
  var id = o.id;
  var w = o.frame.width;
  var h = o.frame.height;
  var overlay = o.overlay;
  var selector = '#' + id;
  var boxCss = o.responsiveness == 'dynamic' ?
    `width:100%;aspect-ratio:${w} / ${h};` :
    `width:${w}px;height:${h}px;`;
  var css = [
    `${selector} {position:relative;overflow:hidden;${boxCss}}`,
    `${selector} .${CLASS_PREFIX}image {position:absolute;top:0;left:0;width:100%;height:100%;max-width:none;margin:0;display:block;}`,
    `${selector} .${CLASS_PREFIX}overlay {position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;}`
  ];
  if (overlay.labelLayers.length > 0) css.push(getHtmlLabelCss(selector));
  var classCss = formatTextClassesAsCss(overlay.classes, selector);
  if (classCss) css.push(classCss);
  // Hidden from screen readers, which would otherwise read the labels as a
  // list of unrelated words, and each halo'd label twice
  var html = `<div id="${stringEscape(id)}" class="${CLASS_PREFIX}map" aria-hidden="true">
<style>
${css.join('\n')}
</style>
<img class="${CLASS_PREFIX}image" src="${stringEscape(o.imageFile)}" width="${w}" height="${h}" alt="">`;
  if (overlayHasSvg(overlay)) {
    html += '\n' + renderOverlaySvg(overlay);
  }
  if (overlay.labelLayers.length > 0) {
    html += '\n' + renderHtmlLabels(overlay.labelLayers);
  }
  return html + '\n</div>\n';
}

// An overlay whose layers are all HTML labels has nothing to draw in SVG
function overlayHasSvg(overlay) {
  return overlay.defs.length > 0 || overlay.layers.some(function(lyr) {
    return lyr.children && lyr.children.length > 0;
  }) || overlay.layers.length > 0 && overlay.labelLayers.length === 0;
}

// Above the SVG overlay, bottom layer first
function renderHtmlLabels(labelLayers) {
  return `<div class="${CLASS_PREFIX}labels">\n` + labelLayers.map(function(labels) {
    return labels.join('\n');
  }).join('\n') + '\n</div>';
}

function renderOverlaySvg(overlay) {
  var svg = `<svg class="${CLASS_PREFIX}overlay" stroke-linecap="round" stroke-linejoin="round">\n`;
  if (overlay.defs.length > 0) {
    svg += '<defs>\n' + utils.pluck(overlay.defs, 'svg').join('') + '</defs>\n';
  }
  svg += overlay.layers.map(stringify).join('\n');
  return svg + '\n</svg>';
}

function getHtmlFileBase(dataset, opts) {
  return opts.file ? opts.file.replace(/\.html?$/i, '') : getOutputFileBase(dataset);
}

function getContainerId(base) {
  return CLASS_PREFIX + base.replace(/[^\w-]+/g, '-');
}

function getResponsiveness(opts) {
  var val = opts.responsiveness || 'fixed';
  if (val != 'fixed' && val != 'dynamic') {
    stop('Unsupported responsiveness= option:', val, '(expected fixed or dynamic)');
  }
  return val;
}

function getImageFormat(opts) {
  var fmt = String(opts.image_format || 'png').toLowerCase();
  if (fmt == 'jpg') fmt = 'jpeg';
  if (fmt != 'png' && fmt != 'jpeg') {
    stop('Unsupported image-format= option:', opts.image_format, '(expected png or jpg)');
  }
  return fmt;
}
