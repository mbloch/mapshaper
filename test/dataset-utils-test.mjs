import api from '../mapshaper.js';
import assert from 'assert';
import { DataTable } from '../src/datatable/mapshaper-data-table';
import { ArcCollection } from '../src/paths/mapshaper-arcs';
import {
  cleanupArcs,
  mergeDatasetInfo,
  replaceLayers
} from '../src/dataset/mapshaper-dataset-utils';
import {
  copyLayer,
  copyLayerShapes,
  deleteFeatureById,
  getLayerDataTable,
  insertFieldValues,
  transformPointsInLayer
} from '../src/dataset/mapshaper-layer-utils';
import {
  clearActiveUndoTransaction,
  setActiveUndoTransaction
} from '../src/undo/mapshaper-undo-tracking';

describe('mapshaper-dataset-utils.js', function () {

  describe('copyLayerShapes()', function () {
    it('deep-copy shapes, shallow-copy other attributes', function () {
      var data = new DataTable([{foo: 'bar'}]);
      var shapes = [[[1, 1]]];
      var lyr = {
        geometry_type: 'point',
        data: data,
        shapes: shapes,
        target_id: 1,
        name: 'layer1'
      }
      var copy = copyLayerShapes(lyr);
      assert.strictEqual(data, copy.data);
      assert(copy.shapes != shapes);
      assert(copy.shapes[0] != shapes[0]);
      assert(copy.shapes[0][0] != shapes[0][0]);
      assert.equal(copy.target_id, 1);
      assert.equal(copy.name, 'layer1');
      assert.equal(copy.geometry_type, 'point');
    })
  })

  describe('copyLayer()', function () {
    it('duplicate data records', function () {
      var lyr = {
        data: new DataTable([{foo: 'a', bar: null}])
      };
      var copy = copyLayer(lyr);
      assert.deepEqual(copy.data.getRecords(), lyr.data.getRecords());
      assert.notEqual(copy.data.getRecords()[0], lyr.data.getRecords()[0])
    })

    it('duplicate shapes', function () {
      var lyr = {
        geometry_type: 'point',
        shapes: [[[1, 3]], null]
      };
      var copy = copyLayer(lyr);
      assert.deepEqual(copy, lyr);
      assert.notEqual(copy.shapes[0], lyr.shapes[0])
    })
  })

  describe('replaceLayers() stacking handover', function () {
    it('replacement takes the menu_order and pinned state of the replaced layer', function () {
      var a = {name: 'a', menu_order: 2, pinned: false};
      var b = {name: 'b', menu_order: 1, pinned: true};
      var a2 = {name: 'a2'};
      var dataset = {layers: [a, b], info: {}};
      replaceLayers(dataset, [a], [a2]);
      assert.deepEqual(dataset.layers, [a2, b]);
      assert.equal(a2.menu_order, 2);
      assert.strictEqual(a2.pinned, false);
    })

    it('extra new layers are stacked directly above the last replaced layer, in order', function () {
      var a = {name: 'a', menu_order: 3, pinned: true};
      var parts = [{name: 'p1'}, {name: 'p2'}, {name: 'p3'}];
      var dataset = {layers: [a], info: {}};
      replaceLayers(dataset, [a], parts);
      assert.equal(parts[0].menu_order, 3);
      assert(parts[1].menu_order > 3 && parts[1].menu_order < 4);
      assert(parts[2].menu_order > parts[1].menu_order && parts[2].menu_order < 4);
      parts.forEach(function(lyr) { assert.strictEqual(lyr.pinned, true); });
    })

    it('values already on a new layer are kept', function () {
      var a = {name: 'a', menu_order: 3, pinned: true};
      var a2 = {name: 'a2', menu_order: 5, pinned: false};
      replaceLayers({layers: [a], info: {}}, [a], [a2]);
      assert.equal(a2.menu_order, 5);
      assert.strictEqual(a2.pinned, false);
    })

    it('layers without stacking state hand over nothing', function () {
      var a = {name: 'a'};
      var a2 = {name: 'a2'};
      replaceLayers({layers: [a], info: {}}, [a], [a2]);
      assert(!('menu_order' in a2));
      assert(!('pinned' in a2));
    })

    async function runInMemory(cmdStr, setup) {
      var job = new api.internal.Job();
      await api.internal.runParsedCommands(api.internal.parseCommands(
        '-i test/data/geojson/two_states.json name=states'), job);
      setup(job.catalog);
      await api.internal.runParsedCommands(api.internal.parseCommands(cmdStr), job);
      return job.catalog;
    }

    it('-dissolve keeps the layer\'s stacking position and visibility', async function () {
      var catalog = await runInMemory('-dissolve target=states', function(catalog) {
        var lyr = catalog.getLayers()[0].layer;
        lyr.menu_order = 4;
        lyr.pinned = false;
      });
      var lyr = catalog.getLayers()[0].layer;
      assert.equal(lyr.shapes.length, 1);
      assert.equal(lyr.menu_order, 4);
      assert.strictEqual(lyr.pinned, false);
    })

    it('-split stacks the parts where the source layer was', async function () {
      var catalog = await runInMemory('-split target=states', function(catalog) {
        var lyr = catalog.getLayers()[0].layer;
        lyr.menu_order = 4;
        lyr.pinned = true;
      });
      var layers = catalog.getLayers().map(function(o) { return o.layer; });
      assert.equal(layers.length, 2);
      assert.equal(layers[0].menu_order, 4);
      assert(layers[1].menu_order > 4 && layers[1].menu_order < 5);
      layers.forEach(function(lyr) { assert.strictEqual(lyr.pinned, true); });
    })
  })

  describe('undo tracking hooks', function () {
    afterEach(function() {
      clearActiveUndoTransaction();
    })

    it('captures dataset layer replacement', function() {
      var dataset = {
        layers: [{name: 'a'}, {name: 'b'}],
        arcs: null,
        info: {}
      };
      var replacement = {name: 'c'};
      var events = [];
      setActiveUndoTransaction(makeEventRecorder(events));

      replaceLayers(dataset, [dataset.layers[0]], [replacement]);

      assert.deepEqual(dataset.layers, [replacement, {name: 'b'}]);
      assert.equal(events.length, 2);
      assert.equal(events[0].type, 'captureDatasetBefore');
      assert.equal(events[0].detail.operation, 'replaceLayers');
      assert.equal(events[1].type, 'markChanged');
      assert.equal(events[1].detail.type, 'dataset');
      assert.equal(events[1].detail.unit, 'layers');
    })

    it('captures dataset info and arcs cleanup changes', function() {
      var dataset = {
        layers: [{geometry_type: 'point', shapes: [[[0, 0]]]}],
        arcs: new ArcCollection([[[0, 0], [1, 1]]]),
        info: {input_files: ['a.shp'], input_formats: ['shp']}
      };
      var events = [];
      setActiveUndoTransaction(makeEventRecorder(events));

      mergeDatasetInfo(dataset, {
        info: {input_files: ['b.json'], input_formats: ['geojson'], crs: 'EPSG:4326'}
      });
      cleanupArcs(dataset);

      assert.equal(dataset.arcs, null);
      assert.deepEqual(dataset.info.input_files, ['a.shp', 'b.json']);
      assert.equal(dataset.info.crs, 'EPSG:4326');
      assert.equal(events[0].detail.operation, 'mergeDatasetInfo');
      assert.equal(events[1].detail.granularity, 'info');
      assert.equal(events[2].detail.operation, 'cleanupArcs');
      assert.equal(events[3].detail.unit, 'arcs');
    })

    it('captures layer data creation and field insertion', function() {
      var lyr = {geometry_type: null, shapes: null};
      var events = [];
      setActiveUndoTransaction(makeEventRecorder(events));

      insertFieldValues(lyr, 'foo', [1, 2]);

      assert.deepEqual(lyr.data.getRecords(), [{foo: 1}, {foo: 2}]);
      assert.equal(events[0].type, 'captureLayerBefore');
      assert.equal(events[0].detail.unit, 'data');
      assert.equal(events[1].detail.type, 'layer');
      assert.equal(events[2].type, 'captureTableSchemaBefore');
      assert.equal(events[2].detail.field, 'foo');
      assert.equal(events[3].detail.granularity, 'schema');
    })

    it('captures feature deletion and point transforms', function() {
      var lyr = {
        geometry_type: 'point',
        shapes: [[[0, 0]], [[1, 1]]],
        data: new DataTable([{foo: 'a'}, {foo: 'b'}])
      };
      var events = [];
      setActiveUndoTransaction(makeEventRecorder(events));

      deleteFeatureById(lyr, 0);
      transformPointsInLayer(lyr, function(x, y) {
        return [x + 1, y + 2];
      });

      assert.deepEqual(lyr.shapes, [[[2, 3]]]);
      assert.deepEqual(lyr.data.getRecords(), [{foo: 'b'}]);
      assert(events.some(function(evt) {
        return evt.type == 'captureLayerBefore' && evt.detail.operation == 'deleteFeatureById';
      }));
      assert(events.some(function(evt) {
        return evt.type == 'captureTableBefore' && evt.detail.operation == 'deleteFeatureById';
      }));
      assert(events.some(function(evt) {
        return evt.type == 'captureLayerBefore' && evt.detail.operation == 'transformPointsInLayer';
      }));
    })

    it('captures layer data table initialization', function() {
      var lyr = {shapes: [[[0, 0]], [[1, 1]]]};
      var events = [];
      setActiveUndoTransaction(makeEventRecorder(events));

      getLayerDataTable(lyr);

      assert.equal(lyr.data.size(), 2);
      assert.equal(events[0].type, 'captureLayerBefore');
      assert.equal(events[0].detail.operation, 'getLayerDataTable');
      assert.equal(events[1].detail.type, 'layer');
    })
  })

})

function makeEventRecorder(events) {
  return {
    captureDatasetBefore: function(obj, detail) {
      events.push({type: 'captureDatasetBefore', obj: obj, detail: detail});
    },
    captureDatasetInfoBefore: function(obj, detail) {
      events.push({type: 'captureDatasetInfoBefore', obj: obj, detail: detail});
    },
    captureLayerBefore: function(obj, detail) {
      events.push({type: 'captureLayerBefore', obj: obj, detail: detail});
    },
    captureTableBefore: function(obj, detail) {
      events.push({type: 'captureTableBefore', obj: obj, detail: detail});
    },
    captureTableFieldsBefore: function(obj, detail) {
      events.push({type: 'captureTableFieldsBefore', obj: obj, detail: detail});
    },
    captureTableSchemaBefore: function(obj, detail) {
      events.push({type: 'captureTableSchemaBefore', obj: obj, detail: detail});
    },
    markChanged: function(obj, detail) {
      events.push({type: 'markChanged', obj: obj, detail: detail});
    }
  };
}
