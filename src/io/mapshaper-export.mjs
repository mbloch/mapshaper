import { getLayerBounds, layerHasRaster } from '../dataset/mapshaper-layer-utils';
import { exportSVG, prepareDatasetForSVG, renderSVGContent } from '../svg/mapshaper-svg';
import { exportHTML, combineHtmlMaps } from '../html/mapshaper-html-export';
import { exportMapImage } from '../svg/mapshaper-map-image-export';
import { exportKML } from '../kml/kml-export';
import { exportDbf } from '../shapefile/dbf-export';
import { exportPackedDatasets, PACKAGE_EXT } from '../pack/mapshaper-pack';
import { exportDelim } from '../text/mapshaper-delim-export';
import { exportShapefile } from '../shapefile/shp-export';
import { exportTopoJSON } from '../topojson/topojson-export';
import { exportGeoJSON } from '../geojson/geojson-export';
import { exportJSON } from '../datatable/mapshaper-json-table';
import { exportFlatGeobuf } from '../flatgeobuf/mapshaper-flatgeobuf-export';
import { exportGeoPackage } from '../geopackage/mapshaper-geopackage-export';
import { exportGeoParquet } from '../geoparquet/mapshaper-geoparquet-export';
import { exportGeoTIFF } from '../geotiff/mapshaper-geotiff-export';
import { setCoordinatePrecision } from '../geom/mapshaper-rounding';
import { copyDatasetForExport, copyDatasetForRenaming } from '../dataset/mapshaper-dataset-utils';
import { mergeDatasetsForExport } from '../dataset/mapshaper-merging';
import { getOutputFormat } from '../io/mapshaper-output-format';
import utils from '../utils/mapshaper-utils';
import { error, stop } from '../utils/mapshaper-logging';
import { buildTopology } from '../topology/mapshaper-topology';
import { runningInBrowser } from '../mapshaper-env';
import { getFileBase, layerNameIsUnsafeFilename } from '../utils/mapshaper-filename-utils';
import { gzipSync } from '../io/mapshaper-gzip';
import { getRasterBBox, getRasterGrid, getRasterPreview } from '../rasters/mapshaper-raster-utils';
import { getFurnitureLayerData, layerIsFurniture } from '../furniture/mapshaper-furniture-utils';
import { layerIsOverlay } from '../furniture/mapshaper-overlays';
import { getFrameById } from '../furniture/mapshaper-frame-resolver';
import { getFrameExportFilename, getMapExportGroups } from '../furniture/mapshaper-frame-export';
import { getStackedLayers } from '../dataset/mapshaper-layer-stacking';

// @targets - non-empty output from Catalog#findCommandTargets()
//
export async function exportTargetLayers(catalog, targets, opts) {
  // kludge: get extent of 'fit-extent' layer (if given)
  if (opts.fit_extent) {
    var target = catalog.findSingleLayer(opts.fit_extent);
    var bounds = getLayerBounds(target.layer, target.dataset.arcs);
    opts = Object.assign({svg_bbox: bounds.toArray()}, opts);
  }
  var format = getOutputFormat(targets[0].dataset, opts);
  var datasets, groups;
  // The web UI's export dialog composes its own map (gui_frame)
  if (isRenderedMapFormat(format) && !opts.gui_frame) {
    groups = getMapExportGroups(catalog, targets);
  }
  if (groups && groups.length > 1) {
    return exportFrameMaps(catalog, groups, format, opts);
  }
  if (groups) {
    datasets = groups[0].datasets;
  } else if (format == PACKAGE_EXT && !runningInBrowser()) {
    // CLI .msx export captures the whole session: every dataset/layer in the
    // catalog ships in the snapshot, not just the -target subset. Targeted
    // layers come back visible (pinned) and stacked in the order matched by
    // -target; untargeted layers come along for the ride, hidden and parked
    // at the bottom of the GUI stack. This matches GUI snapshot semantics
    // and lets `mapshaper a.shp b.shp -target a -o foo.msx` produce a
    // shareable bundle without losing b.shp.
    datasets = prepareCatalogForCliPackExport(catalog, targets);
  } else {
    datasets = targets.map(function(target) {
      return utils.defaults({layers: target.layers}, target.dataset);
    });
  }
  if (isRenderedMapFormat(format)) {
    opts = addOverlayExports(catalog, datasets, opts);
  }
  return exportDatasets(datasets, opts);
}

