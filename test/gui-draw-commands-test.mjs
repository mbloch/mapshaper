import assert from 'assert';
import api from '../mapshaper.js';
import { getAddShapeCommand, drawnPathIsValid } from '../src/gui/gui-draw-commands';

describe('gui draw commands', function() {

  describe('getAddShapeCommand()', function() {
    it('writes a line at full precision and names its target', function() {
      assert.equal(getAddShapeCommand([[0.5, 1.25], [3.1234567891, -2]],
        {geometryType: 'polyline', target: 'lines'}),
        "-add-shape coordinates=0.5,1.25,3.1234567891,-2 target='lines'");
    });

    it('leaves the target out for an unnamed layer', function() {
      assert.equal(getAddShapeCommand([[0, 0], [1, 1]], {geometryType: 'polyline'}),
        '-add-shape coordinates=0,0,1,1');
    });

    it('closes an open polygon path', function() {
      assert.equal(getAddShapeCommand([[0, 0], [1, 0], [1, 1]], {geometryType: 'polygon'}),
        '-add-shape coordinates=0,0,1,0,1,1 closed');
    });

    it('does not ask to close a ring that is already closed', function() {
      assert.equal(getAddShapeCommand([[0, 0], [1, 0], [1, 1], [0, 0]], {geometryType: 'polygon'}),
        '-add-shape coordinates=0,0,1,0,1,1,0,0');
    });

    it('writes style properties, skipping empty ones', function() {
      assert.equal(getAddShapeCommand([[0, 0], [1, 1]], {
        geometryType: 'polyline',
        style: {stroke: '#fff', 'stroke-width': 2, 'line-end': ''}
      }), "-add-shape coordinates=0,0,1,1 stroke='#fff' stroke-width=2");
    });

    it('writes numbers from panel fields without quotes', function() {
      assert.equal(getAddShapeCommand([[0, 0], [1, 1]], {
        geometryType: 'polyline',
        style: {'stroke-width': '0.5', 'stroke-dasharray': '4 2', opacity: '.8'}
      }), "-add-shape coordinates=0,0,1,1 stroke-width=0.5 stroke-dasharray='4 2' opacity=.8");
    });

    it('extends a line', function() {
      assert.equal(getAddShapeCommand([[1, 1], [2, 0]], {
        geometryType: 'polyline', target: 'lines', extend: true
      }), "-add-shape coordinates=1,1,2,0 extend target='lines'");
    });

    it('extends the line it describes', async function() {
      var cmd = '-add-layer geometry-type=polyline name=lines ' +
        getAddShapeCommand([[0, 0], [0.1, 0.30000000000000004]], {geometryType: 'polyline', target: 'lines'}) + ' ' +
        getAddShapeCommand([[0.1, 0.30000000000000004], [1, 1]], {
          geometryType: 'polyline', target: 'lines', extend: true
        }) + ' -o out.json';
      var out = await api.applyCommands(cmd);
      // the vertex written at full precision matches the line's end exactly
      var geometries = JSON.parse(out['out.json']).geometries;
      assert.equal(geometries.length, 1);
      assert.deepEqual(geometries[0].coordinates, [[0, 0], [0.1, 0.30000000000000004], [1, 1]]);
    });

    it('creates the feature it describes', async function() {
      var cmd = '-add-layer geometry-type=polygon name=zones ' +
        getAddShapeCommand([[0, 0], [4, 0], [4, 3]], {
          geometryType: 'polygon', target: 'zones', style: {fill: 'pink'}
        }) + ' -o out.json';
      var out = await api.applyCommands(cmd);
      var feat = JSON.parse(out['out.json']).features[0];
      assert.equal(feat.geometry.type, 'Polygon');
      assert.equal(feat.properties.fill, 'pink');
    });
  });

  describe('drawnPathIsValid()', function() {
    it('a line needs two distinct vertices', function() {
      assert.equal(drawnPathIsValid([[0, 0]], 'polyline'), false);
      assert.equal(drawnPathIsValid([[0, 0], [0, 0]], 'polyline'), false);
      assert.equal(drawnPathIsValid([[0, 0], [1, 0]], 'polyline'), true);
    });

    it('a polygon needs three, not counting the closing vertex', function() {
      assert.equal(drawnPathIsValid([[0, 0], [1, 0]], 'polygon'), false);
      assert.equal(drawnPathIsValid([[0, 0], [1, 0], [0, 0]], 'polygon'), false);
      assert.equal(drawnPathIsValid([[0, 0], [1, 0], [1, 1]], 'polygon'), true);
      assert.equal(drawnPathIsValid([[0, 0], [1, 0], [1, 1], [0, 0]], 'polygon'), true);
    });
  });
});
