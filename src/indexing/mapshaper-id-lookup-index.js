// Map positive or negative integer ids to non-negative integer ids
import utils from '../utils/mapshaper-utils';
import { error } from '../utils/mapshaper-logging';

export function IdLookupIndex(n, clearable) {
  var fwdIndex = new Int32Array(n);
  var revIndex = new Int32Array(n);
  var setList = [];
  utils.initializeArray(fwdIndex, -1);
  utils.initializeArray(revIndex, -1);

  this.setId = function(id, val) {
    if (clearable && !this.hasId(id)) {
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
      this.setId(id, -1);
    }, this);
    setList = [];
  };

  this.clearId = function(id) {
    if (!this.hasId) {
      error('Tried to clear an unset id');
    }
    this.setId(id, -1);
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
