// Keep track of whether positive or negative integer ids are 'used' or not.

export function IdTestIndex(n) {
  var index = new Uint8Array(n);

  this.setId = function(id) {
    if (id < 0) {
      index[~id] |= 2;
    } else {
      index[id] |= 1;
    }
  };

  this.hasId = function(id) {
    return id < 0 ? (index[~id] & 2) == 2 : (index[id] & 1) == 1;
  };

  // clear a signed id
  this.clearId = function(id) {
    if (id < 0) {
      index[~id] &= 1; // clear reverse arc, preserve fwd arc
    } else {
      index[id] &= 2; // clear fwd arc, preserve rev arc
    }
  };

  // clear pos. and neg. ids in ids array
  this.clearIds = function(ids) {
    for (var i=0; i<ids.length; i++) {
      this.clearId(ids[i]);
    }
  };

  this.setIds = function(ids) {
    for (var i=0; i<ids.length; i++) {
      this.setId(ids[i]);
    }
  };
}
