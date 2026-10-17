import { copyRecord } from '../datatable/mapshaper-data-utils';
import { cloneShapes } from '../paths/mapshaper-shape-utils';
import { copyRasterData } from '../rasters/mapshaper-raster-utils';
import {
  getUndoId,
  getUndoRevision,
  withActiveUndoTransaction
} from './mapshaper-undo-tracking';

export function UndoTransaction(label) {
  this.label = label || '';
  this.units = [];
  this._captured = {};
}

UndoTransaction.prototype = {
  run: function(cb) {
    return withActiveUndoTransaction(this, cb);
  },

  getCapturedUnits: function() {
    return this.units.slice();
  },

  restore: function() {
    restoreCapturedUnits(this.units);
  },

  captureCurrentState: function() {
    return captureCurrentUnits(this.units);
  },

  captureTableBefore: function(table, detail) {
    var key = unitKey('table', table);
    if (this._captured[key]) return;
    this._captured[key] = true;
    this.units.push({
      type: 'table',
      target: table,
      id: getUndoId(table),
      revision: getUndoRevision(table),
      detail: copyDetail(detail),
      records: table.getRecords().map(copyRecord)
    });
  },

  captureTableRecordsBefore: function(table, detail) {
    var ids = uniqueNumbers(detail.ids);
    var captured = [];
    var records = table.getRecords();
    ids.forEach(function(id) {
      var key = unitKey('table-record', table, id);
      if (this._captured[key]) return;
      this._captured[key] = true;
      captured.push({
        id: id,
        record: copyRecord(records[id])
      });
    }, this);
    if (captured.length > 0) {
      this.units.push({
        type: 'table-records',
        target: table,
        id: getUndoId(table),
        revision: getUndoRevision(table),
        detail: copyDetail(detail),
        records: captured
      });
    }
  },

  captureTableFieldsBefore: function(table, detail) {
    var fields = uniqueStrings(detail.fields);
    var records = table.getRecords();
    var columns = [];
    fields.forEach(function(field) {
      var key = unitKey('table-field', table, field);
      if (this._captured[key]) return;
      this._captured[key] = true;
      columns.push({
        field: field,
        values: records.map(function(rec) {
          return rec ? rec[field] : undefined;
        })
      });
    }, this);
    if (columns.length > 0) {
      this.units.push({
        type: 'table-fields',
        target: table,
        id: getUndoId(table),
        revision: getUndoRevision(table),
        detail: copyDetail(detail),
        columns: columns
      });
    }
  },

  captureTableOrderBefore: function(table, detail) {
    captureOrderUnit(this, 'table-order', table, detail);
  },

  captureTableSchemaBefore: function(table, detail) {
    var key = unitKey('table-schema', table);
    if (this._captured[key]) return;
    this._captured[key] = true;
    this.units.push({
      type: 'table-schema',
      target: table,
      id: getUndoId(table),
      revision: getUndoRevision(table),
      detail: copyDetail(detail),
      fields: table.getFields()
    });
    if (detail && (detail.field || detail.fields)) {
      this.captureTableFieldsBefore(table, {
        fields: detail.fields || [detail.field],
        operation: detail.operation
      });
    }
  },

  captureArcsBefore: function(arcs, detail) {
    var data, key;
    promoteArcsAppendUnit(this, arcs);
    key = unitKey('arcs', arcs);
    if (this._captured[key]) return;
    this._captured[key] = true;
    data = arcs.getVertexData();
    this.units.push({
      type: 'arcs',
      target: arcs,
      id: getUndoId(arcs),
      revision: getUndoRevision(arcs),
      detail: copyDetail(detail),
      nn: new Uint32Array(data.nn),
      xx: new Float64Array(data.xx),
      yy: new Float64Array(data.yy),
      zz: data.zz ? new Float64Array(data.zz) : null,
      zlimit: arcs.getRetainedInterval()
    });
  },

  // Arcs that are only appended to are restored by truncating them, so the
  // unit records just the arc count, not a copy of the arcs. If the arcs are
  // changed in any other way in the same transaction, the unit is replaced by
  // a full 'arcs' unit (see promoteArcsAppendUnit()).
  captureArcsAppendBefore: function(arcs, detail) {
    var key;
    if (this._captured[unitKey('arcs', arcs)]) return;
    key = unitKey('arcs-append', arcs);
    if (this._captured[key]) return;
    this._captured[key] = true;
    this.units.push({
      type: 'arcs-append',
      target: arcs,
      id: getUndoId(arcs),
      revision: getUndoRevision(arcs),
      detail: copyDetail(detail),
      arcCount: arcs.size()
    });
  },

  captureArcsSimplificationBefore: function(arcs, detail) {
    var data, key;
    promoteArcsAppendUnit(this, arcs);
    key = unitKey('arcs-simplification', arcs);
    if (this._captured[key]) return;
    this._captured[key] = true;
    data = arcs.getVertexData();
    this.units.push({
      type: 'arcs-simplification',
      target: arcs,
      id: getUndoId(arcs),
      revision: getUndoRevision(arcs),
      detail: copyDetail(detail),
      zz: data.zz ? new Float64Array(data.zz) : null,
      zlimit: arcs.getRetainedInterval()
    });
  },

  captureCatalogBefore: function(catalog, detail) {
    var key = unitKey('catalog', catalog);
    if (this._captured[key]) return;
    this._captured[key] = true;
    this.units.push({
      type: 'catalog',
      target: catalog,
      id: getUndoId(catalog),
      revision: getUndoRevision(catalog),
      detail: copyDetail(detail),
      datasets: catalog.getDatasets().slice(),
      targets: catalog.getDefaultTargets().map(function(target) {
        return {
          dataset: target.dataset,
          layers: target.layers.slice()
        };
      })
    });
  },

  captureDatasetBefore: function(dataset, detail) {
    var key = unitKey('dataset', dataset, detail && detail.unit || '');
    if (this._captured[key]) return;
    this._captured[key] = true;
    this.units.push({
      type: 'dataset',
      target: dataset,
      id: getUndoId(dataset),
      revision: getUndoRevision(dataset),
      detail: copyDetail(detail),
      layers: dataset.layers ? dataset.layers.slice() : null,
      arcs: dataset.arcs || null,
      info: dataset.info ? copyRecord(dataset.info) : null
    });
  },

  captureDatasetInfoBefore: function(dataset, detail) {
    var key = unitKey('dataset-info', dataset);
    if (this._captured[key]) return;
    this._captured[key] = true;
    this.units.push({
      type: 'dataset-info',
      target: dataset,
      id: getUndoId(dataset),
      revision: getUndoRevision(dataset),
      detail: copyDetail(detail),
      info: dataset.info ? copyRecord(dataset.info) : null
    });
  },

  captureLayerBefore: function(layer, detail) {
    var key = unitKey('layer', layer, detail && detail.unit || '');
    if (this._captured[key]) return;
    this._captured[key] = true;
    this.units.push({
      type: 'layer',
      target: layer,
      id: getUndoId(layer),
      revision: getUndoRevision(layer),
      detail: copyDetail(detail),
      name: layer.name,
      geometry_type: layer.geometry_type,
      raster_type: layer.raster_type || null,
      raster: layer.raster ? copyRasterData(layer.raster) : null,
      shapes: layer.shapes ? cloneShapes(layer.shapes) : null,
      data: layer.data || null
    });
  },

  captureLayerMetadataBefore: function(layer, detail) {
    var key = unitKey('layer-metadata', layer, detail && detail.unit || '');
    if (this._captured[key]) return;
    this._captured[key] = true;
    this.units.push(Object.assign({
      type: 'layer-metadata',
      target: layer,
      id: getUndoId(layer),
      revision: getUndoRevision(layer),
      detail: copyDetail(detail)
    }, copyLayerMetadata(layer)));
  },

  captureLayerOrderBefore: function(layer, detail) {
    captureOrderUnit(this, 'layer-order', layer, detail);
  },

  markChanged: function(obj, detail) {
    this.units.push({
      type: 'changed',
      id: getUndoId(obj),
      revision: getUndoRevision(obj),
      detail: copyDetail(detail)
    });
  }
};

