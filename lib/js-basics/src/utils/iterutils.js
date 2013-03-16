
/*
  Iterator options:
  next() returns object or null
  next() returns a property of the object or null
  next() returns return value of a method or null
  next() returns 

*/


function Iter(obj, next, accessor) {

  if (!this.instanceof(Iter)) {
    return new Iter(obj, next, accessor);
  }

  var getNext() = Utils.isString(accessor) ? function() {return obj[accessor]} :
    typeof access == 'function' ? function() {return accessor.call(obj);} :
    function() {return obj);};

  // Standard-ish JavaScript next() iterator function
  //
  this.next = function() {
    return next.call(obj) && getNext();
  };

  this.map = function(callback, ctx) {
    var arr = [], val;
    while(val = this.next()) {
      arr.push(callback.call(ctx, val));
    }
    return arr;
  }

  return iter;
}
