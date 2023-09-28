import utils from '../utils/mapshaper-utils';
import { error } from '../utils/mapshaper-logging';

// Map non-negative integers to non-negative integer ids
export function IdLookupIndex(n) {
  var index = new Uint32Array(n);

  this.setId = function(id, val) {
    if (id >= 0 && val >= 0 && val < n - 1) {
      index[id] = val + 1;
    } else {
      error('Invalid value');
    }
  };

  this.hasId = function(id) {
    return this.getId(id) > -1;
  };

  this.getId = function(id) {
    if (id >= 0 && id < n) {
      return index[id] - 1;
    } else {
      return -1;
      // error('Invalid index');
    }
  };
}


// Map positive or negative integer ids to non-negative integer ids
export function ArcLookupIndex(n) {
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

  this.hasId = function(id) {
    var val = this.getId(id);
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

// Support clearing the index (for efficient reuse)
export function ClearableArcLookupIndex(n) {
  var setList = [];
  var idx = new ArcLookupIndex(n);
  var _setId = idx.setId;

  idx.setId = function(id, val) {
    if (!idx.hasId(id)) {
      setList.push(id);
    }
    _setId(id, val);
  };

  idx.clear = function() {
    setList.forEach(function(id) {
      _setId(id, -1);
    });
    setList = [];
  };

  this.clearId = function(id) {
    if (!idx.hasId(id)) {
      error('Tried to clear an unset id');
    }
    _setId(id, -1);
  };

  return idx;
}