export function restoreCapturedUnits(units) {
  for (var i = units.length - 1; i >= 0; i--) {
    restoreUnit(units[i]);
  }
}

export function captureCurrentUnits(units) {
  var captured = [];
  units.forEach(function(unit) {
    var current = captureCurrentUnit(unit);
    if (current) captured.push(current);
  });
  return captured;
}

export function filterUnchangedRestoreUnits(units) {
  var arcChanges = getArcsUnitChangeIndex(units);
  var normalized = units.map(function(unit) {
    return normalizeUnchangedDatasetArcs(unit, arcChanges);
  });
  var protectedArcs = getDatasetRestoreArcsIndex(normalized);
  var protectedSimplification = getArcsRestoreIndex(normalized);
  return normalized.filter(function(unit) {
    return unit.type == 'changed' ||
      restoreUnitHasChanged(unit, protectedArcs, protectedSimplification);
  });
}

function normalizeUnchangedDatasetArcs(unit, arcChanges) {
  var arcsId = unit.arcs && getUndoId(unit.arcs);
  if (unit.type == 'dataset' &&
      unit.arcs &&
      unit.target.arcs &&
      unit.arcs !== unit.target.arcs &&
      arcChanges[arcsId] === false &&
      arcCollectionsAreEqual(unit.arcs, unit.target.arcs)) {
    return Object.assign({}, unit, {arcs: unit.target.arcs});
  }
  return unit;
}

