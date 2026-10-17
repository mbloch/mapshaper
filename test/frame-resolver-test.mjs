import assert from 'assert';
import api from '../mapshaper.js';

var I = api.internal;

describe('mapshaper-frame-resolver.mjs', function() {
  var catalog, frame, member, unframed;

  beforeEach(function() {
    catalog = new I.Catalog();
    frame = importRectangle([0, 0, 2, 1], {type: 'frame', width: 800});
    frame.layers[0].name = 'main';
    member = importRectangle([0, 0, 1, 1], {});
    unframed = importRectangle([0, 0, 1, 1], {});
    catalog.addDatasets([frame, member, unframed]);
    member.info.frame = frame.id;
  });

  it('getFrames() returns frames as {layer, dataset} pairs', function() {
    var frames = I.getFrames(catalog);
    assert.equal(frames.length, 1);
    assert.equal(frames[0].layer, frame.layers[0]);
    assert.equal(frames[0].dataset, frame);
  });

  it('getFrameById() and getFrameByName()', function() {
    assert.equal(I.getFrameById(catalog, frame.id).dataset, frame);
    assert.equal(I.getFrameById(catalog, 'nope'), null);
    assert.equal(I.getFrameById(catalog, null), null);
    assert.equal(I.getFrameByName(catalog, 'main').dataset, frame);
    assert.equal(I.getFrameByName(catalog, 'other'), null);
  });

  it('getFrameForDataset() follows the reference, or finds the frame in a frame dataset', function() {
    assert.equal(I.getFrameForDataset(catalog, member).dataset, frame);
    assert.equal(I.getFrameForDataset(catalog, frame).dataset, frame);
    assert.equal(I.getFrameForDataset(catalog, unframed), null);
  });

  it('getFrameForDataset() ignores a reference to a missing frame', function() {
    member.info.frame = 'missing';
    assert.equal(I.getFrameForDataset(catalog, member), null);
  });

  it('getFrameMembers() lists member datasets but not the frame dataset', function() {
    var members = I.getFrameMembers(catalog, I.getFrames(catalog)[0]);
    assert.deepEqual(members, [member]);
  });

  it('resolveFrameForDataset() falls back to the only frame for unframed datasets', function() {
    assert.equal(I.resolveFrameForDataset(catalog, unframed).dataset, frame);
    assert.equal(I.resolveFrameForDataset(catalog, null).dataset, frame);
  });

  it('resolveFrameForDataset() returns null when there is no frame', function() {
    var catalog2 = new I.Catalog();
    var d = importRectangle([0, 0, 1, 1], {});
    catalog2.addDataset(d);
    assert.equal(I.resolveFrameForDataset(catalog2, d), null);
  });
});

function importRectangle(bbox, properties) {
  return I.importGeoJSON({
    type: 'Feature',
    properties: properties,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [bbox[0], bbox[1]],
        [bbox[0], bbox[3]],
        [bbox[2], bbox[3]],
        [bbox[2], bbox[1]],
        [bbox[0], bbox[1]]
      ]]
    }
  });
}
