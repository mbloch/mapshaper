// Options of a -frame command that shows and hides a frame's layers, for a run
// of visibility changes that is recorded as one command
// members: [{ref, start, prev, next}] for each of the frame's layers: its
//   reference in a layer list, and whether it is hidden at the start of the
//   run, before this change and after it
// formatValue: formats a list of refs as an option value
// Returns {run, record}: run changes the layers from where they are to next,
//   and from start as well (as when a command before it hasn't run yet);
//   record changes them from start, as the run's command in the history;
//   '' if there is nothing to change
export function getFrameVisibilityOptions(members, formatValue) {
  var run = {hide: [], show: []};
  var record = {hide: [], show: []};
  members.forEach(function(m) {
    var key = m.next ? 'hide' : 'show';
    if (!!m.next != !!m.start) record[key].push(m.ref);
    if (!!m.next != !!m.start || !!m.next != !!m.prev) run[key].push(m.ref);
  });
  return {
    run: formatOptions(run, members.length, formatValue),
    record: formatOptions(record, members.length, formatValue)
  };
}

function formatOptions(lists, memberCount, formatValue) {
  var opts = [];
  if (lists.hide.length > 0) opts.push('hide-layers=' + formatList(lists.hide, memberCount, formatValue));
  if (lists.show.length > 0) opts.push('show-layers=' + formatList(lists.show, memberCount, formatValue));
  return opts.join(' ');
}

function formatList(refs, memberCount, formatValue) {
  return refs.length == memberCount ? '*' : formatValue(refs.join(','));
}
