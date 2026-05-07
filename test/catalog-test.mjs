import assert from 'assert';
import { Catalog } from '../src/dataset/mapshaper-catalog';
import {
  clearActiveUndoTransaction,
  setActiveUndoTransaction
} from '../src/undo/mapshaper-undo-tracking';

describe('mapshaper-catalog.js', function () {
  afterEach(function() {
    clearActiveUndoTransaction();
  })

  describe('undo tracking hooks', function() {
    it('tracks catalog identity and revisions', function() {
      var catalog = new Catalog();
      var id = catalog.getUndoId();
      assert.equal(catalog.getUndoId(), id);
      assert.equal(catalog.getUndoRevision(), 0);
      catalog.markCatalogChanged();
      assert.equal(catalog.getUndoRevision(), 1);
    })

    it('captures before adding datasets through default target changes', function() {
      var catalog = new Catalog();
      var dataset = makeDataset('a');
      var events = [];
      setActiveUndoTransaction({
        captureCatalogBefore: function(catalogArg, detail) {
          events.push({type: 'capture', catalog: catalogArg, detail: detail});
        },
        captureDatasetBefore: function(datasetArg, detail) {
          events.push({type: 'capture', dataset: datasetArg, detail: detail});
        },
        markChanged: function(catalogArg, detail) {
          events.push({type: 'mark', catalog: catalogArg, detail: detail});
        }
      });

      catalog.addDataset(dataset);

      assert.equal(catalog.getDatasets().length, 1);
      assert.equal(catalog.getActiveLayer().layer, dataset.layers[0]);
      assert.equal(events.length, 2);
      assert.equal(events[0].type, 'capture');
      assert.equal(events[0].catalog, catalog);
      assert.equal(events[0].detail.operation, 'setDefaultTargets');
      assert.equal(events[1].type, 'mark');
      assert.equal(events[1].detail.type, 'catalog');
      assert.equal(events[1].detail.operation, 'setDefaultTargets');
      assert.equal(catalog.getUndoRevision(), 1);
    })

    it('captures layer deletion without double-marking removed datasets', function() {
      var catalog = new Catalog();
      var dataset = makeDataset('a');
      var events = [];
      var revision;
      catalog.addDataset(dataset);
      revision = catalog.getUndoRevision();
      setActiveUndoTransaction({
        captureCatalogBefore: function(catalogArg, detail) {
          events.push({type: 'capture', catalog: catalogArg, detail: detail});
        },
        captureDatasetBefore: function(datasetArg, detail) {
          events.push({type: 'capture', dataset: datasetArg, detail: detail});
        },
        markChanged: function(catalogArg, detail) {
          events.push({type: 'mark', catalog: catalogArg, detail: detail});
        }
      });

      catalog.deleteLayer(dataset.layers[0], dataset);

      assert.equal(catalog.getDatasets().length, 0);
      assert.equal(events.length, 4);
      assert.equal(events[0].detail.operation, 'deleteLayer');
      assert.equal(events[1].detail.unit, 'layers');
      assert.equal(events[2].detail.type, 'dataset');
      assert.equal(events[3].detail.operation, 'deleteLayer');
    })

    it('captures selection changes separately from data changes', function() {
      var catalog = new Catalog();
      var dataset = {
        layers: [{name: 'a'}, {name: 'b'}],
        arcs: null,
        info: {}
      };
      var events = [];
      catalog.addDataset(dataset);
      setActiveUndoTransaction({
        captureCatalogBefore: function(catalogArg, detail) {
          events.push({type: 'capture', catalog: catalogArg, detail: detail});
        },
        markChanged: function(catalogArg, detail) {
          events.push({type: 'mark', catalog: catalogArg, detail: detail});
        }
      });

      catalog.setDefaultTarget([dataset.layers[0]], dataset);

      assert.equal(catalog.getActiveLayer().layer, dataset.layers[0]);
      assert.equal(events.length, 2);
      assert.equal(events[0].detail.operation, 'setDefaultTargets');
      assert.equal(events[1].detail.operation, 'setDefaultTargets');
    })

    it('does not capture no-op default target changes', function() {
      var catalog = new Catalog();
      var dataset = makeDataset('a');
      var events = [];
      var revision;
      catalog.addDataset(dataset);
      revision = catalog.getUndoRevision();
      setActiveUndoTransaction({
        captureCatalogBefore: function(catalogArg, detail) {
          events.push({type: 'capture', catalog: catalogArg, detail: detail});
        },
        markChanged: function(catalogArg, detail) {
          events.push({type: 'mark', catalog: catalogArg, detail: detail});
        }
      });

      catalog.setDefaultTarget([dataset.layers[0]], dataset);

      assert.equal(events.length, 0);
      assert.equal(catalog.getUndoRevision(), revision);
    })
  })
});

function makeDataset(name) {
  return {
    layers: [{name: name}],
    arcs: null,
    info: {}
  };
}