// One map per frame, named after the frame. HTML maps of different widths
// share a file (see combineHtmlMaps()).
async function exportFrameMaps(catalog, groups, format, opts) {
  var files = [];
  for (var group of groups) {
    var groupOpts = Object.assign({}, opts, {
      file: getFrameExportFilename(group.frame, opts.file, format)
    });
    if (format == 'html') {
      groupOpts.html_artboards = true;
      groupOpts.html_artboard_name = group.frame.layer.name;
    }
    groupOpts = addOverlayExports(catalog, group.datasets, groupOpts);
    files = files.concat(await exportDatasets(group.datasets, groupOpts));
  }
  return format == 'html' ? combineHtmlMaps(files, opts) : files;
}

// Renders the maps of the overlay frames placed on the map being exported,
// for the SVG renderer to place on the page (opts.svg_overlays)
// @datasets the datasets of the map being exported
function addOverlayExports(catalog, datasets, opts, visited) {
  var overlays = renderOverlayExports(catalog, datasets, opts, visited || []);
  return overlays ? Object.assign({}, opts, {svg_overlays: overlays}) : opts;
}

function renderOverlayExports(catalog, datasets, opts, visited) {
  var ids = [];
  var overlays = {};
  datasets.forEach(function(dataset) {
    dataset.layers.filter(layerIsOverlay).forEach(function(lyr) {
      var id = getFurnitureLayerData(lyr).frame;
      if (!ids.includes(id)) ids.push(id);
    });
  });
  ids.forEach(function(id) {
    var frame = getFrameById(catalog, id);
    if (frame && !visited.includes(id)) {
      overlays[id] = renderOverlayFrameMap(catalog, frame, opts, visited.concat(id));
    }
  });
  return ids.length > 0 ? overlays : null;
}

// An overlay frame's map, drawn the way an export of the frame would draw it.
// Rasters are embedded, and element ids are prefixed with the frame's name so
// they don't collide with the host's.
// Exported so the GUI proofing layer can show the same content as map export.
export function renderOverlayFrameMap(catalog, frame, hostOpts, visited) {
  visited = visited || [frame.dataset.id];
  var group = getMapExportGroups(catalog, [{layers: [frame.layer], dataset: frame.dataset}])[0];
  var datasets = group.datasets;
  var name = frame.layer.name || 'overlay';
  var opts = {
    id_prefix: (hostOpts.id_prefix || '') + name + '-',
    precision: hostOpts.precision,
    raster_res: hostOpts.raster_res,
    svg_raster_format: hostOpts.svg_raster_format,
    jpeg_quality: hostOpts.jpeg_quality,
    default_linecap: hostOpts.default_linecap
  };
  var dataset, o;
  opts = addOverlayExports(catalog, datasets, opts, visited);
  if (datasets.length > 1) {
    dataset = mergeDatasetsForExport(datasets);
    opts.final = true;
  } else {
    dataset = datasets[0];
  }
  utils.sortOn(dataset.layers, 'target_id', true); // drawing order, from getMapExportGroups()
  o = prepareDatasetForSVG(copyDatasetForRenderedExport(dataset), opts);
  return {
    name: name,
    width: o.frame.width,
    height: o.frame.height,
    content: renderSVGContent(o.dataset, o.frame, o.dataset.layers, o.opts)
  };
}

