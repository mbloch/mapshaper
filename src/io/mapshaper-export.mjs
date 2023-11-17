import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { exportSVG } from '../svg/mapshaper-svg';
import { exportKML } from '../kml/kml-export';
import { exportDbf } from '../shapefile/dbf-export';
import { exportPackedDatasets, PACKAGE_EXT } from '../pack/mapshaper-pack';
import { exportDelim } from '../text/mapshaper-delim-export';
import { exportShapefile } from '../shapefile/shp-export';
import { exportTopoJSON } from '../topojson/topojson-export';
import { exportGeoJSON } from '../geojson/geojson-export';
import { exportJSON } from '../datatable/mapshaper-json-table';
import { setCoordinatePrecision } from '../geom/mapshaper-rounding';
import { copyDatasetForExport, copyDatasetForRenaming } from '../dataset/mapshaper-dataset-utils';
import { mergeDatasetsForExport } from '../dataset/mapshaper-merging';
import { getOutputFormat } from '../io/mapshaper-output-format';
import utils from '../utils/mapshaper-utils';
import { error } from '../utils/mapshaper-logging';
import { buildTopology } from '../topology/mapshaper-topology';
import { runningInBrowser } from '../mapshaper-env';
import { getFileBase } from '../utils/mapshaper-filename-utils';
import { gzipSync } from '../io/mapshaper-gzip';

// @targets - non-empty output from Catalog#findCommandTargets()
//
export async function exportTargetLayers(targets, opts) {
  // convert target fmt to dataset fmt
  var datasets = targets.map(function(target) {
    return utils.defaults({layers: target.layers}, target.dataset);
  });
  return exportDatasets(datasets, opts);
}

//
//
async function exportDatasets(datasets, opts) {
  var format = getOutputFormat(datasets[0], opts);
  var files;
  if (format == PACKAGE_EXT) {
    opts = utils.defaults({compact: true}, opts);
    return exportPackedDatasets(datasets, opts);
  }
  if (format == 'kml' || format == 'svg' || format == 'topojson' || format == 'geojson' && opts.combine_layers) {
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
  files = datasets.reduce(function(memo, dataset) {
    if (runningInBrowser()) {
      utils.sortOn(dataset.layers, 'menu_order', true);
    } else {
      // kludge to export layers in order that target= option or previous
      // -target command matched them (useful mainly for SVG output)
      // target_id was assigned to each layer by findCommandTargets()
      utils.sortOn(dataset.layers, 'target_id', true);
    }
    return memo.concat(exportFileContent(dataset, opts));
  }, []);

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
  //   GeoJSON precision is applied by the exporter, to handle default precision
  //   TopoJSON precision is applied to avoid redundant copying
  if (opts.precision && outFmt != 'svg' && outFmt != 'geojson' && outFmt != 'topojson') {
    dataset = copyDatasetForExport(dataset);
    setCoordinatePrecision(dataset, opts.precision);
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
    if (!lyr.geometry_type) {
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
