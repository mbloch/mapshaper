import { couldBeDsvFile } from '../io/mapshaper-file-types';
import { datasetHasGeometry } from '../dataset/mapshaper-dataset-utils';
import { getFileExtension, replaceFileExtension } from '../utils/mapshaper-filename-utils';
import { PACKAGE_EXT } from '../pack/mapshaper-pack';

export function getOutputFormat(dataset, opts) {
  var outFile = opts.file || null,
      inFmt = dataset.info && dataset.info.input_formats && dataset.info.input_formats[0],
      outFmt = null;

  // if user has specified a format, use that
  if (opts.format) {
    return opts.format;
  }

  // if an output filename is given, try to infer format from filename etc.
  if (outFile) {
    outFmt = inferOutputFormat(outFile, inFmt);
  } else if (inFmt) {
    outFmt = inFmt;
  }

  if (outFmt == 'json' && datasetHasGeometry(dataset)) {
    // special case: inferred output format is a json table (either because
    // the output file has a .json extension or because the input file was a
    // json table), but the output dataset contains shapes
    outFmt = 'geojson';
  }

  return outFmt || null;
}

// Infer output format by considering file name and (optional) input format
export function inferOutputFormat(file, inputFormat) {
  var ext = getFileExtension(file).toLowerCase(),
      format = null;
  if (ext == 'gz') {
    return inferOutputFormat(replaceFileExtension(file, ''), inputFormat);
  } else if (ext == PACKAGE_EXT) {
    format = PACKAGE_EXT;
  } else if (ext == 'shp') {
    format = 'shapefile';
  } else if (ext == 'dbf') {
    format = 'dbf';
  } else if (ext == 'svg') {
    format = 'svg';
  } else if (ext == 'kml' || ext == 'kmz') {
    format = 'kml';
  } else if (/json$/.test(ext)) {
    format = 'geojson';
    if (ext == 'topojson' || inputFormat == 'topojson' && ext != 'geojson') {
      format = 'topojson';
    } else if (ext == 'json' && inputFormat == 'json') {
      // .json -> json table is not always the best inference...
      // additional logic should be applied downstream
      format = 'json'; // JSON table
    }
  } else if (couldBeDsvFile(file)) {
    format = 'dsv';
  } else if (inputFormat) {
    format = inputFormat;
  }
  return format;
}
