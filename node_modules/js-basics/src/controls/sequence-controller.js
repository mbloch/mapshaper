/* @requires events */

function SequenceController(keys, opts) {
  opts = opts || {};
  var id = opts.id || 0;
  var circular = opts.circular || false;

  function nextId() {
    if (i < keys.length - 1) {
      return id + 1;
    }
    else if (circular) {
      return 0;
    }
    else {
      return id;
    }
  }

  function prevId() {
    if (id > 0) {
      return id - 1;
    } 
    else if (circular) {
      return keys.length - 1;
    } 
    else {
      return id;
    }
  }

  this.hasPrev = function() {
    return prevId() != id;
  };

  this.hasNext = function() {
    return nextId() != id;
  };

  this.prev = function() {
    id = prevId();
  };

  this.next = function() {
    id = nextId();
  };

  this.getId = function() {
    return id;
  };

  this.getKey = function() {
    return keys[id];
  };

}