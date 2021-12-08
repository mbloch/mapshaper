import utils from '../utils/mapshaper-utils';
import { error } from '../utils/mapshaper-logging';

// Map positive or negative integer ids to non-negative integer ids
export function IdLookupIndex(n, clearable) {
  var fwdIndex = new Int32Array(n);
  var revIndex = new Int32Array(n);
  var index = this;
  var setList = [];
  utils.initializeArray(fwdIndex, -1);
  utils.initializeArray(revIndex, -1);

  this.setId = function(id, val) {
    if (clearable && !index.hasId(id)) {
      setList.push(id);
    }
    if (id < 0) {
      revIndex[~id] = val;
    } else {
      fwdIndex[id] = val;
    }
  };

  this.clear = function() {
    if (!clearable) {
      error('Index is not clearable');
    }
    setList.forEach(function(id) {
      index.setId(id, -1);
    });
    setList = [];
  };

  this.clearId = function(id) {
    if (!index.hasId(id)) {
      error('Tried to clear an unset id');
    }
    index.setId(id, -1);
  };

  this.hasId = function(id) {
    var val = index.getId(id);
    return val > -1;
  };

  this.getId = function(id) {
    var idx = id < 0 ? ~id : id;
    if (idx >= n) {
      return -1; // TODO: consider throwing an error?
    }
    return id < 0 ? revIndex[idx] : fwdIndex[idx];
  };
}