//
//
async function exportDatasets(datasets, opts) {
  var format = getOutputFormat(datasets[0], opts);
  var files;
  if (!isRenderedMapFormat(format) && format != PACKAGE_EXT) {
    datasets = removeFurnitureLayers(datasets);
  }
  validateRasterExportFormat(datasets, format);
  if (format != 'geoparquet' && opts.level !== undefined) {
    error('The level= option only applies to GeoParquet output');
  }
  if (format != 'geoparquet' && format != 'geotiff' && opts.compression) {
    error('The compression= option only applies to GeoParquet and GeoTIFF output');
  }
  if (format == PACKAGE_EXT) {
    opts = utils.defaults({compact: true}, opts);
    return exportPackedDatasets(datasets, opts);
  }
  if (format == 'kml' || isRenderedMapFormat(format) || format == 'topojson' ||
      format == 'geopackage' || format == 'geojson' && opts.combine_layers) {
    // multi-layer formats: combine multiple datasets into one
    if (datasets.length > 1) {
      datasets = [mergeDatasetsForExport(datasets)];
      if (format == 'topojson') {
        // Build topology, in case user has loaded several
        // files derived from the same source, with matching coordinates
        // (Downsides: useless work if geometry is unrelated;
        // could create many small arcs if layers are partially related)
        buildTopology(datasets[0]);
      }
      // KLUDGE let exporter know that copying is not needed
      // (because shape data was deep-copied during merge)
      opts = utils.defaults({final: true}, opts);
    }
  } else {
    datasets = datasets.map(copyDatasetForRenaming);
    assignUniqueLayerNames2(datasets);
  }
  if (format == 'html') {
    sortExportLayers(datasets[0]);
    // HTML bypasses exportFileContent(), because rendering its image is async.
    files = await exportHTML(copyDatasetForRenderedExport(datasets[0]),
      utils.defaults({format: format}, opts));
  } else if (format == 'png' || format == 'jpg') {
    sortExportLayers(datasets[0]);
    files = await exportMapImage(copyDatasetForRenderedExport(datasets[0]),
      utils.defaults({format: format}, opts));
  } else if (format == 'geopackage') {
    if (datasets.length > 1) {
      datasets = [mergeDatasetsForExport(datasets)];
    }
    datasets.forEach(sortExportLayers);
    // GeoPackage bypasses exportFileContent(), where precision is normally applied.
    files = await exportGeoPackage(applyExportPrecision(datasets[0], opts), opts);
  } else if (format == 'geoparquet') {
    var layerCount = datasets.reduce(function(sum, d) {
      return sum + d.layers.length;
    }, 0);
    var singleFileName = opts.file && layerCount == 1 ? opts.file : null;
    files = [];
    for (var i = 0; i < datasets.length; i++) {
      sortExportLayers(datasets[i]);
      // GeoParquet bypasses exportFileContent(), where precision is normally applied.
      files = files.concat(await exportGeoParquet(applyExportPrecision(datasets[i], opts), opts, singleFileName));
    }
  } else {
    files = datasets.reduce(function(memo, dataset) {
      sortExportLayers(dataset);
      return memo.concat(exportFileContent(dataset, opts));
    }, []);
  }

  if (opts.bbox_index) {
    // If rounding or quantization are applied during export, bounds may
    // change somewhat... consider adding a bounds property to each layer during
    // export when appropriate.
    files.push(createIndexFile(datasets));
  }

  // need unique names for multiple output files
  assignUniqueFileNames(files);

  if (opts.gzip) {
    files.forEach(function(obj) {
      obj.filename += '.gz';
      obj.content = gzipSync(obj.content);
    });
  }
  return files;
}

// Scalebars and other map furniture only have a meaning in SVG output
function removeFurnitureLayers(datasets) {
  var hasFurniture = datasets.some(function(dataset) {
    return dataset.layers.some(layerIsFurniture);
  });
  if (!hasFurniture) return datasets;
  datasets = datasets.map(function(dataset) {
    return utils.defaults({
      layers: dataset.layers.filter(function(lyr) { return !layerIsFurniture(lyr); })
    }, dataset);
  }).filter(function(dataset) {
    return dataset.layers.length > 0;
  });
  if (datasets.length === 0) {
    stop('Map furniture layers (e.g. scalebars) can only be exported as SVG');
  }
  return datasets;
}

function validateRasterExportFormat(datasets, format) {
  if (format == 'geotiff') {
    if (datasetsHaveVectorLayers(datasets)) {
      stop('GeoTIFF output requires raster layers; use -target to select them');
    }
    return;
  }
  if (!datasetsHaveRasterLayers(datasets)) return;
  if (isRenderedMapFormat(format) || format == PACKAGE_EXT) return;
  stop('Raster layers can only be exported as GeoTIFF, SVG, HTML or ' + PACKAGE_EXT + ' files');
}

// Formats that draw the map, with its styles and furniture
function isRenderedMapFormat(format) {
  return format == 'svg' || format == 'html' || format == 'png' || format == 'jpg';
}

