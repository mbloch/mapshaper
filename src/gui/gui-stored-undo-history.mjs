import { createUndoPayloadStore } from './gui-undo-payload-store';
import { logStartupCleanup } from './gui-startup-cleanup-report';
import {
  getUndoRestoreFlags,
  getStoredUndoPayloadRefs,
  restoreStoredUndoUnits,
  storeUndoUnits
} from './gui-undo-unit-store';
import {
  captureCurrentUnits,
  filterUnchangedRestoreUnits
} from '../undo/mapshaper-undo-transaction';

export function createStoredUndoHistory(gui) {
  var undoEntryId = 0;

  return {
    addTransaction: addTransaction,
    getPayloadStore: getPayloadStore
  };

  async function addTransaction(tx, opts) {
    var undoUnits, redoCaptureUnits, updateFlags, store, entryId, storedUndoUnits,
        storedRedoUnits, storeStart, storeMillis = 0, evictToken = {};
    opts = opts || {};
    if (!tx || opts.error) return {skipped: true};
    undoUnits = filterUnchangedRestoreUnits(tx.getCapturedUnits());
    if (!undoUnits.some(isRestoreUnit)) return {
      skipped: true,
      unitCount: undoUnits.length,
      restoreUnitCount: 0
    };
    redoCaptureUnits = getRedoCaptureUnits(undoUnits);
    updateFlags = getUndoRestoreFlags(undoUnits, opts.flags);
    store = getPayloadStore();
    entryId = (opts.entryPrefix || 'undo') + '-' + (++undoEntryId);
    try {
      storeStart = Date.now();
      storedUndoUnits = await storeUndoUnitsWithEviction(undoUnits, store, entryId, 'undo');
      storeMillis = Date.now() - storeStart;
    } catch(e) {
      if (storedUndoUnits) {
        await store.delMany(getStoredUndoPayloadRefs(storedUndoUnits));
      }
      notifyUndoWarning(gui, 'Undo state was not saved', e);
      throw e;
    }
    gui.undo.addHistoryState(async function() {
      try {
        if (!storedRedoUnits) {
          storedRedoUnits = await captureAndStoreRedoUnits(redoCaptureUnits, store, entryId, evictToken);
        }
        await restoreStoredUndoUnits(storedUndoUnits, store);
        if (opts.onUndo) opts.onUndo();
        gui.model.updated(updateFlags);
      } catch(e) {
        notifyUndoWarning(gui, 'Undo restore failed', e);
        throw e;
      }
    }, async function() {
      try {
        if (!storedRedoUnits) {
          throw new Error('Missing redo restore data');
        }
        await restoreStoredUndoUnits(storedRedoUnits, store);
        if (opts.onRedo) opts.onRedo();
        gui.model.updated(updateFlags);
      } catch(e) {
        notifyUndoWarning(gui, 'Redo restore failed', e);
        throw e;
      }
    }, function() {
      return store.delMany(getStoredUndoPayloadRefs(storedUndoUnits)
        .concat(storedRedoUnits ? getStoredUndoPayloadRefs(storedRedoUnits) : []))
        .catch(function(e) {
          notifyUndoWarning(gui, 'Undo restore data was not deleted', e);
        });
    }, {
      maxStates: opts.maxStates,
      evictToken: evictToken,
      preserveOnModeChange: true
    });
    return {
      skipped: false,
      unitCount: undoUnits.length,
      restoreUnitCount: undoUnits.filter(isRestoreUnit).length,
      redoCaptureMillis: 0,
      storeMillis: storeMillis,
      undoMillis: storeMillis,
      payloadCount: getStoredUndoPayloadRefs(storedUndoUnits).length
    };
  }

  async function captureAndStoreRedoUnits(captureUnits, store, entryId, evictToken) {
    var redoUnits = captureCurrentUnits(captureUnits);
    return storeUndoUnitsWithEviction(redoUnits, store, entryId, 'redo', evictToken);
  }

  async function storeUndoUnitsWithEviction(units, store, entryId, role, evictToken) {
    var didEvict;
    var notified = false;
    while (true) {
      try {
        return await storeUndoUnits(units, store, entryId, role);
      } catch(e) {
        if (!isSessionLimitError(e) || !gui.undo || !gui.undo.evictOldestHistoryState) {
          throw e;
        }
        didEvict = await gui.undo.evictOldestHistoryState({exclude: evictToken});
        if (!didEvict) throw e;
        if (!notified) {
          notifyUndoHistoryEvicted(gui, store);
          notified = true;
        }
      }
    }
  }

  function getPayloadStore() {
    if (!gui.undoPayloadStore) {
      gui.undoPayloadStore = createUndoPayloadStore(getUndoPayloadStoreOptions());
      gui.undoPayloadStore.startLifecycle();
      gui.undoPayloadStore.cleanupStaleSessions().then(function(result) {
        logStartupCleanup({
          count: result.keys.length,
          sessionCount: result.sessionCount,
          singular: 'undo payload',
          plural: 'undo payloads',
          sizeBytes: result.sizeBytes
        });
      }).catch(function() {});
    }
    return gui.undoPayloadStore;
  }

  function getUndoPayloadStoreOptions() {
    return {
      maxBytes: getUndoStorageLimit('undoStorageMaxBytes', 1024 * 1024 * 1024),
      maxPayloadBytes: getUndoStorageLimit('undoPayloadMaxBytes', 512 * 1024 * 1024)
    };
  }

  function getUndoStorageLimit(name, defaultValue) {
    var opt = gui.options && gui.options[name],
        query = getQueryValue(name);
    if (query !== null && +query >= 0) return +query;
    return opt >= 0 ? opt : defaultValue;
  }
}

