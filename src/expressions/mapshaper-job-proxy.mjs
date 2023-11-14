
export function getIOProxy(job) {
  var obj = {
    _cache: {}
  };
  obj.addInputFile = function(filename, content) {
    obj._cache[filename] = content;
  };
  return obj;
}
