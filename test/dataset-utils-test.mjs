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
