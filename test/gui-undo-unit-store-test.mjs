import assert from 'assert';
import { DataTable } from '../src/datatable/mapshaper-data-table';
import { ArcCollection } from '../src/paths/mapshaper-arcs';
import { UndoTransaction } from '../src/undo/mapshaper-undo-transaction';
import {
  getStoredUndoPayloadRefs,
  getUndoRestoreFlags,
  restoreStoredUndoUnits,
  storeUndoUnits
} from '../src/gui/gui-undo-unit-store';
import {
  createMemoryUndoPayloadBackend,
  createUndoPayloadStore
} from '../src/gui/gui-undo-payload-store';

describe('gui-undo-unit-store.js', function() {
  it('stores and restores record-level payloads', async function() {
    var table = new DataTable([{foo: 'a'}, {foo: 'b'}]);
    var tx = new UndoTransaction('record');
    var store = makeStore();

    tx.run(function() {
      table.captureRecordsBefore([1], {operation: 'edit'});
      table.getRecordAt(1).foo = 'c';
      table.markRecordsChanged([1], {operation: 'edit'});
    });

    var stored = await storeUndoUnits(tx.getCapturedUnits(), store, 'entry1', 'undo');

    assert.equal(stored[0].type, 'table-records');
    assert.equal(stored[0].records, undefined);
    assert.equal(getStoredUndoPayloadRefs(stored).length, 1);

    await restoreStoredUndoUnits(stored, store);

    assert.deepEqual(table.getRecords(), [{foo: 'a'}, {foo: 'b'}]);
  });

  it('stores and restores arc typed-array payloads', async function() {
    var arcs = new ArcCollection([[[0, 0], [1, 1]]]);
    var tx = new UndoTransaction('arcs');
    var store = makeStore();

    tx.run(function() {
      arcs.transformPoints(function(x, y) {
        return [x + 1, y + 2];
      });
    });

    var stored = await storeUndoUnits(tx.getCapturedUnits(), store, 'entry1', 'undo');

    assert.equal(stored[0].type, 'arcs');
    assert.equal(stored[0].xx, undefined);
    assert.equal(getStoredUndoPayloadRefs(stored).length, 1);

    await restoreStoredUndoUnits(stored, store);

    assert.deepEqual(arcs.toArray(), [[[0, 0], [1, 1]]]);
  });

  it('stores whole-table payloads in packed table format', async function() {
    var table = new DataTable([{foo: 'a', bar: 1}, {foo: 'b', bar: 2}]);
    var tx = new UndoTransaction('table');
    var store = makeStore();
    var stored, payload;

    tx.run(function() {
      table.update(function(rec) {
        rec.foo = 'changed';
      });
    });

    stored = await storeUndoUnits(tx.getCapturedUnits(), store, 'entry1', 'undo');
    payload = await store.get(getStoredUndoPayloadRefs(stored)[0]);

    assert.equal(stored[0].type, 'table');
    assert.equal(stored[0].records, undefined);
    assert.ok(payload.packedRecords);
    assert.equal(payload.records, undefined);

    await restoreStoredUndoUnits(stored, store);

    assert.deepEqual(table.getRecords(), [{foo: 'a', bar: 1}, {foo: 'b', bar: 2}]);
  });

  it('stores record-level payloads without whole-table packing', async function() {
    var table = new DataTable([{foo: 'a'}, {foo: 'b'}]);
    var tx = new UndoTransaction('record');
    var store = makeStore();
    var stored, payload;

    tx.run(function() {
      table.captureRecordsBefore([1], {operation: 'edit'});
      table.getRecordAt(1).foo = 'c';
      table.markRecordsChanged([1], {operation: 'edit'});
    });

    stored = await storeUndoUnits(tx.getCapturedUnits(), store, 'entry1', 'undo');
    payload = await store.get(getStoredUndoPayloadRefs(stored)[0]);

    assert.ok(payload.records);
    assert.equal(payload.packedRecords, undefined);
  });

  it('derives conservative restore flags from unit types', function() {
    var flags = getUndoRestoreFlags([
      {type: 'table-records'},
      {type: 'arcs'},
      {type: 'catalog'},
      {type: 'changed'}
    ], {same_table: true});

    assert.equal(flags.undo_restore, true);
    assert.equal(flags.same_table, false);
    assert.equal(flags.arc_count, true);
    assert.equal(flags.select, true);
  });

  it('preserves unrelated command flags when deriving restore flags', function() {
    var flags = getUndoRestoreFlags([{type: 'layer-metadata'}], {foo: true});

    assert.equal(flags.foo, true);
    assert.equal(flags.undo_restore, true);
    assert.equal(flags.select, true);
  });

  it('fails clearly when a stored payload is missing', async function() {
    var table = new DataTable([{foo: 'a'}, {foo: 'b'}]);
    var tx = new UndoTransaction('missing');
    var store = makeStore();
    var stored, err;

    tx.run(function() {
      table.captureRecordsBefore([1], {operation: 'edit'});
      table.getRecordAt(1).foo = 'c';
      table.markRecordsChanged([1], {operation: 'edit'});
    });

    stored = await storeUndoUnits(tx.getCapturedUnits(), store, 'entry1', 'undo');
    await store.del(getStoredUndoPayloadRefs(stored)[0]);

    try {
      await restoreStoredUndoUnits(stored, store);
    } catch(e) {
      err = e;
    }

    assert.ok(err);
    assert.equal(/Missing undo payload/.test(err.message), true);
  });

  it('cleans already stored payloads when unit storage fails', async function() {
    var store = createUndoPayloadStore({
      backend: createMemoryUndoPayloadBackend(),
      maxPayloadBytes: 50,
      sessionId: 'undo_units',
      window: {localStorage: null}
    });
    var err;

    try {
      await storeUndoUnits([{
        type: 'table-schema',
        fields: ['foo']
      }, {
        type: 'table',
        records: [{foo: 'this payload is intentionally too large for the limit'}]
      }], store, 'entry1', 'undo');
    } catch(e) {
      err = e;
    }

    assert.ok(err);
    assert.deepEqual(store.getOwnKeys(), []);
    assert.equal(store.getStats().ownBytes, 0);
  });
});

function makeStore() {
  return createUndoPayloadStore({
    backend: createMemoryUndoPayloadBackend(),
    sessionId: 'undo_units',
    window: {localStorage: null}
  });
}
