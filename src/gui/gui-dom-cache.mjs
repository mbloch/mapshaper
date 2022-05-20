export function DomCache() {
  var cache = {};
  var used = {};

  this.contains = function(html) {
    return html in cache;
  };

  this.use = function(html) {
    var el = used[html] = cache[html];
    return el;
  };

  this.cleanup = function() {
    cache = used;
    used = {};
  };

  this.add = function(html, el) {
    used[html] = el;
  };
}
