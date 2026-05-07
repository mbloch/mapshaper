import assert from 'assert';
import { ArcCollection } from '../src/paths/mapshaper-arcs';
import { DataTable } from '../src/datatable/mapshaper-data-table';
import {
  createUndoTestApi,
  getModelChecksum,
  getUndoTestState
} from '../src/gui/gui-undo-test-api';

describe('gui-undo-test-api.js', function() {
  it('returns stable model checksums for integration tests', function() {
    var model = makeModel();
    var first = getModelChecksum(model);
    var second = getModelChecksum(model);

    assert.equal(first.checksum, second.checksum);
    assert.equal(first.datasetCount, 1);
    assert.equal(first.layerCount, 1);
    assert.equal(first.datasets[0].arcCount, 1);
    assert.deepEqual(first.datasets[0].layers[0].fields, ['foo']);
  });

  it('changes model checksum after table mutation', function() {
    var model = makeModel();
    var before = getModelChecksum(model).checksum;

    model.getActiveLayer().layer.data.getRecordAt(0).foo = 'baz';

    assert.notEqual(getModelChecksum(model).checksum, before);
  });

  it('reports undo and payload store state', function() {
    var gui = {
      model: makeModel(),
      undo: {
        canUndo: function() { return true; },
        canRedo: function() { return false; }
      },
      undoPayloadStore: {
        getOwnKeys: function() { return ['a', 'b']; },
        getOwnPayloads: function() { return [{key: 'a'}, {key: 'b'}]; },
        isPersistent: function() { return true; }
      }
    };
    var state = getUndoTestState(gui);

    assert.equal(state.undo.canUndo, true);
    assert.equal(state.undo.canRedo, false);
    assert.equal(state.payloadStore.persistent, true);
    assert.equal(state.payloadStore.ownPayloadCount, 2);
    assert.deepEqual(state.payloadStore.ownPayloads, [{key: 'a'}, {key: 'b'}]);
  });

  it('runs GUI console commands through a promise wrapper', async function() {
    var ran = false;
    var gui = {
      model: makeModel(),
      undo: null,
      console: {
        runMapshaperCommands: function(str, done) {
          ran = str == 'info';
          done(null, {info: true});
        }
      }
    };
    var api = createUndoTestApi(gui);
    var flags = await api.runCommand('info');

    assert.equal(ran, true);
    assert.deepEqual(flags, {info: true});
  });

  it('exposes test-only undo and redo helpers', async function() {
    var calls = [];
    var gui = {
      model: makeModel(),
      undo: {
        undo: function() {
          calls.push('undo');
          return Promise.resolve();
        },
        redo: function() {
          calls.push('redo');
          return Promise.resolve();
        },
        clear: function() {
          calls.push('clear');
        },
        canUndo: function() { return true; },
        canRedo: function() { return true; }
      }
    };
    var api = createUndoTestApi(gui);

    await api.undo();
    await api.redo();
    api.clearUndoHistory();

    assert.deepEqual(calls, ['undo', 'redo', 'clear']);
  });
});

function makeModel() {
  var layer = {
    name: 'points',
    geometry_type: 'point',
    shapes: [[[0, 0]]],
    data: new DataTable([{foo: 'bar'}])
  };
  var dataset = {
    layers: [layer],
    arcs: new ArcCollection([[[0, 0], [1, 1]]]),
    info: {source: 'test'}
  };
  return {
    getDatasets: function() {
      return [dataset];
    },
    getLayers: function() {
      return [{layer: layer, dataset: dataset}];
    },
    getActiveLayer: function() {
      return {layer: layer, dataset: dataset};
    }
  };
}
