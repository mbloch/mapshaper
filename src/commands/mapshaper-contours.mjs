import cmd from '../mapshaper-cmd';
import {
  getDatasetCRS,
  getDatasetCrsInfo,
  setDatasetCrsInfo
} from '../crs/mapshaper-projections';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { DataTable } from '../datatable/mapshaper-data-table';
import { importGeoJSON } from '../geojson/geojson-import';
import { repairCrossedArcs } from '../paths/mapshaper-segment-intersection-repair';
import { buildClosedContourDataset } from '../rasters/mapshaper-raster-contour-bands';
import { getRasterGrid } from '../rasters/mapshaper-raster-utils';
import {
  getContourSmoothingDistance,
  getRasterContourLines
} from '../rasters/mapshaper-raster-contours';
import { message, stop } from '../utils/mapshaper-logging';

var DEFAULT_CONTOUR_FIELD = 'value';

cmd.contours = function(targetLyr, targetDataset, opts) {
  var field = opts.field || DEFAULT_CONTOUR_FIELD;
  var contours, dataset, outputLayers;
  if (!layerHasRaster(targetLyr)) {
    stop('Command requires a raster layer');
  }
  // Contours come from the layer's working samples, so they reflect any
  // earlier edits (e.g. -blur, -clip) rather than the original source pixels.
  contours = getRasterContourLines(targetLyr.raster, opts);
  if (opts.closed) {
    dataset = contours.lines.length > 0 ?
      importGeoJSON(getContoursGeoJSON(contours.lines, DEFAULT_CONTOUR_FIELD), {}) :
      createEmptyContourDataset();
    setDatasetCrsInfo(dataset, getDatasetCrsInfo(targetDataset));
    if (contours.lines.length > 0 && !opts.no_smoothing) {
      smoothContourDataset(dataset, getRasterGrid(targetLyr.raster));
    }
    dataset = buildClosedContourDataset(dataset, getRasterGrid(targetLyr.raster),
      contours);
    outputLayers = mergeDatasetsIntoDataset(targetDataset, [dataset]);
    setOutputLayerName(outputLayers[0], targetLyr, 'contours', opts);
    message(getClosedContoursMessage(outputLayers[0], contours));
    return outputLayers;
  }
  message(getContoursMessage(contours));
  if (contours.lines.length === 0) {
    return [createEmptyContourLayer(targetLyr, opts)];
  }
  dataset = importGeoJSON(getContoursGeoJSON(contours.lines, field), {});
  setDatasetCrsInfo(dataset, getDatasetCrsInfo(targetDataset));
  // Smooth before merging, so that only the contour arcs are affected. Merging
  // first would put them in the same ArcCollection as any vector layer already
  // in the target dataset, and -smooth rewrites every arc it is given.
  if (!opts.no_smoothing) {
    smoothContourDataset(dataset, getRasterGrid(targetLyr.raster));
  }
  outputLayers = mergeDatasetsIntoDataset(targetDataset, [dataset]);
  setOutputLayerName(outputLayers[0], targetLyr, 'contours', opts);
  return outputLayers;
};

function smoothContourDataset(dataset, grid) {
  var crs = getDatasetCRS(dataset);
  var distance = getContourSmoothingDistance(grid, crs);
  var unsmoothed, repair;
  if (!(distance > 0)) {
    message('Skipped contour smoothing: unable to determine the pixel size');
    return;
  }
  message('Smoothing contours with an auto-selected interval of ' +
    formatSmoothingDistance(distance, crs) + ' (a quarter of a pixel)');
  unsmoothed = dataset.arcs.getCopy();
  cmd.smooth(dataset, {
    distance: distance,
    // The contour staircase is an artifact, so there are no real corners to
    // preserve and no sub-pixel detail worth prefiltering out.
    no_corners: true,
    no_prefilter: true
  }, dataset.layers);
  // Contour lines never cross, so any crossing is smoothing pulling a line over
  // its neighbor. The interval is small enough that this is rare, and where it
  // happens the lines involved are better left as they were traced.
  repair = repairCrossedArcs(dataset.arcs, unsmoothed);
  if (repair.reverted > 0) {
    message('Left ' + repair.reverted + ' contour ' +
      (repair.reverted == 1 ? 'line' : 'lines') +
      ' unsmoothed, to keep lines from crossing');
  }
  if (repair.remaining > 0) {
    message('Unable to remove ' + repair.remaining + ' crossing' +
      (repair.remaining == 1 ? '' : 's') + ' between contour lines');
  }
}

function formatSmoothingDistance(distance, crs) {
  var rounded = Number(distance.toPrecision(3));
  return crs ? rounded + 'm' : String(rounded);
}

function getContoursGeoJSON(lines, field) {
  return {
    type: 'FeatureCollection',
    features: lines.map(function(line) {
      var properties = {};
      properties[field] = line.value;
      return {
        type: 'Feature',
        properties: properties,
        geometry: {
          type: 'LineString',
          coordinates: line.coords
        }
      };
    })
  };
}

function createEmptyContourLayer(targetLyr, opts) {
  var lyr = {
    geometry_type: 'polyline',
    shapes: [],
    data: new DataTable([])
  };
  setOutputLayerName(lyr, targetLyr, 'contours', opts);
  return lyr;
}

function createEmptyContourDataset() {
  return {
    info: {},
    layers: [{
      geometry_type: 'polyline',
      shapes: [],
      data: new DataTable([])
    }]
  };
}

function getContoursMessage(contours) {
  var levels = contours.levels;
  if (levels.length === 0) {
    return 'No contour levels fall inside the range of this raster';
  }
  return 'Traced ' + contours.lines.length + ' contour ' +
    (contours.lines.length == 1 ? 'line' : 'lines') + ' at ' + levels.length +
    (levels.length == 1 ? ' level' : ' levels') +
    ' (' + levels[0] + ' to ' + levels[levels.length - 1] + ')';
}

function getClosedContoursMessage(lyr, contours) {
  var count = lyr.shapes.length;
  if (count === 0) {
    return 'No closed contour bands were generated';
  }
  return 'Created ' + count + ' closed contour ' +
    (count === 1 ? 'band' : 'bands') + ' from ' + contours.levels.length +
    (contours.levels.length === 1 ? ' level' : ' levels');
}
