import assert from 'assert';
import { ArcCollection } from '../src/paths/mapshaper-arcs';
import { Catalog } from '../src/dataset/mapshaper-catalog';
import { DataTable } from '../src/datatable/mapshaper-data-table';
import { replaceLayers } from '../src/dataset/mapshaper-dataset-utils';
import { insertFieldValues, transformPointsInLayer } from '../src/dataset/mapshaper-layer-utils';
import {
  UndoTransaction,
  restoreCapturedUnits
} from '../src/undo/mapshaper-undo-transaction';
import {
  markLayerMetadataChanged,
  noteLayerMetadataWillChange
} from '../src/undo/mapshaper-undo-tracking';
import cmd from '../src/mapshaper-cmd';
import '../src/commands/mapshaper-filter-rename-fields';
import '../src/commands/mapshaper-sort';

describe('mapshaper-undo-transaction.js', function() {
  it('captures record-level edits without capturing the whole table', function() {
    var table = new DataTable([{foo: 'a'}, {foo: 'b'}]);
    var tx = new UndoTransaction('record-edit');

    tx.run(function() {
      table.captureRecordsBefore([1], {operation: 'edit-record'});
      table.getRecordAt(1).foo = 'c';
      table.markRecordsChanged([1], {operation: 'edit-record'});
    });

    var units = tx.getCapturedUnits();
    assert.equal(units[0].type, 'table-records');
    assert.deepEqual(units[0].records, [{id: 1, record: {foo: 'b'}}]);
    assert.equal(units.some(function(unit) { return unit.type == 'table'; }), false);
    assert.equal(units[1].type, 'changed');
    assert.equal(units[1].detail.granularity, 'records');

    tx.restore();

    assert.deepEqual(table.getRecords(), [{foo: 'a'}, {foo: 'b'}]);
  });

  it('captures table fields once per transaction', function() {
    var table = new DataTable([{foo: 1}, {foo: 2}]);
    var tx = new UndoTransaction('field-edit');

    tx.run(function() {
      table.captureFieldsBefore(['foo'], {operation: 'first'});
      table.captureFieldsBefore(['foo'], {operation: 'second'});
      table.getRecords()[0].foo = 3;
      table.markFieldsChanged(['foo'], {operation: 'field-edit'});
    });

    var units = tx.getCapturedUnits();
    assert.equal(units[0].type, 'table-fields');
    assert.deepEqual(units[0].columns, [{field: 'foo', values: [1, 2]}]);
    assert.equal(units.filter(function(unit) { return unit.type == 'table-fields'; }).length, 1);

    tx.restore();

    assert.deepEqual(table.getRecords(), [{foo: 1}, {foo: 2}]);
  });

  it('restores table schema changes', function() {
    var table = new DataTable([{foo: 1}, {foo: 2}]);
    var tx = new UndoTransaction('schema');

    tx.run(function() {
      table.addField('bar', 3);
    });

    assert.deepEqual(table.getRecords(), [{foo: 1, bar: 3}, {foo: 2, bar: 3}]);

    tx.restore();

    assert.deepEqual(table.getRecords(), [{foo: 1}, {foo: 2}]);
  });

  it('captures multiple schema fields without capturing the whole table', function() {
    var table = new DataTable([{foo: 1}, {foo: 2}]);
    var tx = new UndoTransaction('schema-fields');

    tx.run(function() {
      table.captureSchemaBefore({operation: 'join', fields: ['bar', 'baz']});
      table.getRecords().forEach(function(rec, i) {
        rec.bar = i;
        rec.baz = i + 10;
      });
      table.markSchemaChanged({operation: 'join'});
    });

    var units = tx.getCapturedUnits();
    assert.equal(units[0].type, 'table-schema');
    assert.equal(units[1].type, 'table-fields');
    assert.equal(units.some(function(unit) { return unit.type == 'table'; }), false);
    assert.deepEqual(units[1].columns.map(function(column) {
      return column.field;
    }), ['bar', 'baz']);

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.deepEqual(table.getRecords(), [{foo: 1}, {foo: 2}]);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(table.getRecords(), [{foo: 1, bar: 0, baz: 10}, {foo: 2, bar: 1, baz: 11}]);
  });

  it('captures inserted fields as schema changes', function() {
    var table = new DataTable([{foo: 1}, {foo: 2}]);
    var layer = {data: table};
    var tx = new UndoTransaction('insert-field');

    tx.run(function() {
      insertFieldValues(layer, 'bar', [3, 4]);
    });

    var units = tx.getCapturedUnits();
    assert.equal(units[0].type, 'table-schema');
    assert.equal(units[1].type, 'table-fields');
    assert.equal(units.some(function(unit) { return unit.type == 'table'; }), false);

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.deepEqual(table.getRecords(), [{foo: 1}, {foo: 2}]);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(table.getRecords(), [{foo: 1, bar: 3}, {foo: 2, bar: 4}]);
  });

  it('captures field filtering without capturing the whole table', function() {
    var table = new DataTable([{foo: 1, bar: 2}, {foo: 3, bar: 4}]);
    var layer = {data: table};
    var tx = new UndoTransaction('filter-fields');

    tx.run(function() {
      cmd.filterFields(layer, ['bar'], {});
    });

    var units = tx.getCapturedUnits();
    assert.equal(units[0].type, 'table-schema');
    assert.equal(units[1].type, 'table-fields');
    assert.equal(units.some(function(unit) { return unit.type == 'table'; }), false);
    assert.deepEqual(table.getRecords(), [{bar: 2}, {bar: 4}]);

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.deepEqual(table.getFields(), ['foo', 'bar']);
    assert.deepEqual(table.getRecords(), [{foo: 1, bar: 2}, {foo: 3, bar: 4}]);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(table.getRecords(), [{bar: 2}, {bar: 4}]);
  });

  it('captures field renaming without capturing the whole table', function() {
    var table = new DataTable([{foo: 1, bar: 2}, {foo: 3, bar: 4}]);
    var layer = {data: table};
    var tx = new UndoTransaction('rename-fields');

    tx.run(function() {
      cmd.renameFields(layer, ['baz=foo']);
    });

    var units = tx.getCapturedUnits();
    assert.equal(units[0].type, 'table-schema');
    assert.equal(units[1].type, 'table-fields');
    assert.equal(units.some(function(unit) { return unit.type == 'table'; }), false);
    assert.deepEqual(table.getRecords(), [{baz: 1, bar: 2}, {baz: 3, bar: 4}]);

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.deepEqual(table.getFields(), ['foo', 'bar']);
    assert.deepEqual(table.getRecords(), [{foo: 1, bar: 2}, {foo: 3, bar: 4}]);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(table.getRecords(), [{baz: 1, bar: 2}, {baz: 3, bar: 4}]);
  });

  it('captures sorting as order permutations', function() {
    var table = new DataTable([{name: 'a'}, {name: 'c'}, {name: 'b'}]);
    var layer = {
      geometry_type: 'point',
      shapes: [[[0, 0]], [[2, 2]], [[1, 1]]],
      data: table
    };
    var tx = new UndoTransaction('sort');

    tx.run(function() {
      cmd.sortFeatures(layer, null, {expression: 'name', descending: true});
    });

    var units = tx.getCapturedUnits();
    var restoreUnits = units.filter(function(unit) { return unit.type != 'changed'; });
    assert.equal(restoreUnits[0].type, 'layer-order');
    assert.deepEqual(restoreUnits[0].ids, [2, 0, 1]);
    assert.equal(restoreUnits[1].type, 'table-order');
    assert.deepEqual(restoreUnits[1].ids, [2, 0, 1]);
    assert.equal(restoreUnits.some(function(unit) { return unit.type == 'table' || unit.type == 'layer'; }), false);
    assert.deepEqual(table.getRecords(), [{name: 'c'}, {name: 'b'}, {name: 'a'}]);

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.deepEqual(table.getRecords(), [{name: 'a'}, {name: 'c'}, {name: 'b'}]);
    assert.deepEqual(layer.shapes, [[[0, 0]], [[2, 2]], [[1, 1]]]);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(table.getRecords(), [{name: 'c'}, {name: 'b'}, {name: 'a'}]);
    assert.deepEqual(layer.shapes, [[[2, 2]], [[1, 1]], [[0, 0]]]);
  });

  it('captures dataset info without capturing layers or arcs', function() {
    var layer = {name: 'a', geometry_type: 'point', shapes: [[[0, 0]]]};
    var arcs = null;
    var dataset = {layers: [layer], arcs: arcs, info: {foo: 'old'}};
    var tx = new UndoTransaction('dataset-info');

    tx.run(function() {
      tx.captureDatasetInfoBefore(dataset, {operation: 'metadata'});
      dataset.info.foo = 'new';
    });

    var unit = tx.getCapturedUnits()[0];
    assert.equal(unit.type, 'dataset-info');
    assert.deepEqual(unit.info, {foo: 'old'});
    assert.equal('layers' in unit, false);
    assert.equal('arcs' in unit, false);

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.deepEqual(dataset.info, {foo: 'old'});
    assert.deepEqual(dataset.layers, [layer]);
    assert.equal(dataset.arcs, arcs);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(dataset.info, {foo: 'new'});
  });

  it('captures arc typed arrays before mutation', function() {
    var arcs = new ArcCollection([[[0, 0], [1, 1]]]);
    var tx = new UndoTransaction('arcs');

    tx.run(function() {
      arcs.transformPoints(function(x, y) {
        return [x + 10, y + 20];
      });
    });

    var unit = tx.getCapturedUnits()[0];
    assert.equal(unit.type, 'arcs');
    assert.deepEqual(Array.from(unit.nn), [2]);
    assert.deepEqual(Array.from(unit.xx), [0, 1]);
    assert.deepEqual(Array.from(unit.yy), [0, 1]);
    assert.deepEqual(arcs.toArray(), [[[10, 20], [11, 21]]]);

    tx.restore();

    assert.deepEqual(arcs.toArray(), [[[0, 0], [1, 1]]]);
  });

  it('captures arc simplification state without copying coordinates', function() {
    var arcs = new ArcCollection([[[0, 0], [1, 1], [2, 2]]]);
    var tx = new UndoTransaction('arcs-simplification');

    tx.run(function() {
      arcs.setThresholds(new Float64Array([Infinity, 2, Infinity]));
      arcs.setRetainedInterval(2);
    });

    var units = tx.getCapturedUnits();
    var unit = units[0];
    assert.equal(unit.type, 'arcs-simplification');
    assert.equal(unit.zz, null);
    assert.equal(unit.zlimit, 0);
    assert.equal('xx' in unit, false);
    assert.equal('yy' in unit, false);
    assert.equal('nn' in unit, false);
    assert.equal(units.some(function(unit) { return unit.type == 'arcs'; }), false);

    var redoUnits = tx.captureCurrentState();
    assert.deepEqual(Array.from(redoUnits[0].zz), [Infinity, 2, Infinity]);
    assert.equal(redoUnits[0].zlimit, 2);

    tx.restore();

    assert.equal(arcs.getVertexData().zz, null);
    assert.equal(arcs.getRetainedInterval(), 0);
    assert.deepEqual(arcs.toArray(), [[[0, 0], [1, 1], [2, 2]]]);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(Array.from(arcs.getVertexData().zz), [Infinity, 2, Infinity]);
    assert.equal(arcs.getRetainedInterval(), 2);
  });

  it('captures catalog targets before catalog mutation', function() {
    var catalog = new Catalog();
    var dataset1 = makeDataset('a');
    var dataset2 = makeDataset('b');
    var tx = new UndoTransaction('catalog');
    catalog.addDataset(dataset1);

    tx.run(function() {
      catalog.addDataset(dataset2);
    });

    var unit = tx.getCapturedUnits()[0];
    assert.equal(unit.type, 'catalog');
    assert.deepEqual(unit.datasets, [dataset1]);
    assert.equal(unit.targets[0].dataset, dataset1);
    assert.deepEqual(unit.targets[0].layers, dataset1.layers);

    tx.restore();

    assert.deepEqual(catalog.getDatasets(), [dataset1]);
    assert.equal(catalog.getActiveLayer().layer, dataset1.layers[0]);
  });

  it('captures dataset and layer helper mutations', function() {
    var layer1 = {name: 'a', geometry_type: 'point', shapes: [[[0, 0]]]};
    var layer2 = {name: 'b', geometry_type: 'point', shapes: [[[1, 1]]]};
    var dataset = {layers: [layer1], arcs: null, info: {}};
    var tx = new UndoTransaction('helpers');

    tx.run(function() {
      replaceLayers(dataset, [layer1], [layer2]);
      transformPointsInLayer(layer2, function(x, y) {
        return [x + 1, y + 1];
      });
    });

    var units = tx.getCapturedUnits();
    assert.equal(units[0].type, 'dataset');
    assert.deepEqual(units[0].layers, [layer1]);
    assert.equal(units[2].type, 'layer');
    assert.deepEqual(units[2].shapes, [[[1, 1]]]);
    assert.deepEqual(layer2.shapes, [[[2, 2]]]);

    tx.restore();

    assert.deepEqual(dataset.layers, [layer1]);
    assert.deepEqual(layer2.shapes, [[[1, 1]]]);
  });

  it('captures current state for record-level redo', function() {
    var table = new DataTable([{foo: 'a'}, {foo: 'b'}]);
    var tx = new UndoTransaction('record-redo');

    tx.run(function() {
      table.captureRecordsBefore([1], {operation: 'edit-record'});
      table.getRecordAt(1).foo = 'c';
      table.markRecordsChanged([1], {operation: 'edit-record'});
    });

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.deepEqual(table.getRecords(), [{foo: 'a'}, {foo: 'b'}]);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(table.getRecords(), [{foo: 'a'}, {foo: 'c'}]);
  });

  it('captures current state for schema redo', function() {
    var table = new DataTable([{foo: 1}, {foo: 2}]);
    var tx = new UndoTransaction('schema-redo');

    tx.run(function() {
      table.addField('bar', 3);
    });

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.deepEqual(table.getRecords(), [{foo: 1}, {foo: 2}]);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(table.getRecords(), [{foo: 1, bar: 3}, {foo: 2, bar: 3}]);
  });

  it('captures current state for arc redo', function() {
    var arcs = new ArcCollection([[[0, 0], [1, 1]]]);
    var tx = new UndoTransaction('arc-redo');

    tx.run(function() {
      arcs.transformPoints(function(x, y) {
        return [x + 10, y + 20];
      });
    });

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.deepEqual(arcs.toArray(), [[[0, 0], [1, 1]]]);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(arcs.toArray(), [[[10, 20], [11, 21]]]);
  });

  it('captures current state for catalog and layer redo', function() {
    var catalog = new Catalog();
    var dataset1 = makeDataset('a');
    var dataset2 = makeDataset('b');
    var layer = dataset1.layers[0];
    var tx = new UndoTransaction('model-redo');
    catalog.addDataset(dataset1);

    tx.run(function() {
      catalog.addDataset(dataset2);
      transformPointsInLayer(layer, function(x, y) {
        return [x + 1, y + 2];
      });
    });

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.deepEqual(catalog.getDatasets(), [dataset1]);
    assert.deepEqual(layer.shapes, [[[0, 0]]]);

    restoreCapturedUnits(redoUnits);

    assert.deepEqual(catalog.getDatasets(), [dataset1, dataset2]);
    assert.deepEqual(layer.shapes, [[[1, 2]]]);
  });

  it('captures layer metadata without copying shapes or data', function() {
    var table = new DataTable([{foo: 'bar'}]);
    var shapes = [[[0, 0]]];
    var layer = {name: 'old', geometry_type: 'point', shapes: shapes, data: table};
    var tx = new UndoTransaction('layer-metadata');

    tx.run(function() {
      noteLayerMetadataWillChange(layer, {operation: 'rename-layers'});
      layer.name = 'new';
      markLayerMetadataChanged(layer, {operation: 'rename-layers'});
    });

    var unit = tx.getCapturedUnits()[0];
    assert.equal(unit.type, 'layer-metadata');
    assert.equal(unit.name, 'old');
    assert.equal('shapes' in unit, false);
    assert.equal('data' in unit, false);

    var redoUnits = tx.captureCurrentState();
    tx.restore();

    assert.equal(layer.name, 'old');
    assert.equal(layer.shapes, shapes);
    assert.equal(layer.data, table);

    restoreCapturedUnits(redoUnits);

    assert.equal(layer.name, 'new');
    assert.equal(layer.shapes, shapes);
    assert.equal(layer.data, table);
  });
});

function makeDataset(name) {
  return {
    layers: [{name: name, geometry_type: 'point', shapes: [[[0, 0]]]}],
    arcs: null,
    info: {}
  };
}
