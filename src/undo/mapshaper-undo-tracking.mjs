// Lightweight hooks that make in-place mutations observable to GUI undo.
// Normal CLI runs leave activeTransaction unset, so capture hooks are no-ops.

var activeTransaction = null;
var nextUndoId = 1;
var objectMetadata = new WeakMap();

export function getActiveUndoTransaction() {
  return activeTransaction;
}

export function setActiveUndoTransaction(tx) {
  activeTransaction = tx || null;
}

export function clearActiveUndoTransaction(tx) {
  if (!tx || activeTransaction == tx) {
    activeTransaction = null;
  }
}

export function withActiveUndoTransaction(tx, cb) {
  var prev = activeTransaction;
  activeTransaction = tx || null;
  try {
    return cb();
  } finally {
    activeTransaction = prev;
  }
}

export function getUndoMetadata(obj) {
  var meta = objectMetadata.get(obj);
  if (!meta) {
    meta = {
      id: 'u' + nextUndoId++,
      revision: 0
    };
    objectMetadata.set(obj, meta);
  }
  return meta;
}

export function getUndoId(obj) {
  return getUndoMetadata(obj).id;
}

export function getUndoRevision(obj) {
  return getUndoMetadata(obj).revision;
}

export function markChanged(obj, detail) {
  var tx = activeTransaction;
  var meta = objectMetadata.get(obj);
  if (!tx && !meta) return 0;
  if (!meta) meta = getUndoMetadata(obj);
  meta.revision++;
  notifyTransaction(tx, 'markChanged', obj, detail);
  return meta.revision;
}

export function noteTableWillChange(table, detail) {
  notifyTransaction(activeTransaction, 'captureTableBefore', table, detail || {});
}

export function noteTableRecordsWillChange(table, ids, detail) {
  notifyTransaction(activeTransaction, 'captureTableRecordsBefore', table, Object.assign({
    ids: normalizeIds(ids)
  }, detail || {}));
}

export function noteTableFieldsWillChange(table, fields, detail) {
  notifyTransaction(activeTransaction, 'captureTableFieldsBefore', table, Object.assign({
    fields: normalizeStrings(fields)
  }, detail || {}));
}

export function noteTableOrderWillChange(table, ids, detail) {
  notifyTransaction(activeTransaction, 'captureTableOrderBefore', table, Object.assign({
    ids: normalizeIds(ids)
  }, detail || {}));
}

export function noteTableSchemaWillChange(table, detail) {
  notifyTransaction(activeTransaction, 'captureTableSchemaBefore', table, detail || {});
}

export function markTableChanged(table, detail) {
  return markChanged(table, Object.assign({type: 'table'}, detail || {}));
}

export function markTableRecordsChanged(table, ids, detail) {
  return markTableChanged(table, Object.assign({
    granularity: 'records',
    ids: normalizeIds(ids)
  }, detail || {}));
}

export function markTableFieldsChanged(table, fields, detail) {
  return markTableChanged(table, Object.assign({
    granularity: 'fields',
    fields: normalizeStrings(fields)
  }, detail || {}));
}

export function markTableSchemaChanged(table, detail) {
  return markTableChanged(table, Object.assign({
    granularity: 'schema'
  }, detail || {}));
}

export function markTableOrderChanged(table, ids, detail) {
  return markTableChanged(table, Object.assign({
    granularity: 'order',
    ids: normalizeIds(ids)
  }, detail || {}));
}

export function noteArcsWillChange(arcs, detail) {
  notifyTransaction(activeTransaction, 'captureArcsBefore', arcs, detail || {});
}

export function noteArcsSimplificationWillChange(arcs, detail) {
  notifyTransaction(activeTransaction, 'captureArcsSimplificationBefore', arcs, detail || {});
}

export function markArcsChanged(arcs, detail) {
  return markChanged(arcs, Object.assign({type: 'arcs'}, detail || {}));
}

export function markArcsSimplificationChanged(arcs, detail) {
  return markArcsChanged(arcs, Object.assign({granularity: 'simplification'}, detail || {}));
}

export function noteCatalogWillChange(catalog, detail) {
  notifyTransaction(activeTransaction, 'captureCatalogBefore', catalog, detail || {});
}

export function markCatalogChanged(catalog, detail) {
  return markChanged(catalog, Object.assign({type: 'catalog'}, detail || {}));
}

export function noteDatasetWillChange(dataset, detail) {
  notifyTransaction(activeTransaction, 'captureDatasetBefore', dataset, detail || {});
}

export function noteDatasetInfoWillChange(dataset, detail) {
  notifyTransaction(activeTransaction, 'captureDatasetInfoBefore', dataset, detail || {});
}

export function markDatasetChanged(dataset, detail) {
  return markChanged(dataset, Object.assign({type: 'dataset'}, detail || {}));
}

export function markDatasetInfoChanged(dataset, detail) {
  return markDatasetChanged(dataset, Object.assign({granularity: 'info'}, detail || {}));
}

export function noteLayerWillChange(layer, detail) {
  notifyTransaction(activeTransaction, 'captureLayerBefore', layer, detail || {});
}

export function noteLayerMetadataWillChange(layer, detail) {
  notifyTransaction(activeTransaction, 'captureLayerMetadataBefore', layer, detail || {});
}

export function noteLayerOrderWillChange(layer, ids, detail) {
  notifyTransaction(activeTransaction, 'captureLayerOrderBefore', layer, Object.assign({
    ids: normalizeIds(ids)
  }, detail || {}));
}

export function markLayerChanged(layer, detail) {
  return markChanged(layer, Object.assign({type: 'layer'}, detail || {}));
}

export function markLayerMetadataChanged(layer, detail) {
  return markLayerChanged(layer, Object.assign({granularity: 'metadata'}, detail || {}));
}

export function markLayerOrderChanged(layer, ids, detail) {
  return markLayerChanged(layer, Object.assign({
    granularity: 'order',
    ids: normalizeIds(ids)
  }, detail || {}));
}

function notifyTransaction(tx, method, obj, detail) {
  if (tx && typeof tx[method] == 'function') {
    tx[method](obj, detail || {});
  }
}

function normalizeIds(ids) {
  if (ids == null) return [];
  return Array.isArray(ids) ? ids.slice() : [ids];
}

function normalizeStrings(arr) {
  if (arr == null) return [];
  return Array.isArray(arr) ? arr.slice() : [arr];
}
