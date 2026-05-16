export function makeStylePresetId(styles, prefix, name) {
  var base = prefix + '-' + makeSlug(name);
  var ids = (styles || []).reduce(function(memo, item) {
    if (item && item.id) memo[item.id] = true;
    if (item && !item.id && item.name) memo[prefix + '-' + makeSlug(item.name)] = true;
    return memo;
  }, {});
  var id = base;
  var i = 2;
  while (ids[id]) {
    id = base + '-' + i++;
  }
  return id;
}

export function makeSlug(str) {
  var slug = String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'style';
}
