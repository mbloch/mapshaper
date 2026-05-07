import assert from 'assert';
import { ArcCollection } from '../src/paths/mapshaper-arcs';
import { DataTable } from '../src/datatable/mapshaper-data-table';
import {
  captureModelState,
  createRuntimeIdTracker,
  diffModelStates,
  getRestoreContract,
  getUndoPolicy
} from '../src/gui/gui-undo-feasibility';

describe('gui-undo-feasibility.js', function () {

  it('detects in-place attribute edits', function() {
    var tracker = createRuntimeIdTracker();
    var layer = makeLayer({
      data: new DataTable([{foo: 'a'}, {foo: 'b'}])
    });
    var dataset = makeDataset([layer]);
    var model = makeModel([dataset], layer);
    var before = captureModelState(model, tracker);

    layer.data.getRecordAt(1).foo = 'c';
    var after = captureModelState(model, tracker);
    var report = diffModelStates(before, after);

    assert.equal(report.changes.layers.length, 1);
    assert.equal(report.changes.layers[0].data, true);
    assert.equal(report.changes.layers[0].shapes, false);
    assert.equal(report.storage.strategy, 'table');
    assert(report.storage.alternatives.fullSession.estimatedBytes > 0);
    assert(report.storage.alternatives.changedTables.estimatedBytes > 0);
  });

  it('detects in-place ArcCollection edits', function() {
    var tracker = createRuntimeIdTracker();
    var layer = makeLayer({
      geometry_type: 'polyline',
      shapes: [[[0]]]
    });
    var arcs = new ArcCollection([[[0, 0], [1, 1]]]);
    var dataset = makeDataset([layer], arcs);
    var model = makeModel([dataset], layer);
    var before = captureModelState(model, tracker);
    var data = arcs.getVertexData();

    data.xx[1] = 2;
    arcs.updateArcBounds(0);
    var after = captureModelState(model, tracker);
    var report = diffModelStates(before, after);

    assert.equal(report.changes.datasets.length, 1);
    assert.equal(report.changes.datasets[0].arcs, true);
    assert.equal(report.storage.strategy, 'dataset');
    assert.equal(report.restore.updateFlags.arc_count, true);
  });

  it('detects catalog and active target changes', function() {
    var tracker = createRuntimeIdTracker();
    var layer1 = makeLayer({name: 'a'});
    var layer2 = makeLayer({name: 'b'});
    var dataset = makeDataset([layer1, layer2]);
    var model = makeModel([dataset], layer1);
    var before = captureModelState(model, tracker);

    model.activeLayer = layer2;
    dataset.layers.reverse();
    var after = captureModelState(model, tracker);
    var report = diffModelStates(before, after);

    assert.equal(report.changes.catalog, true);
    assert.equal(report.changes.selection, true);
    assert.equal(report.changes.datasets[0].layerOrder, true);
    assert.equal(report.restore.updateFlags.select, true);
  });

  it('documents policy and restore contract defaults', function() {
    var policy = getUndoPolicy({maxStates: 3, maxBytes: 1000, largeChangeBytes: 500});
    var contract = getRestoreContract({
      catalog: false,
      selection: false,
      datasets: [{status: 'changed', arcs: true, info: false, layerOrder: false}],
      layers: []
    });

    assert.equal(policy.optIn, true);
    assert.equal(policy.stackLimits.maxStates, 3);
    assert.equal(policy.sessionHistory.includes('audit log'), true);
    assert.deepEqual(contract.levels, ['dataset']);
    assert.equal(contract.updateFlags.arc_count, true);
  });
});

function makeLayer(o) {
  return Object.assign({
    name: '',
    geometry_type: null,
    shapes: null,
    data: null
  }, o || {});
}

function makeDataset(layers, arcs) {
  return {
    layers: layers,
    arcs: arcs || null,
    info: {}
  };
}

function makeModel(datasets, activeLayer) {
  return {
    activeLayer: activeLayer,
    getDatasets: function() {
      return datasets;
    },
    getActiveLayer: function() {
      var lyr = this.activeLayer;
      return {
        layer: lyr,
        dataset: datasets.find(function(dataset) {
          return dataset.layers.includes(lyr);
        }) || datasets[0]
      };
    },
    getDefaultTargets: function() {
      return [{
        dataset: datasets[0],
        layers: [this.activeLayer]
      }];
    }
  };
}
