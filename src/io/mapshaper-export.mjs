import { getLayerBounds, layerHasRaster } from '../dataset/mapshaper-layer-utils';
import { exportSVG } from '../svg/mapshaper-svg';
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
import { setCoordinatePrecision } from '../geom/mapshaper-rounding';
import { copyDatasetForExport, copyDatasetForRenaming } from '../dataset/mapshaper-dataset-utils';
import { mergeDatasetsForExport } from '../dataset/mapshaper-merging';
import { getOutputFormat } from '../io/mapshaper-output-format';
import utils from '../utils/mapshaper-utils';
import { error, stop } from '../utils/mapshaper-logging';
import { buildTopology } from '../topology/mapshaper-topology';
import { runningInBrowser } from '../mapshaper-env';
import { getFileBase } from '../utils/mapshaper-filename-utils';
import { gzipSync } from '../io/mapshaper-gzip';
import { getRasterBBox, getRasterGrid, getRasterPreview } from '../rasters/mapshaper-raster-utils';

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
  var datasets;
  if (format == PACKAGE_EXT && !runningInBrowser()) {
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
  return exportDatasets(datasets, opts);
}

//
//
async function exportDatasets(datasets, opts) {
  var format = getOutputFormat(datasets[0], opts);
  var files;
  validateRasterExportFormat(datasets, format);
  if (format != 'geoparquet' && (opts.compression || opts.level !== undefined)) {
    error('The compression= and level= options only apply to GeoParquet output');
  }
  if (format == PACKAGE_EXT) {
    opts = utils.defaults({compact: true}, opts);
    return exportPackedDatasets(datasets, opts);
  }
  if (format == 'kml' || format == 'svg' || format == 'topojson' || format == 'geopackage' ||
      format == 'geojson' && opts.combine_layers) {
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
  if (format == 'geopackage') {
    if (datasets.length > 1) {
      datasets = [mergeDatasetsForExport(datasets)];
    }
    datasets.forEach(sortExportLayers);
    files = await exportGeoPackage(datasets[0], opts);
  } else if (format == 'geoparquet') {
    var layerCount = datasets.reduce(function(sum, d) {
      return sum + d.layers.length;
    }, 0);
    var singleFileName = opts.file && layerCount == 1 ? opts.file : null;
    files = [];
    for (var i = 0; i < datasets.length; i++) {
      sortExportLayers(datasets[i]);
      files = files.concat(await exportGeoParquet(datasets[i], opts, singleFileName));
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

function validateRasterExportFormat(datasets, format) {
  if (!datasetsHaveRasterLayers(datasets)) return;
  if (format == 'svg' || format == PACKAGE_EXT) return;
  stop('Raster layers can only be exported as SVG or ' + PACKAGE_EXT + ' files');
}

function datasetsHaveRasterLayers(datasets) {
  return datasets.some(function(dataset) {
    return dataset.layers && dataset.layers.some(layerHasRaster);
  });
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
  kml: exportKML
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
    return lyr.name || 'layer';
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
//     them on load (no `&display-all` URL flag needed);
//   - those targeted layers get menu_order values that follow the linear
//     -target list (first targeted = bottom of the stack, last = top),
//     matching the SVG draw order from the same -target line;
//   - untargeted layers get menu_order values below every targeted layer,
//     so they sit at the bottom of the GUI panel out of the way (they're
//     hidden, but if the user pins one later it doesn't pop above the
//     intended stack).
//
// Intra-dataset array order is preserved so re-importing with `mapshaper
// foo.msx -target * -o bar.svg` still iterates layers in the order they
// appeared during the original run.
function prepareCatalogForCliPackExport(catalog, targets) {
  var targeted = new Set();
  targets.forEach(function(t) {
    t.layers.forEach(function(lyr) { targeted.add(lyr); });
  });
  var datasets = catalog.getDatasets();
  // Count untargeted layers globally so we can offset targeted layers'
  // menu_order to sit above them in a single consecutive range.
  var untargetedCount = 0;
  datasets.forEach(function(d) {
    d.layers.forEach(function(lyr) {
      if (!targeted.has(lyr)) untargetedCount++;
    });
  });
  var untargetedSeq = 0;
  return datasets.map(function(dataset) {
    var layers = dataset.layers.map(function(lyr) {
      var isTargeted = targeted.has(lyr);
      var menuOrder;
      if (isTargeted && lyr.target_id != null && lyr.target_id >= 0) {
        // target_id is 0-based across the whole -target list; offset past
        // the untargeted block so targeted layers occupy [untargetedCount+1
        // .. untargetedCount+N].
        menuOrder = untargetedCount + lyr.target_id + 1;
      } else {
        // Untargeted (or untargeted-shaped target_id): pack into the bottom
        // of the global stack, in catalog walk order.
        menuOrder = ++untargetedSeq;
      }
      return utils.defaults({
        pinned: isTargeted,
        menu_order: menuOrder
      }, lyr);
    });
    return utils.defaults({layers: layers}, dataset);
  });
}
