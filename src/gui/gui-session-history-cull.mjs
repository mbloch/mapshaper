export function cullCommandHistory(commands, parseCommand, isStyleProperty) {
  var out = [];
  (commands || []).forEach(function(cmd) {
    addCommand(out, cmd, parseCommand, isStyleProperty);
  });
  return out;
}

function addCommand(commands, cmd, parseCommand, isStyleProperty) {
  var curr = getCullableCommand(cmd, parseCommand, isStyleProperty);
  var prev;
  if (!curr) {
    commands.push(cmd);
    return;
  }
  while (commands.length > 0) {
    prev = getCullableCommand(commands[commands.length - 1], parseCommand, isStyleProperty);
    if (!prev || !commandCanCull(curr, prev)) break;
    commands.pop();
  }
  commands.push(cmd);
}

function commandCanCull(curr, prev) {
  if (curr.type != prev.type || curr.target != prev.target || curr.ids != prev.ids) {
    return false;
  }
  if (curr.type == 'style') {
    return isSuperset(curr.fields, prev.fields);
  }
  return curr.key == prev.key;
}

function getCullableCommand(str, parseCommand, isStyleProperty) {
  var parsed, cmd, opts;
  if (!parseCommand || !isStyleProperty) return null;
  try {
    parsed = parseCommand(str);
  } catch(e) {
    return null;
  }
  if (!parsed || parsed.length != 1) return null;
  cmd = parsed[0];
  opts = cmd.options || {};
  if (cmd.name == 'style' || cmd.name == 'svg-style') {
    return getStyleCullInfo(opts, isStyleProperty);
  }
  if (cmd.name == 'classify') {
    return getClassifyCullInfo(opts);
  }
  return null;
}

function getStyleCullInfo(opts, isStyleProperty) {
  var fields;
  if (opts.clear || opts.where) return null;
  fields = getStyleFields(opts, isStyleProperty);
  if (fields.length === 0) return null;
  return {
    type: 'style',
    target: getTargetKey(opts),
    ids: getIdsKey(opts),
    fields: fields
  };
}

function getStyleFields(opts, isStyleProperty) {
  var fields = [];
  Object.keys(opts).forEach(function(name) {
    var field = name.replace(/_/g, '-');
    if (isStyleProperty(field) && fields.indexOf(field) == -1) {
      fields.push(field);
    }
  });
  return fields.sort();
}

function getClassifyCullInfo(opts) {
  if (opts.where || !classifyIsRandomFill(opts)) return null;
  return {
    type: 'classify',
    target: getTargetKey(opts),
    ids: getIdsKey(opts),
    key: 'random-fill'
  };
}

function classifyIsRandomFill(opts) {
  return opts.colors == 'random' && opts.method == 'non-adjacent' &&
    !opts.field && !opts.values && !opts['save-as'] && !opts.save_as;
}

function getTargetKey(opts) {
  return opts.target ? String(opts.target) : '';
}

function getIdsKey(opts) {
  var ids;
  if (!opts.ids) return '';
  if (Array.isArray(opts.ids)) {
    return opts.ids.concat().sort(function(a, b) {return a - b;}).join(',');
  }
  ids = String(opts.ids).split(',').map(Number);
  if (ids.every(isFinite)) {
    return ids.sort(function(a, b) {return a - b;}).join(',');
  }
  return String(opts.ids);
}

function isSuperset(a, b) {
  for (var i=0; i<b.length; i++) {
    if (a.indexOf(b[i]) == -1) return false;
  }
  return true;
}
