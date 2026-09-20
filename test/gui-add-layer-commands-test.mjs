import assert from 'assert';
import {
  DRAW_KINDS, findDrawKind, getAddLayerCommand, getNewLayerName, kindFitsLayer
} from '../src/gui/gui-add-layer-commands';
import { addLayer } from '../src/commands/mapshaper-add-layer';
import { getOptionParser } from '../src/cli/mapshaper-options';

describe('gui add layer commands', function() {

  describe('getAddLayerCommand()', function() {
    it('names the layer it creates', function() {
      assert.equal(getAddLayerCommand('point', 'labels'),
        "-add-layer geometry-type=point name='labels'");
    });

    it('leaves an unnamed layer unnamed', function() {
      assert.equal(getAddLayerCommand('polygon', ''),
        '-add-layer geometry-type=polygon');
    });

    it('quotes a name the command parser would otherwise split', function() {
      assert.equal(getAddLayerCommand('point', 'my points'),
        "-add-layer geometry-type=point name='my points'");
    });

    it('uses options -add-layer declares', function() {
      // a misspelled option is a link that fails with a parse error
      var defn = getOptionParser().findCommand('add-layer').done();
      var declared = defn.options.map(function(o) { return o.name; });
      assert.ok(declared.indexOf('geometry-type') > -1);
      assert.ok(declared.indexOf('name') > -1);
    });
  });

  describe('getNewLayerName()', function() {
    var labels = findDrawKind('labels');

    it('uses the kind name when nothing has taken it', function() {
      assert.equal(getNewLayerName(labels, ['states', 'rivers']), 'labels');
      assert.equal(getNewLayerName(labels, []), 'labels');
    });

    it('versions the name when it is taken', function() {
      // two layers of the same name make target= ambiguous
      assert.equal(getNewLayerName(labels, ['labels']), 'labels2');
      assert.equal(getNewLayerName(labels, ['labels', 'labels2']), 'labels3');
    });

    it('skips a gap left by a deleted layer', function() {
      assert.equal(getNewLayerName(labels, ['labels', 'labels3']), 'labels2');
    });

    it('is not confused by unnamed layers', function() {
      assert.equal(getNewLayerName(labels, [undefined, null]), 'labels');
    });
  });

  describe('kindFitsLayer()', function() {
    var polygons = findDrawKind('polygons');
    var labels = findDrawKind('labels');

    it('an empty layer of the right type is drawn into', function() {
      // clicking a link twice should not leave the first layer behind, empty
      assert.ok(kindFitsLayer(polygons, {geometry_type: 'polygon', shapes: []}));
    });

    it('a layer with something in it is left alone', function() {
      assert.ok(!kindFitsLayer(polygons,
        {geometry_type: 'polygon', shapes: [[0]]}));
    });

    it('a layer of another type is left alone', function() {
      assert.ok(!kindFitsLayer(polygons, {geometry_type: 'point', shapes: []}));
      assert.ok(!kindFitsLayer(labels, {geometry_type: 'polygon', shapes: []}));
    });

    it('an empty table is not a layer to draw in', function() {
      assert.ok(!kindFitsLayer(polygons, {data: {size: function() {return 0;}}}));
    });

    it('nothing fits a missing layer', function() {
      assert.ok(!kindFitsLayer(polygons, null));
    });
  });

  describe('DRAW_KINDS', function() {
    it('every kind is a layer -add-layer will create', function() {
      DRAW_KINDS.forEach(function(kind) {
        var dataset = addLayer(null, {geometry_type: kind.geometryType});
        assert.equal(dataset.layers[0].geometry_type, kind.geometryType);
      });
    });

    it('labels and points are both point layers', function() {
      // the difference is the tool that opens, which is why the panel offers
      // labels without asking the user to know that a label is a point
      assert.equal(findDrawKind('labels').geometryType, 'point');
      assert.equal(findDrawKind('points').geometryType, 'point');
      assert.equal(findDrawKind('labels').mode, 'label');
      assert.equal(findDrawKind('points').mode, 'edit_points');
    });

    it('every kind says that it creates a layer, which the link does not',
      function() {
        DRAW_KINDS.forEach(function(kind) {
          assert.ok(/new layer/.test(kind.tip), kind.kind + ': ' + kind.tip);
        });
      });

    it('findDrawKind() has nothing for an unknown kind', function() {
      assert.equal(findDrawKind('rasters'), null);
    });
  });
});
