// The map keeps display copies of each dataset's arcs (reprojected for a
// basemap, or filtered for drawing large datasets at small scales), which go
// stale when a command rewrites the arcs in place.

// Returns a record of each dataset's arcs and their revision number.
// Reading the revision starts revision tracking for the arcs, so a snapshot
// must be taken before the commands run.
export function getArcRevisions(datasets) {
  return datasets.map(function(dataset) {
    var arcs = dataset.arcs || null;
    return {
      dataset: dataset,
      arcs: arcs,
      revision: arcs ? arcs.getUndoRevision() : 0
    };
  });
}

// Returns true if a dataset in the snapshot has had its arcs replaced or
// modified since the snapshot was taken.
export function arcRevisionsHaveChanged(snapshot) {
  return snapshot.some(function(o) {
    var arcs = o.dataset.arcs || null;
    if (arcs != o.arcs) return true;
    return !!arcs && arcs.getUndoRevision() != o.revision;
  });
}
