import assert from 'assert';
import {
  createMemoryUndoPayloadBackend,
  createUndoPayloadStore
} from '../src/gui/gui-undo-payload-store';

describe('gui-undo-payload-store.js', function() {
  it('stores and deletes undo payloads', async function() {
    var backend = createMemoryUndoPayloadBackend();
    var store = createUndoPayloadStore({
      backend: backend,
      sessionId: 'undo_a',
      window: makeWindow()
    });
    var ref = await store.put({foo: 'bar'}, {entryId: 'entry1', unitType: 'table'});

    assert.equal(ref.key, 'msu:undo_a:1');
    assert.equal(ref.sessionId, 'undo_a');
    assert.equal(ref.entryId, 'entry1');
    assert.deepEqual(await store.get(ref), {foo: 'bar'});
    assert.deepEqual(store.getOwnKeys(), ['msu:undo_a:1']);
    assert.deepEqual(store.getOwnPayloads()[0].unitType, 'table');
    assert.equal(store.getStats().ownPayloadCount, 1);
    assert.equal(store.getStats().ownBytes, ref.size);

    await store.del(ref);

    assert.equal(await store.get(ref), undefined);
    assert.deepEqual(store.getOwnKeys(), []);
    assert.equal(store.getStats().ownBytes, 0);
  });

  it('cleans payloads from stale sessions', async function() {
    var backend = createMemoryUndoPayloadBackend();
    var win = makeWindow();
    var staleStore = createUndoPayloadStore({
      backend: backend,
      sessionId: 'undo_old',
      window: win
    });
    var liveStore, removed;

    await staleStore.put({old: true});
    win.localStorage.setItem('mapshaper_undo_sessions', JSON.stringify({
      undo_old: Date.now() - 1000
    }));
    liveStore = createUndoPayloadStore({
      backend: backend,
      sessionId: 'undo_new',
      staleThreshold: 10,
      window: win
    });

    removed = await liveStore.cleanupStaleSessions();

    assert.deepEqual(removed, ['msu:undo_old:1']);
    assert.equal(await backend.get('msu:undo_old:1'), undefined);
  });

  it('clears owned payloads and session heartbeat', async function() {
    var backend = createMemoryUndoPayloadBackend();
    var win = makeWindow();
    var store = createUndoPayloadStore({
      backend: backend,
      sessionId: 'undo_clear',
      window: win
    });
    var ref = await store.put(new Uint8Array([1, 2, 3]));

    await store.clear();

    assert.equal(await store.get(ref), undefined);
    assert.deepEqual(store.getOwnKeys(), []);
    assert.deepEqual(JSON.parse(win.localStorage.getItem('mapshaper_undo_sessions')), {});
  });

  it('attempts to delete owned payloads and heartbeat on pagehide', async function() {
    var backend = createMemoryUndoPayloadBackend();
    var win = makeWindow();
    var store = createUndoPayloadStore({
      backend: backend,
      sessionId: 'undo_pagehide',
      window: win
    });
    var ref;

    store.startLifecycle();
    ref = await store.put({foo: 'bar'});

    win.dispatchEvent('pagehide', {persisted: false});
    await Promise.resolve();

    assert.equal(await backend.get(ref.key), undefined);
    assert.deepEqual(store.getOwnKeys(), []);
    assert.deepEqual(JSON.parse(win.localStorage.getItem('mapshaper_undo_sessions')), {});
  });

  it('keeps payloads when pagehide enters bfcache', async function() {
    var backend = createMemoryUndoPayloadBackend();
    var win = makeWindow();
    var store = createUndoPayloadStore({
      backend: backend,
      sessionId: 'undo_bfcache',
      window: win
    });
    var ref;

    store.startLifecycle();
    ref = await store.put({foo: 'bar'});

    win.dispatchEvent('pagehide', {persisted: true});

    assert.deepEqual(await backend.get(ref.key), {foo: 'bar'});
    assert.deepEqual(store.getOwnKeys(), [ref.key]);
    assert.notEqual(win.localStorage.getItem('mapshaper_undo_sessions'), '{}');
  });

  it('rejects payloads that exceed the per-payload limit', async function() {
    var store = createUndoPayloadStore({
      backend: createMemoryUndoPayloadBackend(),
      maxPayloadBytes: 2,
      sessionId: 'undo_limit',
      window: makeWindow()
    });
    var err;

    try {
      await store.put(new Uint8Array([1, 2, 3]));
    } catch(e) {
      err = e;
    }

    assert.ok(err);
    assert.equal(/per-payload limit/.test(err.message), true);
    assert.deepEqual(store.getOwnKeys(), []);
  });

  it('rejects payloads that exceed the session limit', async function() {
    var store = createUndoPayloadStore({
      backend: createMemoryUndoPayloadBackend(),
      maxBytes: 4,
      sessionId: 'undo_limit',
      window: makeWindow()
    });
    var err;

    await store.put(new Uint8Array([1, 2]));
    try {
      await store.put(new Uint8Array([3, 4, 5]));
    } catch(e) {
      err = e;
    }

    assert.ok(err);
    assert.equal(/session limit/.test(err.message), true);
    assert.equal(store.getStats().ownPayloadCount, 1);
    assert.equal(store.getStats().ownBytes, 2);
  });

  it('removes payload data if index update fails after writing payload', async function() {
    var backend = createMemoryUndoPayloadBackend();
    var store = createUndoPayloadStore({
      backend: failIndexWrites(backend),
      sessionId: 'undo_index_fail',
      window: makeWindow()
    });
    var err;

    try {
      await store.put({foo: 'bar'});
    } catch(e) {
      err = e;
    }

    assert.ok(err);
    assert.deepEqual(store.getOwnKeys(), []);
    assert.equal(store.getStats().ownBytes, 0);
    assert.deepEqual(await backend.keys(), []);
  });
});

function failIndexWrites(backend) {
  return Object.assign({}, backend, {
    set: function(key, val) {
      if (key == 'msu_index') {
        return Promise.reject(new Error('index write failed'));
      }
      return backend.set(key, val);
    }
  });
}

function makeWindow() {
  var data = {};
  var listeners = {};
  return {
    localStorage: {
      getItem: function(key) {
        return key in data ? data[key] : null;
      },
      setItem: function(key, val) {
        data[key] = val;
      }
    },
    setInterval: function() {
      return 1;
    },
    clearInterval: function() {},
    addEventListener: function(type, cb) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb);
    },
    dispatchEvent: function(type, event) {
      (listeners[type] || []).forEach(function(cb) {
        cb(event || {});
      });
    }
  };
}
