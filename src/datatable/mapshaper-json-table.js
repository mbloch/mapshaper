import { getFormattedStringify } from '../geojson/mapshaper-stringify';
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
  var stringify = opts && opts.prettify ? getFormattedStringify([]) : JSON.stringify;
  return stringify(lyr.data.getRecords());
}
