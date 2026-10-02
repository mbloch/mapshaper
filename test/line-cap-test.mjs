import api from '../mapshaper.js';
import assert from 'assert';

var geojson = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {name: 'a'},
    geometry: {type: 'LineString', coordinates: [[0, 0], [100, 0]]}
  }]
};

async function run(cmd) {
  var input = {'in.json': JSON.parse(JSON.stringify(geojson))};
  var out = await api.applyCommands('-i in.json ' + cmd, input);
  return String(out[Object.keys(out)[0]]);
}

describe('stroke-linecap', function() {
  it('-style sets it', async function() {
    var json = JSON.parse(await run('-style stroke-linecap=square -o out.json'));
    assert.equal(json.features[0].properties['stroke-linecap'], 'square');
  });

  it('-style rejects an unknown cap', async function() {
    await assert.rejects(run('-style stroke-linecap=pointy -o out.json'));
  });

  it('an empty value unsets it', async function() {
    var json = JSON.parse(await run('-style stroke-linecap=butt -style stroke-linecap="" -o out.json'));
    assert.equal(json.features[0].properties['stroke-linecap'], undefined);
  });

  it('is exported to SVG', async function() {
    var svg = await run('-style stroke-linecap=square -o out.svg');
    assert.ok(/<path [^>]*stroke-linecap="square"/.test(svg));
  });

  it('dashed lines default to butt caps in SVG', async function() {
    var svg = await run('-style stroke-dasharray="4 2" -o out.svg');
    assert.ok(/<path [^>]*stroke-linecap="butt"/.test(svg));
  });

  it('a dashed line keeps a cap of its own', async function() {
    var svg = await run('-style stroke-linecap=round stroke-dasharray="4 2" -o out.svg');
    assert.ok(/<path [^>]*stroke-linecap="round"/.test(svg));
    assert.ok(!/stroke-linecap="butt"/.test(svg));
    svg = await run('-style stroke-dasharray="4 2" stroke-linecap=square -o out.svg');
    assert.ok(/<path [^>]*stroke-linecap="square"/.test(svg));
  });
});
