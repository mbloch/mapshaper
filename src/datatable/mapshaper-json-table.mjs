import { getFormattedStringify, stringifyAsNDJSON } from '../geojson/mapshaper-stringify';
import { fixInconsistentFields } from '../datatable/mapshaper-data-utils';
import { DataTable } from '../datatable/mapshaper-data-table';

export function importJSONTable(arr) {
  fixInconsistentFields(arr);
  return {
    layers: [{
      data: new DataTable(arr)
    }],
    info: {}
  };
}

export function exportJSON(dataset, opts) {
  return dataset.layers.reduce(function(arr, lyr) {
    if (lyr.data){
      arr.push({
        content: exportJSONTable(lyr, opts),
        filename: (lyr.name || 'output') + '.json'
      });
    }
    return arr;
  }, []);
}

export function exportJSONTable(lyr, opts) {
  opts = opts || {};
  var records = lyr.data.getRecords();
  if (opts.ndjson) {
    return records.map(stringifyAsNDJSON).join('\n');
  }
  if (opts.prettify) {
    return getFormattedStringify([])(records);
  }
  return JSON.stringify(records);
}
