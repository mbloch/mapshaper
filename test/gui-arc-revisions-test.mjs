import api from '../mapshaper.js';
import assert from 'assert';
import { getArcRevisions, arcRevisionsHaveChanged } from '../src/gui/gui-arc-revisions';

var internal = api.internal;

function importLine() {
  return internal.importGeoJSON({
    type: 'LineString',
    coordinates: [[0, 0], [1, 0.3], [2, -0.2], [3, 0.4], [4, 0], [5, 0.3], [6, 0]]
  });
}

describe('gui-arc-revisions.mjs', function () {
  it('detects arcs smoothed in place', function () {
    var dataset = importLine();
    var arcs = dataset.arcs;
    var snapshot = getArcRevisions([dataset]);
    assert.equal(arcRevisionsHaveChanged(snapshot), false);
    api.cmd.smooth(dataset, {distance: 2, no_prefilter: true}, dataset.layers);
    assert.equal(dataset.arcs, arcs);
    assert.equal(arcRevisionsHaveChanged(snapshot), true);
  });

  it('detects arcs transformed in place', function () {
    var dataset = importLine();
    var snapshot = getArcRevisions([dataset]);
    dataset.arcs.transformPoints(function(x, y) { return [x + 1, y]; });
    assert.equal(arcRevisionsHaveChanged(snapshot), true);
  });

  it('detects replaced or removed arcs', function () {
    var a = importLine(), b = importLine();
    var snapshot = getArcRevisions([a, b]);
    a.arcs = importLine().arcs;
    assert.equal(arcRevisionsHaveChanged(snapshot), true);
    snapshot = getArcRevisions([a, b]);
    delete b.arcs;
    assert.equal(arcRevisionsHaveChanged(snapshot), true);
  });

  it('ignores datasets without arcs and unchanged arcs', function () {
    var points = internal.importGeoJSON({type: 'Point', coordinates: [1, 1]});
    var line = importLine();
    var snapshot = getArcRevisions([points, line]);
    line.arcs.getBounds();
    assert.equal(arcRevisionsHaveChanged(snapshot), false);
  });
});