function restoreUnitHasChanged(unit, protectedArcs, protectedSimplification) {
  if (unit.type == 'arcs') {
    if (protectedArcs[getUndoId(unit.target)]) return true;
    return arcsUnitHasChanged(unit);
  } else if (unit.type == 'arcs-simplification') {
    if (protectedSimplification[getUndoId(unit.target)]) return true;
    return arcsSimplificationUnitHasChanged(unit);
  }
  return true;
}

function getArcsUnitChangeIndex(units) {
  var index = {};
  units.forEach(function(unit) {
    if (unit.type == 'arcs') {
      index[getUndoId(unit.target)] = arcsUnitHasChanged(unit);
    }
  });
  return index;
}

function getDatasetRestoreArcsIndex(units) {
  var index = {};
  units.forEach(function(unit) {
    if (unit.type == 'dataset' && unit.arcs && unit.target.arcs !== unit.arcs) {
      index[getUndoId(unit.arcs)] = true;
    }
  });
  return index;
}

function getArcsRestoreIndex(units) {
  var index = {};
  units.forEach(function(unit) {
    if (unit.type == 'arcs') {
      index[getUndoId(unit.target)] = true;
    }
  });
  return index;
}

function arcCollectionsAreEqual(a, b) {
  var dataA, dataB;
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  dataA = a.getVertexData();
  dataB = b.getVertexData();
  return a.getRetainedInterval() == b.getRetainedInterval() &&
    arrayLikeDataIsEqual(dataA.nn, dataB.nn) &&
    arrayLikeDataIsEqual(dataA.xx, dataB.xx) &&
    arrayLikeDataIsEqual(dataA.yy, dataB.yy) &&
    arrayLikeDataIsEqual(dataA.zz, dataB.zz);
}

function arcsUnitHasChanged(unit) {
  var data = unit.target.getVertexData();
  return unit.zlimit != unit.target.getRetainedInterval() ||
    !arrayLikeDataIsEqual(unit.nn, data.nn) ||
    !arrayLikeDataIsEqual(unit.xx, data.xx) ||
    !arrayLikeDataIsEqual(unit.yy, data.yy) ||
    !arrayLikeDataIsEqual(unit.zz, data.zz);
}

function arcsSimplificationUnitHasChanged(unit) {
  var data = unit.target.getVertexData();
  return unit.zlimit != unit.target.getRetainedInterval() ||
    !arrayLikeDataIsEqual(unit.zz, data.zz);
}

function arrayLikeDataIsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function captureCurrentUnit(unit) {
  if (unit.type == 'changed') return null;
  if (unit.type == 'table') {
    return captureCurrentTable(unit);
  } else if (unit.type == 'table-records') {
    return captureCurrentTableRecords(unit);
  } else if (unit.type == 'table-fields') {
    return captureCurrentTableFields(unit);
  } else if (unit.type == 'table-order') {
    return captureCurrentOrder(unit);
  } else if (unit.type == 'table-schema') {
    return captureCurrentTableSchema(unit);
  } else if (unit.type == 'arcs') {
    return captureCurrentArcs(unit);
  } else if (unit.type == 'arcs-simplification') {
    return captureCurrentArcsSimplification(unit);
  } else if (unit.type == 'arcs-append') {
    return captureCurrentArcsAppend(unit);
  } else if (unit.type == 'catalog') {
    return captureCurrentCatalog(unit);
  } else if (unit.type == 'dataset') {
    return captureCurrentDataset(unit);
  } else if (unit.type == 'dataset-info') {
    return captureCurrentDatasetInfo(unit);
  } else if (unit.type == 'layer') {
    return captureCurrentLayer(unit);
  } else if (unit.type == 'layer-metadata') {
    return captureCurrentLayerMetadata(unit);
  } else if (unit.type == 'layer-order') {
    return captureCurrentOrder(unit);
  }
  return null;
}

function captureCurrentTable(unit) {
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    records: unit.target.getRecords().map(copyRecord)
  });
}

function captureCurrentTableRecords(unit) {
  var records = unit.target.getRecords();
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    records: unit.records.map(function(item) {
      return {
        id: item.id,
        record: copyRecord(records[item.id])
      };
    })
  });
}

function captureCurrentTableFields(unit) {
  var records = unit.target.getRecords();
  var fields = unit.detail && unit.detail.schema_transform ?
    unit.target.getFields() :
    unit.columns.map(function(column) { return column.field; });
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    columns: fields.map(function(field) {
      return {
        field: field,
        values: records.map(function(rec) {
          return rec ? rec[field] : undefined;
        })
      };
    })
  });
}

function captureCurrentOrder(unit) {
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    ids: invertIds(unit.ids)
  });
}

function captureCurrentTableSchema(unit) {
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    fields: unit.target.getFields()
  });
}

function captureCurrentArcs(unit) {
  var data = unit.target.getVertexData();
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    nn: new Uint32Array(data.nn),
    xx: new Float64Array(data.xx),
    yy: new Float64Array(data.yy),
    zz: data.zz ? new Float64Array(data.zz) : null,
    zlimit: unit.target.getRetainedInterval()
  });
}

function captureCurrentArcsSimplification(unit) {
  var data = unit.target.getVertexData();
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    zz: data.zz ? new Float64Array(data.zz) : null,
    zlimit: unit.target.getRetainedInterval()
  });
}

// The arcs appended since the unit was captured, for redo
function captureCurrentArcsAppend(unit) {
  var data = unit.target.getVertexData();
  var pointCount = getArcsPointOffset(data, unit.arcCount);
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    nn: new Uint32Array(data.nn.subarray(unit.arcCount)),
    xx: data.xx.slice(pointCount),
    yy: data.yy.slice(pointCount)
  });
}

// Index of the first vertex of arc @arcCount (the vertex count of the arcs
// before it)
function getArcsPointOffset(data, arcCount) {
  if (arcCount > data.nn.length) {
    throw new Error('Undo error: arcs were removed after being appended to');
  }
  return arcCount < data.nn.length ? data.ii[arcCount] : data.xx.length;
}

// Replaces the transaction's 'arcs-append' unit for @arcs, if it has one,
// with an 'arcs' unit holding the arcs as they were before the transaction:
// the arcs that the appends left in place.
function promoteArcsAppendUnit(tx, arcs) {
  var key = unitKey('arcs-append', arcs);
  var i, unit, data, pointCount;
  if (!tx._captured[key]) return;
  delete tx._captured[key];
  i = tx.units.findIndex(function(u) {
    return u.type == 'arcs-append' && u.target === arcs;
  });
  unit = tx.units[i];
  data = arcs.getVertexData();
  pointCount = getArcsPointOffset(data, unit.arcCount);
  tx.units[i] = {
    type: 'arcs',
    target: arcs,
    id: unit.id,
    revision: unit.revision,
    detail: unit.detail,
    nn: new Uint32Array(data.nn.subarray(0, unit.arcCount)),
    xx: new Float64Array(data.xx.subarray(0, pointCount)),
    yy: new Float64Array(data.yy.subarray(0, pointCount)),
    zz: data.zz ? new Float64Array(data.zz.subarray(0, pointCount)) : null,
    zlimit: arcs.getRetainedInterval()
  };
  tx._captured[unitKey('arcs', arcs)] = true;
}

