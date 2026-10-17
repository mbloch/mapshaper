// Dataset IDs
//
// Every dataset in a catalog has a random ID (dataset.id), assigned when the
// dataset enters the catalog or is created by a split that records lineage.
// The ID never changes. It lives on the dataset rather than in dataset.info,
// so the many places that copy info cannot copy it by accident.
//
// IDs are not unique by rule: the parts of a dataset that is split to move
// layers between frames keep the original ID, so they can be rejoined later.
// The ID of a frame dataset identifies the frame (see dataset.info.frame).

var ID_CHARS = 10; // ~51 bits

export function createDatasetId() {
  var str = '';
  while (str.length < ID_CHARS) {
    str += Math.random().toString(36).slice(2);
  }
  return str.slice(0, ID_CHARS);
}

export function getDatasetId(dataset) {
  return dataset && dataset.id || null;
}

export function ensureDatasetId(dataset) {
  if (!dataset.id) {
    dataset.id = createDatasetId();
  }
  return dataset.id;
}

// Give fresh IDs to incoming datasets whose IDs are already used by datasets
// in the catalog (e.g. a snapshot imported twice), and update references to
// those IDs among the incoming datasets. Incoming datasets that share an ID
// keep sharing one, so lineage within the import is preserved.
export function rekeyIncomingDatasets(incoming, existing) {
  var used = {};
  var changed = {};
  existing.forEach(function(dataset) {
    if (dataset.id) used[dataset.id] = true;
  });
  incoming.forEach(function(dataset) {
    var id = dataset.id;
    if (!id || !used[id] || existing.includes(dataset)) return;
    if (!changed[id]) {
      changed[id] = createUnusedId(used);
    }
    dataset.id = changed[id];
  });
  incoming.forEach(function(dataset) {
    var ref = dataset.info && dataset.info.frame;
    if (ref && changed[ref] && !existing.includes(dataset)) {
      dataset.info.frame = changed[ref];
    }
  });
  return changed;
}

function createUnusedId(used) {
  var id;
  do {
    id = createDatasetId();
  } while (used[id]);
  used[id] = true;
  return id;
}
