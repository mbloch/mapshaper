import { restoreCapturedUnits } from '../undo/mapshaper-undo-transaction';
import { renderRasterPreview } from '../rasters/mapshaper-raster-utils';

var PAYLOAD_FIELDS = {
  table: ['records'],
  'table-records': ['records'],
  'table-fields': ['columns'],
  'table-schema': ['fields'],
  arcs: ['nn', 'xx', 'yy', 'zz', 'zlimit'],
  'arcs-simplification': ['zz'],
  layer: ['shapes', 'raster']
};

export async function storeUndoUnits(units, store, entryId, role) {
  var stored = [];
  try {
    for (var i = 0; i < units.length; i++) {
      stored.push(await storeUndoUnit(units[i], store, entryId, role));
    }
  } catch(e) {
    await store.delMany(getStoredUndoPayloadRefs(stored));
    throw e;
  }
  return stored;
}

export async function restoreStoredUndoUnits(units, store) {
  var hydrated = await hydrateStoredUndoUnits(units, store);
  restoreCapturedUnits(hydrated);
}

export async function hydrateStoredUndoUnits(units, store) {
  var hydrated = [];
  for (var i = 0; i < units.length; i++) {
    hydrated.push(await hydrateStoredUndoUnit(units[i], store));
  }
  return hydrated;
}

export function getStoredUndoPayloadRefs(units) {
  var refs = [];
  units.forEach(function(unit) {
    if (unit.payloadRef) refs.push(unit.payloadRef);
  });
  return refs;
}

export function getUndoRestoreFlags(units, baseFlags) {
  var flags = Object.assign({}, baseFlags || {}, {undo_restore: true});
  units.forEach(function(unit) {
    if (unit.type == 'changed') return;
    if (unit.type == 'arcs') {
      flags.arc_count = true;
    } else if (unit.type == 'arcs-simplification') {
      flags.simplify = true;
    } else if (unit.type == 'table' ||
        unit.type == 'table-records' ||
        unit.type == 'table-fields' ||
        unit.type == 'table-order' ||
        unit.type == 'table-schema') {
      flags.same_table = false;
    } else if (unit.type == 'catalog' || unit.type == 'dataset') {
      flags.select = true;
      flags.arc_count = true;
    } else if (unit.type == 'dataset-info') {
      flags.info = true;
    } else if (unit.type == 'layer' ||
        unit.type == 'layer-metadata' ||
        unit.type == 'layer-order') {
      flags.select = true;
    }
  });
  return flags;
}

async function storeUndoUnit(unit, store, entryId, role) {
  var payload = await getUnitPayload(unit);
  var stored = stripPayload(unit);
  if (payload) {
    stored.payloadRef = await store.put(payload, {
      entryId: entryId,
      role: role,
      unitType: unit.type
    });
  }
  return stored;
}

async function hydrateStoredUndoUnit(unit, store) {
  var hydrated = Object.assign({}, unit);
  var payload;
  if (unit.payloadRef) {
    payload = await store.get(unit.payloadRef);
    if (!payload) {
      throw new Error('Missing undo payload: ' + unit.payloadRef.key);
    }
    payload = unpackPayload(unit, payload);
    Object.assign(hydrated, payload);
  }
  delete hydrated.payloadRef;
  return hydrated;
}

async function getUnitPayload(unit) {
  var fields = PAYLOAD_FIELDS[unit.type];
  var payload, hasPayload;
  if (!fields) return null;
  payload = {};
  fields.forEach(function(field) {
    if (field in unit) {
      payload[field] = unit[field];
      hasPayload = true;
    }
  });
  if (!hasPayload) return null;
  if (unit.type == 'layer') return packLayerPayload(payload);
  return unit.type == 'table' ? packTablePayload(payload) : payload;
}

async function packLayerPayload(payload) {
  if (payload.raster) {
    payload = Object.assign({}, payload, {
      raster: packRasterUndoPayload(payload.raster)
    });
  }
  return payload;
}

async function packTablePayload(payload) {
  return {
    packedRecords: packRecordsAsColumns(payload.records)
  };
}

function unpackPayload(unit, payload) {
  if (unit.type == 'table' && payload.packedRecords) {
    return {
      records: unpackRecordsFromColumns(payload.packedRecords)
    };
  }
  if (unit.type == 'layer' && payload.raster) {
    return Object.assign({}, payload, {
      raster: unpackRasterUndoPayload(payload.raster)
    });
  }
  return payload;
}

function packRasterUndoPayload(raster) {
  var copy = Object.assign({}, raster);
  if (raster.view) {
    copy.view = Object.assign({}, raster.view);
    if (raster.view.preview) {
      copy.view.preview = stripPreviewPixels(raster.view.preview);
    }
  }
  if (raster.preview) {
    copy.preview = stripPreviewPixels(raster.preview);
  }
  return copy;
}

function unpackRasterUndoPayload(raster) {
  var copy = Object.assign({}, raster);
  if (raster.view) {
    copy.view = Object.assign({}, raster.view);
    if (raster.view.preview && !raster.view.preview.pixels && raster.grid && raster.grid.samples) {
      copy.view.preview = renderRasterPreview(raster.grid, raster.view.recipe, raster.view.preview.width, raster.view.preview.height);
    }
  }
  return copy;
}

function stripPreviewPixels(preview) {
  var copy = Object.assign({}, preview);
  delete copy.canvas;
  delete copy.pixels;
  return copy;
}

function packRecordsAsColumns(records) {
  var fields = getRecordFields(records);
  return {
    fields: fields,
    types: fields.map(function() { return null; }),
    data: fields.map(function(field) {
      return records.map(function(rec) {
        return rec ? rec[field] : undefined;
      });
    }),
    size: records.length
  };
}

function getRecordFields(records) {
  var index = {};
  records.forEach(function(rec) {
    Object.keys(rec || {}).forEach(function(field) {
      index[field] = true;
    });
  });
  return Object.keys(index);
}

function unpackRecordsFromColumns(data) {
  var records = [];
  for (var i = 0; i < data.size; i++) {
    records[i] = {};
  }
  data.fields.forEach(function(field, j) {
    var values = data.data[j];
    values.forEach(function(val, i) {
      records[i][field] = val;
    });
  });
  return records;
}

function stripPayload(unit) {
  var fields = PAYLOAD_FIELDS[unit.type];
  var stripped = Object.assign({}, unit);
  if (fields) {
    fields.forEach(function(field) {
      delete stripped[field];
    });
  }
  return stripped;
}
