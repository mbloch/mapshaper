import require from '../mapshaper-require';

var cache = {};
export function fetchFileSync(url) {
  if (url in cache) return cache[url];
  var res  = require('sync-request')('GET', url, {timeout: 2000});
  var content = res.getBody().toString();
  cache[url] = content;
  return content;
}
