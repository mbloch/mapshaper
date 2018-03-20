
function ArcFlags(size) {
  var fwd = new Int8Array(size),
      rev = new Int8Array(size);

  this.get = function(arcId) {
    return arcId < 0 ? rev[~arcId] : fwd[arcId];
  };

  this.set = function(arcId, val) {
    if (arcId < 0) {
      rev[~arcId] = val;
    } else {
      fwd[arcId] = val;
    }
  };

  this.setUsed = function(arcId) {
    this.set(arcId, 1);
  };

  this.isUsed = function(arcId) {
    return this.get(arcId) !== 0;
  };
}
