export function logStartupCleanup(opts) {
  opts = opts || {};
  var count = opts.count || 0;
  if (!count || typeof console == 'undefined' || !console.log) return;
  var sessionCount = opts.sessionCount || 0;
  var singular = opts.singular || 'item';
  var plural = opts.plural || singular + 's';
  var itemLabel = count == 1 ? singular : plural;
  var msg = '[mapshaper] startup cleanup reclaimed ' + count + ' ' + itemLabel;
  if (sessionCount > 0) {
    msg += ' from ' + sessionCount + ' stale session' + (sessionCount == 1 ? '' : 's');
  }
  if (opts.sizeBytes > 0) {
    msg += ' (' + formatCleanupSize(opts.sizeBytes) + ')';
  }
  console.log(msg);
}

export function formatCleanupSize(bytes) {
  var kb = Math.round(bytes / 1000);
  var mb = (bytes / 1e6).toFixed(1);
  if (!kb) return '';
  if (kb < 990) return kb + 'kB';
  return mb + 'MB';
}
