import api from '../mapshaper.js';
import assert from 'assert';

var geojson = function(out) {
  return JSON.parse(out['out.json']);
};

// -add-label accepts an empty target, so a label can be made and then moved
// with no input file
function run(cmd) {
  return api.applyCommands(cmd + ' -o out.json');
}

function feature(out) {
  return geojson(out).features[0];
}

async function rejects(cmd, rxp) {
  await assert.rejects(function() {
    return run(cmd);
  }, rxp);
}

describe('mapshaper-update-label.mjs', function () {

  describe('geometry', function () {
    it('moves a knot of a curved label', async function () {
      var out = await run('-add-label coordinates=0,0,10,8,20,0 text=Ridge ' +
        '-update-label ids=0 coordinates=0,0,10,20,20,0');
      assert.deepEqual(feature(out).geometry.coordinates,
        [[0, 0], [10, 20], [20, 0]]);
    });

    it('moves the anchor of an anchored label', async function () {
      var out = await run('-add-label coordinates=0,0 text=Reno ' +
        '-update-label ids=0 coordinates=5,7');
      var f = feature(out);
      assert.equal(f.geometry.type, 'Point');
      assert.deepEqual(f.geometry.coordinates, [5, 7]);
    });

    it('an anchored label becomes a curved one when given more knots', async function () {
      var out = await run('-add-label coordinates=0,0 text=x ' +
        '-update-label ids=0 coordinates=0,0,5,5,10,0');
      assert.equal(feature(out).geometry.type, 'MultiPoint');
    });

    it('a curved label collapses to an anchor when given one pair', async function () {
      var out = await run('-add-label coordinates=0,0,5,5,10,0 text=x ' +
        '-update-label ids=0 coordinates=7,7');
      assert.equal(feature(out).geometry.type, 'Point');
    });

    it('leaves other features alone', async function () {
      var out = await run('-add-label coordinates=0,0 text=a ' +
        '-add-label coordinates=1,1 text=b ' +
        '-update-label ids=1 coordinates=9,9');
      var features = geojson(out).features;
      assert.deepEqual(features[0].geometry.coordinates, [0, 0]);
      assert.deepEqual(features[1].geometry.coordinates, [9, 9]);
    });

    it('properties are untouched, including a stored text measurement', async function () {
      var out = await run('-add-label coordinates=0,0,10,8,20,0 text=Ridge ' +
        'font-size=14 text-width=40 -update-label ids=0 coordinates=0,0,10,9,20,0');
      var d = feature(out).properties;
      assert.equal(d['label-text'], 'Ridge');
      assert.equal(d['font-size'], 14);
      // the measurement describes the text, which a move does not change; the
      // fit check re-measures the path instead
      assert.equal(d['label-text-width'], 40);
    });

    // Shapes are rewritten in place rather than re-imported, so this guards
    // against the layer reporting the extent it had before the move.
    it('bounds are recomputed, so a moved knot reaches the output extent', async function () {
      var out = await api.applyCommands('-add-label coordinates=0,0,10,8,20,0 text=Ridge ' +
        '-update-label ids=0 coordinates=0,0,10,8,500,300 -o bbox out.json');
      assert.deepEqual(geojson(out).bbox, [0, 0, 500, 300]);
    });
  });

  describe('corners', function () {
    it('are kept when the knot count is unchanged', async function () {
      var out = await run('-add-label coordinates=0,0,10,8,20,0 text=x corners=1 ' +
        '-update-label ids=0 coordinates=0,0,10,20,20,0');
      assert.equal(feature(out).properties['label-corners'], '1');
    });

    it('are replaced when given', async function () {
      var out = await run('-add-label coordinates=0,0,10,8,20,0,30,5 text=x corners=1 ' +
        '-update-label ids=0 coordinates=0,0,10,8,20,0,30,5 corners=2');
      assert.equal(feature(out).properties['label-corners'], '2');
    });

    it('are pruned when the knots they index are gone', async function () {
      var out = await run('-add-label coordinates=0,0,10,8,20,0,30,5 text=x corners=1,3 ' +
        '-update-label ids=0 coordinates=0,0,10,8,20,0');
      assert.equal(feature(out).properties['label-corners'], '1');
    });

    it('are dropped when the label is no longer a curve', async function () {
      var out = await run('-add-label coordinates=0,0,10,8,20,0 text=x corners=1 ' +
        '-update-label ids=0 coordinates=3,3');
      assert.equal('label-corners' in feature(out).properties, false);
    });
  });

  describe('errors', function () {
    it('an id is required', async function () {
      await rejects('-add-label coordinates=0,0 text=x -update-label coordinates=1,1',
        /Missing required ids/);
    });

    it('coordinates are required', async function () {
      await rejects('-add-label coordinates=0,0 text=x -update-label ids=0',
        /Missing required coordinates/);
    });

    it('only one id is accepted', async function () {
      await rejects('-add-label coordinates=0,0 text=x ' +
        '-add-label coordinates=1,1 text=y -update-label ids=0,1 coordinates=2,2',
        /single feature id/);
    });

    it('an out-of-range id is rejected', async function () {
      await rejects('-add-label coordinates=0,0 text=x -update-label ids=5 coordinates=1,1',
        /no feature with id 5/);
    });

    it('a feature that is not a label is rejected', async function () {
      await rejects('-add-shape coordinates=3,4 -update-label ids=0 coordinates=1,1',
        /is not a label/);
    });

    it('a non-point layer is rejected', async function () {
      await rejects('-rectangle bbox=0,0,1,1 -update-label ids=0 coordinates=1,1',
        /can only be updated in a point layer/);
    });

    it('unparseable coordinates are rejected', async function () {
      await rejects('-add-label coordinates=0,0 text=x -update-label ids=0 coordinates=1,nope',
        /Unable to parse coordinates/);
    });

    it('an odd number of coordinates is rejected', async function () {
      await rejects('-add-label coordinates=0,0 text=x -update-label ids=0 coordinates=1,2,3',
        /even number of coordinates/);
    });
  });
});
