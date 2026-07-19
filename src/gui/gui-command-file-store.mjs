export function CommandFileStore() {
  var files = Object.create(null);

  this.add = function(name, content) {
    var replaced = Object.prototype.hasOwnProperty.call(files, name);
    files[name] = content;
    return replaced;
  };

  this.getNames = function() {
    return Object.keys(files);
  };

  this.getInputCache = function() {
    var cache = Object.create(null);
    Object.keys(files).forEach(function(name) {
      cache[name] = files[name];
    });
    return cache;
  };
}
