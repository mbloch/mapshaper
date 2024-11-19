import { getFrameSize } from '../furniture/mapshaper-frame-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
import { message, stop } from '../utils/mapshaper-logging';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { getDatasetCRS, getDatasetCrsInfo, setDatasetCrsInfo} from '../crs/mapshaper-projections';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { importPolygon } from '../svg/geojson-to-svg';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { Bounds } from '../geom/mapshaper-bounds';
import { convertFourSides, parseSizeParam } from '../geom/mapshaper-units';
import { bboxToPolygon } from '../commands/mapshaper-rectangle';
import { expandCommandTargets } from '../dataset/mapshaper-target-utils';
import { requireDatasetsHaveCompatibleCRS } from '../crs/mapshaper-projections';
import { importGeoJSON } from '../geojson/geojson-import';
import { roundToDigits } from '../geom/mapshaper-rounding';

cmd.frame = function(catalog, targets, opts) {
  var widthPx, heightPx, aspectRatio, scale, bbox;
  if (opts.width) {
    widthPx = parseSizeParam(opts.width);
    if (widthPx > 0 === false) {
      stop('Invalid width parameter:', opts.width);
    }
  }
  if (opts.height) {
    heightPx = parseSizeParam(opts.height);
    if (heightPx > 0 === false) {
      stop('Invalid height parameter:', opts.height);
    }
  }
  if (!widthPx && !heightPx) {
    widthPx = 800;
    message('Using default 800px frame width');
  }

  if (opts.aspect_ratio) {
    if (opts.aspect_ratio > 0 === false) {
      stop('Invalid aspect-ratio parameter:', opts.aspect_ratio);
    }
    if (!heightPx) {
      heightPx = roundToDigits(widthPx / opts.aspect_ratio, 1);
    } else if (!widthPx) {
      widthPx = roundToDigits(heightPx * opts.aspect_ratio, 1);
    }
  }

  if (opts.bbox) {
    bbox = opts.bbox;
    // TODO: validate
  } else {
    var datasets = utils.pluck(targets, 'dataset');
    requireDatasetsHaveCompatibleCRS(datasets, 'Targets include both projected and unprojected coordinates');
    bbox = getTargetBbox(targets);
    if (!bbox) {
      stop('Command target is missing geographical bounds');
    }
  }

  applyPercentageOffsets(bbox, opts.offset || opts.offsets);
  applyPixelOffsets(bbox, widthPx, heightPx, opts.offset || opts.offsets);

  if (bbox[3] - bbox[1] > 0 === false || bbox[2] - bbox[0] > 0 === false) {
    stop('Frame has a collapsed bbox');
  }

  aspectRatio = (bbox[2] - bbox[0]) / (bbox[3] - bbox[1]);
  if (!widthPx) {
    widthPx = roundToDigits(heightPx * aspectRatio, 1);
  } else if (!heightPx) {
    heightPx = roundToDigits(widthPx / aspectRatio, 1);
  }

  var feature = {
    type: 'Feature',
    properties: {type: 'frame', width: widthPx, height: heightPx},
    geometry: bboxToPolygon(bbox)
  };
  var frameDataset = importGeoJSON(feature);
  // set CRS from target dataset
  // TODO: handle case: targets have different projections
  // TODO: handle case: first target is missing CRS
  if (targets.length > 0) {
    var crsInfo = getDatasetCrsInfo(targets[0].dataset);
    setDatasetCrsInfo(frameDataset, crsInfo);
  }
  frameDataset.layers[0].name = opts.name || 'frame';
  catalog.addDataset(frameDataset);
};

function fillOutBbox(bbox, widthPx, heightPx) {
  var hpad = 0, vpad = 0;
  var w = bbox[2] - bbox[0];
  var h = bbox[3] - bbox[1];
  if (widthPx / heightPx > w / h) { // need to add horizontal padding
    hpad = h * widthPx / heightPx - w;
  } else {
    vpad = w * heightPx / widthPx - h;
  }
  bbox[0] -= hpad / 2;
  bbox[1] -= vpad / 2;
  bbox[2] += hpad / 2;
  bbox[3] += vpad / 2;
}

function applyPercentageOffsets(bbox, arg) {
  var sides = getPctOffsets(arg);
  var l = sides[0],
    b = sides[1],
    r = sides[2],
    t = sides[3],
    w2 = (bbox[2] - bbox[0]) / (1 - l - r),
    h2 = (bbox[3] - bbox[1]) / (1 - t - b);
  bbox[0] -= l * w2;
  bbox[1] -= b * h2;
  bbox[2] += r * w2;
  bbox[3] += t * h2;
}

function applyPixelOffsets(bbox, widthPx, heightPx, arg) {
  var sides = getPixelOffsets(arg);
  var l = sides[0],
    b = sides[1],
    r = sides[2],
    t = sides[3],
    scale, w, h;

  if (widthPx && heightPx) {
    // add padding to bbox to match pixel dimensions, if needed
    fillOutBbox(bbox, widthPx, heightPx);
  }

  w = bbox[2] - bbox[0];
  h = bbox[3] - bbox[1];

  if (widthPx) {
    scale = w / (widthPx - l - r);
  } else {
    scale = w / (heightPx - t - b);
  }

  bbox[0] -= scale * l;
  bbox[1] -= scale * b;
  bbox[2] += scale * r;
  bbox[3] += scale * t;
  return scale;
}

function getPctOffsets(arg) {
  return adjustOffsetsArg(arg).map(str => {
    return str.includes('%') ? utils.parsePercent(str) : 0;
  });
}

function getPixelOffsets(arg) {
  return adjustOffsetsArg(arg).map(str => {
    return str.includes('%') ? 0 : parseSizeParam(str);
  });
}

function adjustOffsetsArg(arg) {
  if (!arg) arg = ['0'];
  if (arg.length == 1) {
    return [arg[0], arg[0], arg[0], arg[0]];
  }
  if (arg.length != 4) {
    stop('List of offsets should have 4 values');
  }
  return arg;
}

function getTargetBbox(targets) {
  var expanded = expandCommandTargets(targets);
  var bounds = expanded.reduce(function(memo, o) {
    return memo.mergeBounds(getLayerBounds(o.layer, o.dataset.arcs));
  }, new Bounds());
  return bounds.hasBounds() ? bounds.toArray() : null;
}

// Convert width and height args to aspect ratio arg for the rectangle() function
export function getAspectRatioArg(widthArg, heightArg) {
  // heightArg is a string containing either a number or a
  // comma-sep. pair of numbers (range);
  return heightArg.split(',').map(function(opt) {
    var height = Number(opt),
        width = Number(widthArg);
    if (!opt) return '';
    return width / height;
  }).reverse().join(',');
}