function captureCurrentCatalog(unit) {
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    datasets: unit.target.getDatasets().slice(),
    targets: unit.target.getDefaultTargets().map(function(target) {
      return {
        dataset: target.dataset,
        layers: target.layers.slice()
      };
    })
  });
}

function captureCurrentDataset(unit) {
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    layers: unit.target.layers ? unit.target.layers.slice() : null,
    arcs: unit.target.arcs || null,
    info: unit.target.info ? copyRecord(unit.target.info) : null
  });
}

function captureCurrentDatasetInfo(unit) {
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    info: unit.target.info ? copyRecord(unit.target.info) : null
  });
}

function captureCurrentLayer(unit) {
  return Object.assign({}, unit, {
    revision: getUndoRevision(unit.target),
    name: unit.target.name,
    geometry_type: unit.target.geometry_type,
    raster_type: unit.target.raster_type || null,
    raster: unit.target.raster ? copyRasterData(unit.target.raster) : null,
    shapes: unit.target.shapes ? cloneShapes(unit.target.shapes) : null,
    data: unit.target.data || null
  });
}

function captureCurrentLayerMetadata(unit) {
  var copy = Object.assign({}, unit, {revision: getUndoRevision(unit.target)});
  LAYER_METADATA_FIELDS.forEach(function(key) { delete copy[key]; });
  return Object.assign(copy, copyLayerMetadata(unit.target));
}

// Layer properties that are not layer content: the name, and the layer's
// place in the stack and visibility, which -frame changes
var LAYER_METADATA_FIELDS = ['name', 'geometry_type', 'menu_order', 'pinned', 'frame_hidden'];

function copyLayerMetadata(layer) {
  return LAYER_METADATA_FIELDS.reduce(function(memo, key) {
    if (key in layer) memo[key] = layer[key];
    return memo;
  }, {});
}

function restoreUnit(unit) {
  if (unit.type == 'changed') return;
  if (unit.type == 'table') {
    restoreTable(unit);
  } else if (unit.type == 'table-records') {
    restoreTableRecords(unit);
  } else if (unit.type == 'table-fields') {
    restoreTableFields(unit);
  } else if (unit.type == 'table-order') {
    restoreTableOrder(unit);
  } else if (unit.type == 'table-schema') {
    restoreTableSchema(unit);
  } else if (unit.type == 'arcs') {
    restoreArcs(unit);
  } else if (unit.type == 'arcs-simplification') {
    restoreArcsSimplification(unit);
  } else if (unit.type == 'arcs-append') {
    restoreArcsAppend(unit);
  } else if (unit.type == 'catalog') {
    restoreCatalog(unit);
  } else if (unit.type == 'dataset') {
    restoreDataset(unit);
  } else if (unit.type == 'dataset-info') {
    restoreDatasetInfo(unit);
  } else if (unit.type == 'layer') {
    restoreLayer(unit);
  } else if (unit.type == 'layer-metadata') {
    restoreLayerMetadata(unit);
  } else if (unit.type == 'layer-order') {
    restoreLayerOrder(unit);
  }
}

function restoreTable(unit) {
  var records = unit.target.getRecords();
  records.splice(0, records.length);
  unit.records.forEach(function(rec) {
    records.push(copyRecord(rec));
  });
}

function restoreTableRecords(unit) {
  var records = unit.target.getRecords();
  unit.records.forEach(function(item) {
    records[item.id] = copyRecord(item.record);
  });
}

function restoreTableFields(unit) {
  var records = unit.target.getRecords();
  unit.columns.forEach(function(column) {
    column.values.forEach(function(val, i) {
      if (!records[i]) records[i] = {};
      records[i][column.field] = val;
    });
  });
}

function restoreTableOrder(unit) {
  reorderArray(unit.target.getRecords(), unit.ids);
}

function restoreTableSchema(unit) {
  var records = unit.target.getRecords();
  records.forEach(function(rec, i) {
    var reordered = {};
    unit.fields.forEach(function(field) {
      reordered[field] = rec ? rec[field] : undefined;
    });
    records[i] = reordered;
  });
}

function restoreArcs(unit) {
  unit.target.updateVertexData(
    new Uint32Array(unit.nn),
    new Float64Array(unit.xx),
    new Float64Array(unit.yy),
    unit.zz ? new Float64Array(unit.zz) : null
  );
  unit.target.setRetainedInterval(unit.zlimit);
}

