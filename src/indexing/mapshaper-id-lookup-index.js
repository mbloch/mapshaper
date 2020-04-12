// Map positive or negative integer ids to non-negative integer ids
import utils from '../utils/mapshaper-utils';

export function IdLookupIndex(n) {
  var fwdIndex = new Int32Array(n);
  var revIndex = new Int32Array(n);
  utils.initializeArray(fwdIndex, -1);
  utils.initializeArray(revIndex, -1);

  this.setId = function(id, val) {
    if (id < 0) {
      revIndex[~id] = val;
    } else {
      fwdIndex[id] = val;
    }
  };

  this.getId = function(id) {
    var idx = id < 0 ? ~id : id;
    if (idx >= n) {
      return -1; // TODO: consider throwing an error?
    }
    return id < 0 ? revIndex[idx] : fwdIndex[idx];
  };
}