function getRedoCaptureUnits(units) {
  return units.map(function(unit) {
    var copy = Object.assign({}, unit);
    if (copy.type == 'table-records' && copy.records) {
      copy.records = copy.records.map(function(item) {
        return {id: item.id};
      });
    } else if (copy.type == 'table-fields' && copy.columns) {
      copy.columns = copy.columns.map(function(column) {
        return {field: column.field};
      });
    }
    delete copy.nn;
    delete copy.xx;
    delete copy.yy;
    delete copy.zz;
    delete copy.zlimit;
    delete copy.shapes;
    delete copy.raster;
    if (copy.type != 'table-records') delete copy.records;
    if (copy.type != 'table-fields') delete copy.columns;
    delete copy.fields;
    return copy;
  });
}

function isSessionLimitError(e) {
  return e && /session limit/.test(e.message || '');
}

function isRestoreUnit(unit) {
  return unit.type != 'changed';
}

function notifyUndoWarning(gui, title, err) {
  var msg = err && err.message || String(err || 'Unknown error');
  if (gui && gui.notify) {
    gui.notify({
      severity: 'warn',
      title: title,
      body: msg,
      dedupKey: 'undo:' + title + ':' + msg
    });
  } else if (typeof console != 'undefined' && console.warn) {
    console.warn(title + ': ' + msg);
  }
}

function notifyUndoHistoryEvicted(gui, store) {
  if (gui && gui.notify) {
    gui.notify({
      severity: 'warn',
      title: 'Older undo history was discarded',
      body: 'Mapshaper caps on-disk recovery data at ' + getUndoStorageLimitLabel(store) + '.',
      dedupKey: 'undo:history-evicted'
    });
  } else if (typeof console != 'undefined' && console.warn) {
    console.warn('Older undo history was discarded');
  }
}

function getUndoStorageLimitLabel(store) {
  var stats = store && store.getStats ? store.getStats() : null;
  return formatBytes(stats && stats.maxBytes || 1024 * 1024 * 1024);
}

function formatBytes(bytes) {
  var units = ['B', 'KB', 'MB', 'GB'];
  var value = bytes;
  var i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return (i === 0 ? String(value) : value.toFixed(value < 10 ? 1 : 0)) + ' ' + units[i];
}

function getQueryValue(key) {
  var rxp, match;
  if (typeof window == 'undefined' || !window.location) return null;
  rxp = new RegExp('[?&]' + key + '=([^&]+)');
  match = rxp.exec(window.location.search);
  return match ? decodeURIComponent(match[1]) : null;
}