function restoreArcsSimplification(unit) {
  unit.target.setThresholds(unit.zz ? new Float64Array(unit.zz) : null);
  unit.target.setRetainedInterval(unit.zlimit);
}

// Undo truncates the arcs; redo (a unit from captureCurrentArcsAppend())
// then appends the arcs it holds.
function restoreArcsAppend(unit) {
  if (unit.target.size() < unit.arcCount) {
    throw new Error('Undo error: arcs were removed after being appended to');
  }
  unit.target.truncateArcs(unit.arcCount);
  if (unit.nn && unit.nn.length > 0) {
    unit.target.appendArcs(unit.nn, unit.xx, unit.yy);
  }
}

function restoreCatalog(unit) {
  var datasets = unit.target.getDatasets();
  datasets.splice(0, datasets.length);
  unit.datasets.forEach(function(dataset) {
    datasets.push(dataset);
  });
  unit.target.setDefaultTargets(unit.targets.map(function(target) {
    return {
      dataset: target.dataset,
      layers: target.layers.slice()
    };
  }));
}

function restoreDataset(unit) {
  unit.target.layers = unit.layers ? unit.layers.slice() : null;
  unit.target.arcs = unit.arcs;
  unit.target.info = unit.info ? copyRecord(unit.info) : null;
}

function restoreDatasetInfo(unit) {
  unit.target.info = unit.info ? copyRecord(unit.info) : null;
}

function restoreLayer(unit) {
  unit.target.name = unit.name;
  unit.target.geometry_type = unit.geometry_type;
  unit.target.raster_type = unit.raster_type || null;
  unit.target.raster = unit.raster ? copyRasterData(unit.raster) : null;
  unit.target.shapes = unit.shapes ? cloneShapes(unit.shapes) : null;
  unit.target.data = unit.data;
}

function restoreLayerMetadata(unit) {
  LAYER_METADATA_FIELDS.forEach(function(key) {
    if (key in unit) {
      unit.target[key] = unit[key];
    } else {
      delete unit.target[key];
    }
  });
}

function restoreLayerOrder(unit) {
  reorderArray(unit.target.shapes, unit.ids);
}

function unitKey(type, obj, extra) {
  return type + ':' + getUndoId(obj) + (extra == null ? '' : ':' + extra);
}

function captureOrderUnit(tx, type, target, detail) {
  var unit = findOrderUnit(tx.units, type, target);
  var ids = uniquePermutation(detail.ids);
  if (unit) {
    unit.ids = composeIds(ids, unit.ids);
    unit.detail = copyDetail(detail);
    return;
  }
  tx.units.push({
    type: type,
    target: target,
    id: getUndoId(target),
    revision: getUndoRevision(target),
    detail: copyDetail(detail),
    ids: ids
  });
}

function findOrderUnit(units, type, target) {
  for (var i = units.length - 1; i >= 0; i--) {
    if (units[i].type == type && units[i].target == target) {
      return units[i];
    }
  }
  return null;
}

function reorderArray(arr, ids) {
  var copy = ids.map(function(id) {
    return arr[id];
  });
  arr.splice.apply(arr, [0, arr.length].concat(copy));
}

function composeIds(a, b) {
  return b.map(function(id) {
    return a[id];
  });
}

function invertIds(ids) {
  var inverse = [];
  ids.forEach(function(id, i) {
    inverse[id] = i;
  });
  return inverse;
}

function uniquePermutation(ids) {
  var index = {};
  ids = ids || [];
  ids.forEach(function(id) {
    if (id < 0 || id >= ids.length || index[id]) {
      throw new Error('Invalid undo order permutation');
    }
    index[id] = true;
  });
  return ids.slice();
}

function copyDetail(detail) {
  return Object.assign({}, detail || {});
}

function uniqueNumbers(ids) {
  var index = {};
  ids = ids || [];
  ids.forEach(function(id) {
    if (id >= 0) index[id] = true;
  });
  return Object.keys(index).map(Number);
}

function uniqueStrings(fields) {
  var index = {};
  fields = fields || [];
  fields.forEach(function(field) {
    index[field] = true;
  });
  return Object.keys(index);
}