// The parts of exportFileContent() that apply to HTML and image output: layers
// are shallow-copied so they can be given unique names, which become element ids.
function copyDatasetForRenderedExport(dataset) {
  dataset = utils.defaults({
    layers: dataset.layers.map(function(lyr) {return utils.extend({}, lyr);})
  }, dataset);
  assignUniqueLayerNames(dataset.layers);
  validateLayerData(dataset.layers);
  return dataset;
}

function datasetsHaveRasterLayers(datasets) {
  return datasets.some(function(dataset) {
    return dataset.layers && dataset.layers.some(layerHasRaster);
  });
}

function datasetsHaveVectorLayers(datasets) {
  return datasets.some(function(dataset) {
    return dataset.layers && dataset.layers.some(function(lyr) {
      return !layerHasRaster(lyr);
    });
  });
}

// Apply -o precision= the same way exportFileContent() does for formats that
// take their own export path (GeoPackage, GeoParquet).
function applyExportPrecision(dataset, opts) {
  if (!opts.precision) return dataset;
  dataset = copyDatasetForExport(dataset);
  setCoordinatePrecision(dataset, opts.precision, !!opts.fix_geometry);
  return dataset;
}

// Return an array of objects with 'filename' and 'content' members.
//
export function exportFileContent(dataset, opts) {
  var outFmt = opts.format = getOutputFormat(dataset, opts),
      exporter = exporters[outFmt],
      files = [];

  if (!outFmt) {
    error('Missing output format');
  } else if (!exporter) {
    error('Unknown output format:', outFmt);
  }
  validateRasterExportFormat([dataset], outFmt);

  // shallow-copy dataset and layers, so layers can be renamed for export
  dataset = utils.defaults({
    layers: dataset.layers.map(function(lyr) {return utils.extend({}, lyr);})
  }, dataset);

  // Adjust layer names, so they can be used as output file names
  // (except for multi-layer formats TopoJSON, SVG, KML)
  if (opts.file && outFmt != 'topojson' && outFmt != 'svg'&& outFmt != 'kml') {
    dataset.layers.forEach(function(lyr) {
      lyr.name = getFileBase(opts.file);
    });
  }
  assignUniqueLayerNames(dataset.layers);

  // apply coordinate precision, except:
  //   svg precision is applied by the SVG exporter, after rescaling
  //   TopoJSON precision is applied to avoid redundant copying
  if (opts.precision && outFmt != 'svg' && outFmt != 'topojson') {
    dataset = copyDatasetForExport(dataset);
    setCoordinatePrecision(dataset, opts.precision, !!opts.fix_geometry);
  }

  if (opts.cut_table) {
    files = exportDataTables(dataset.layers, opts).concat(files);
  }

  if (opts.extension) {
    opts.extension = fixFileExtension(opts.extension, outFmt);
  }

  validateLayerData(dataset.layers);
  files = exporter(dataset, opts).concat(files);
  validateFileNames(files);
  return files;
}

var exporters = {
  // [PACKAGE_EXT]: exportPackedDatasets, // handled as a special case
  geojson: exportGeoJSON,
  topojson: exportTopoJSON,
  shapefile: exportShapefile,
  dsv: exportDelim,
  dbf: exportDbf,
  json: exportJSON,
  flatgeobuf: exportFlatGeobuf,
  svg: exportSVG,
  kml: exportKML,
  geotiff: exportGeoTIFF
};


// Generate json file with bounding boxes and names of each export layer
// TODO: consider making this a command, or at least make format settable
//
function createIndexFile(datasets) {
  var index = [];
  datasets.forEach(function(dataset) {
    dataset.layers.forEach(function(lyr) {
      var bounds = getLayerBounds(lyr, dataset.arcs);
      index.push({
        bbox: bounds.toArray(),
        name: lyr.name
      });
    });
  });

  return {
    content: JSON.stringify(index),
    filename: 'bbox-index.json'
  };
}

// Throw errors for various error conditions
function validateLayerData(layers) {
  layers.forEach(function(lyr) {
    if (layerHasRaster(lyr)) {
      if (!getRasterBBox(lyr.raster) || !getRasterPreview(lyr.raster) && !(getRasterGrid(lyr.raster) && getRasterGrid(lyr.raster).samples)) {
        error('A raster layer is missing preview data or bounds');
      }
    } else if (!lyr.geometry_type) {
      // allowing data-only layers
      if (lyr.shapes && utils.some(lyr.shapes, function(o) {
        return !!o;
      })) {
        error('A layer contains shape records and a null geometry type');
      }
    } else {
      if (!utils.contains(['polygon', 'polyline', 'point'], lyr.geometry_type)) {
        error ('A layer has an invalid geometry type:', lyr.geometry_type);
      }
      if (!lyr.shapes) {
        error ('A layer is missing shape data');
      }
    }
  });
}

function validateFileNames(files) {
  var index = {};
  files.forEach(function(file, i) {
    var filename = file.filename;
    if (!filename) error('Missing a filename for file' + i);
    if (filename in index) error('Duplicate filename', filename);
    index[filename] = true;
  });
}

export function assignUniqueLayerNames(layers) {
  var names = layers.map(function(lyr) {
    var name = lyr.name || 'layer';
    if (layerNameIsUnsafeFilename(name)) {
      // Block path-traversal via data-derived layer names (e.g. a malicious
      // TopoJSON object key like "../owned") before they reach a file write.
      stop('Layer name cannot be used as an output filename (path separator or drive prefix):', name);
    }
    return name;
  });
  var uniqueNames = utils.uniqifyNames(names);
  layers.forEach(function(lyr, i) {
    lyr.name = uniqueNames[i];
  });
}

// Assign unique layer names across multiple datasets
function assignUniqueLayerNames2(datasets) {
  var layers = datasets.reduce(function(memo, dataset) {
    return memo.concat(dataset.layers);
  }, []);
  assignUniqueLayerNames(layers);
}

export function assignUniqueFileNames(output) {
  var names = output.map(function(o) {return o.filename;});
  var uniqnames = utils.uniqifyNames(names, formatVersionedFileName);
  output.forEach(function(o, i) {o.filename = uniqnames[i];});
}

// TODO: remove this -- format=json creates the same output
//   (but need to make sure there's a way to prevent names of json data files
//    from colliding with names of GeoJSON or TopoJSON files)
function exportDataTables(layers, opts) {
  var tables = [];
  layers.forEach(function(lyr) {
    if (lyr.data) {
      tables.push({
        content: JSON.stringify(lyr.data),
        filename: (lyr.name ? lyr.name + '-' : '') + 'table.json'
      });
    }
  });
  return tables;
}

export function formatVersionedFileName(filename, i) {
  var parts = filename.split('.');
  var ext, base;
  if (parts.length < 2) {
    return utils.formatVersionedName(filename, i);
  }
  ext = parts.pop();
  base = parts.join('.');
  return utils.formatVersionedName(base, i) + '.' + ext;
}

function fixFileExtension(ext, fmt) {
  // TODO: use fmt to validate
  return ext.replace(/^\.+/, '');
}

function sortExportLayers(dataset) {
  if (runningInBrowser()) {
    utils.sortOn(dataset.layers, 'menu_order', true);
  } else {
    // kludge to export layers in order that target= option or previous
    // -target command matched them (useful mainly for SVG output)
    // target_id was assigned to each layer by findCommandTargets()
    utils.sortOn(dataset.layers, 'target_id', true);
  }
}

// Prepare the full catalog for a CLI `-o foo.msx` export. Returns a
// shallow-copied datasets/layers tree (the live model is left alone) where:
//
//   - every dataset and every layer in the catalog is present, not just the
//     -target subset, so .msx round-trips the entire working session;
//   - layers matched by -target are marked `pinned: true` so the GUI shows
//     them on load (no `&display-all` URL flag needed), and other layers
//     are hidden;
//   - menu_order is the session's stacking order (see getStackedLayers()),
//     numbered from 1, so the target list doesn't restack frame members.
//
// Intra-dataset array order is preserved so re-importing with `mapshaper
// foo.msx -target * -o bar.svg` still iterates layers in the order they
// appeared during the original run.
function prepareCatalogForCliPackExport(catalog, targets) {
  var targeted = new Set();
  var stack = getStackedLayers(catalog).map(function(o) { return o.layer; });
  targets.forEach(function(t) {
    t.layers.forEach(function(lyr) { targeted.add(lyr); });
  });
  return catalog.getDatasets().map(function(dataset) {
    var layers = dataset.layers.map(function(lyr) {
      return utils.defaults({
        pinned: targeted.has(lyr),
        menu_order: stack.indexOf(lyr) + 1
      }, lyr);
    });
    return utils.defaults({layers: layers}, dataset);
  });
}
