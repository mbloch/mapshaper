import { getJoinCalc } from '../join/mapshaper-join-calc';
import { getJoinFilter } from '../join/mapshaper-join-filter';
import { message, warn, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
import { cloneShape } from '../paths/mapshaper-shape-utils';
import { copyRecord } from '../datatable/mapshaper-data-utils';

// Join data from @src table to records in @dest table
export function joinTables(dest, src, join, opts) {
  return joinTableToLayer({data: dest}, src, join, opts);
}

// Join data from @src table to records in @destLyr layer.
// @join function
//    Receives index of one record in the dest table
//    Returns array of matching records in src table, or null if no matches
//
export function joinTableToLayer(destLyr, src, join, opts) {
  var dest = destLyr.data;

  if (src == dest) {
    // self-join... duplicate source records to prevent assignment problems
    // (in calc= expressions and possibly elsewhere)
    src = src.clone();
  }

  var useDuplication = !!opts.duplication,
      srcRecords = src.getRecords(),
      destRecords = dest.getRecords(),
      prefix = opts.prefix || '',
      unmatchedRecords = [],
      joinFields = getFieldsToJoin(dest.getFields(), src.getFields(), opts),
      sumFields = opts.sum_fields || [],
      calculatedFields = sumFields.concat(opts.interpolate || []),
      // copy data from fields that are not calculated
      // (todo: use calc() expressions for interpolation and summing)
      copyFields = utils.difference(joinFields, calculatedFields),
      joinCounts = new Uint32Array(srcRecords.length),
      matchCount = 0,
      collisionCount = 0,
      collisionFields = [],
      skipCount = 0,
      retn = {},
      destKey = opts.keys ? opts.keys[0] : null,
      srcKey = opts.keys ? opts.keys[1] : null,
      // Key-based joins (opts.keys present) collect the *full* set of
      // distinct unmatched key values from each side. We sort and sample
      // from the complete set when formatting the post-join message.
      unmatchedTargetKeys = new Set(),
      unusedSourceKeys = new Set(),
      srcRec, srcId, destRec, joinIds, count, filter, calc, i, j, n, m;

  // support for duplication of destination records for many-to-one joins
  var duplicateRecords, destShapes;
  if (useDuplication) {
    if (opts.calc) stop('duplication and calc options cannot be used together');
    duplicateRecords = dest.clone().getRecords();
    destShapes = destLyr.shapes || [];
  }

  if (opts.where) {
    filter = getJoinFilter(src, opts.where);
  }

  if (opts.calc) {
    calc = getJoinCalc(src, opts.calc);
  }

  // join source records to target records
  n = destRecords.length;
  for (i=0; i<n; i++) {
    destRec = destRecords[i];
    joinIds = join(i);
    if (joinIds && filter) {
      skipCount += joinIds.length;
      joinIds = filter(joinIds, destRec);
      skipCount -= joinIds.length;
    }
    for (j=0, count=0, m=joinIds ? joinIds.length : 0; j<m; j++) {
      srcId = joinIds[j];
      srcRec = srcRecords[srcId];
      // duplication mode: many-to-one joins add new features to the target layer.
      if (count > 0 && useDuplication) {
        destRec = copyRecord(duplicateRecords[i]);
        destRecords.push(destRec);
        destShapes.push(cloneShape(destShapes[i]));
      }
      if (count === 0 || useDuplication) {
        if (copyFields.length > 0) {
          // only copying the first match
          joinByCopy(destRec, srcRec, copyFields, prefix);
        }
      } else if (count == 1) {
        if (copyFields.length > 0 && !prefix) {
          findCollisionFields(destRec, srcRec, copyFields, collisionFields);
        }
        collisionCount++; // count target records with multiple joins
      }
      if (sumFields.length > 0) {
        joinBySum(destRec, srcRec, sumFields, prefix);
      }
      joinCounts[srcId]++;
      count++;
    }
    if (calc) {
      calc(joinIds, destRec);
    }
    if (count > 0) {
      matchCount++;
    } else if (destRec) {
      if (opts.unmatched) {
        // Save a copy of unmatched record, before null values from join fields
        // are added.
        unmatchedRecords.push(utils.extend({}, destRec));
      }
      collectKeySample(unmatchedTargetKeys, destRec, destKey);
      updateUnmatchedRecord(destRec, copyFields, sumFields, prefix);
    }
  }

  if (srcKey) {
    for (var si = 0; si < srcRecords.length; si++) {
      if (joinCounts[si] === 0) {
        collectKeySample(unusedSourceKeys, srcRecords[si], srcKey);
      }
    }
  }

  // Opt-in summary logging. Some commands (e.g. -divide) reuse this join
  // helper internally and don't want user-facing join diagnostics.
  if (opts.show_join_message) {
    printJoinMessage({
      matches: matchCount,
      n: n,
      joins: countJoins(joinCounts),
      m: srcRecords.length,
      skipped: skipCount,
      collisions: collisionCount,
      collisionFields: collisionFields,
      destKey: destKey,
      srcKey: srcKey,
      unmatchedTargetKeys: takeSampleKeys(unmatchedTargetKeys),
      unusedSourceKeys: takeSampleKeys(unusedSourceKeys),
      opts: opts
    });
  }

  if (opts.unjoined) {
    retn.unjoined = {
      name: 'unjoined',
      data: new DataTable(srcRecords.filter(function(o, i) {
        return joinCounts[i] === 0;
      }))
    };
  }
  if (opts.unmatched) {
    retn.unmatched = {
      name: 'unmatched',
      data: new DataTable(unmatchedRecords)
    };
  }
  return retn;
}

export function validateFieldNames(arr) {
  arr.forEach(function(name) {
    if (/:(str|num)/.test(name)) {
      stop("Unsupported use of type hints. Use string-fields= or field-types= options instead");
    }
  });
}


function countJoins(counts) {
  var joinCount = 0;
  for (var i=0, n=counts.length; i<n; i++) {
    if (counts[i] > 0) {
      joinCount++;
    }
  }
  return joinCount;
}

// Unset fields of unmatched records get null/empty values
export function updateUnmatchedRecord(rec, copyFields, sumFields, prefix) {
  joinByCopy(rec, {}, copyFields, prefix);
  joinBySum(rec, {}, sumFields, prefix);
}

/*
internal.getCountFieldName = function(fields) {
  var uniq = internal.getUniqFieldNames(fields.concat("joins"));
  return uniq.pop();
};
*/

function joinByCopy(dest, src, fields, prefix) {
  var f, f2;
  prefix = prefix || '';
  for (var i=0, n=fields.length; i<n; i++) {
    // dest[fields[i]] = src[fields[i]];
    // Use null when the source record is missing an expected value
    // TODO: think some more about whether this is desirable
    f = fields[i];
    f2 = prefix + f;
    if (Object.prototype.hasOwnProperty.call(src, f)) {
      dest[f2] = src[f];
    } else if (!Object.prototype.hasOwnProperty.call(dest, f2)) {
      dest[f2] = null;
    }
  }
}

function joinBySum(dest, src, fields, prefix) {
  var f, f2;
  prefix = prefix || '';
  for (var j=0; j<fields.length; j++) {
    f = fields[j];
    f2 = prefix + f;
    dest[f2] = (dest[f2] || 0) + (src[f] || 0);
  }
}

export function findCollisionFields(dest, src, fields, collisionFields) {
  var f;
  for (var i=0, n=fields.length; i<n; i++) {
    f = fields[i];
    if (dest[f] !== src[f] && collisionFields.indexOf(f) === -1) {
      collisionFields.push(f);
    }
  }
}

// Cap displayed samples at this many distinct values per side; small enough
// to stay scannable, large enough to reveal a pattern.
var KEY_SAMPLE_LIMIT = 5;

// Add a key value (drawn from `rec[key]`) to a Set of distinct orphan keys.
// No-op if `key` is falsy or `rec` is missing.
function collectKeySample(samples, rec, key) {
  if (!key || !rec) return;
  samples.add(rec[key]);
}

// Convert a Set of distinct orphan keys into a sorted, capped array for
// display. Sorting *before* capping is what makes the two sides line up:
// both lists show the alphabetically-first KEY_SAMPLE_LIMIT keys, so any
// shared (modulo whitespace / case / leading zeros) entries land at the
// same display index regardless of the order they appeared in the data.
function takeSampleKeys(set) {
  return Array.from(set).sort(compareKeys).slice(0, KEY_SAMPLE_LIMIT);
}

// Build a single, scannable summary of join results and emit it as one log
// call. We promote to warn() for cases that usually indicate a problem
// (no matches, or many-to-one with conflicting field values), so the GUI
// inbox / in-app console highlight them; in the CLI, warn() and message()
// render identically.
function printJoinMessage(p) {
  var unmatched = p.n - p.matches;
  var unused = p.m - p.joins;
  var lines = [formatJoinHeadline(p.matches, p.n, p.joins, p.m)];
  var detail = [];
  if (p.matches > 0 && (unmatched > 0 || unused > 0)) {
    detail.push(formatGapDetail(unmatched, unused));
  }
  if (p.skipped > 0) {
    detail.push(utils.format("%'d source%s skipped by where=", p.skipped, utils.pluralSuffix(p.skipped)));
  }
  if (p.collisions > 0) {
    var line = utils.format("%'d target%s had multiple source matches", p.collisions, utils.pluralSuffix(p.collisions));
    if (p.collisionFields.length > 0) {
      line += utils.format('; conflicting values in [%s] (kept first)', p.collisionFields.join(','));
    }
    detail.push(line);
  }
  // Only show sample keys when *both* sides have orphans -- a one-sided
  // gap is the expected shape of a subset/superset join and the samples
  // would just be noise.
  if (unmatched > 0 && unused > 0 && p.destKey && p.srcKey) {
    if (p.unmatchedTargetKeys.length > 0) {
      detail.push(formatKeySampleLine('unmatched target', p.destKey, p.unmatchedTargetKeys));
    }
    if (p.unusedSourceKeys.length > 0) {
      detail.push(formatKeySampleLine('unused source', p.srcKey, p.unusedSourceKeys));
    }
  }
  var hint = formatFlagHint(unmatched, unused, p.opts);
  if (hint) detail.push(hint);
  for (var i = 0; i < detail.length; i++) {
    lines.push('  ' + detail[i]);
  }
  var msg = lines.join('\n');
  if (p.matches === 0 || p.collisionFields.length > 0) {
    warn(msg);
  } else {
    message(msg);
  }
}

function formatJoinHeadline(matches, n, joins, m) {
  if (matches === 0) {
    return utils.format("Join: 0/%'d targets matched (no records joined)", n);
  }
  return utils.format('Join: %s, %s',
      formatRatio(matches, n, 'target'),
      formatRatio(joins, m, 'source', 'used'));
}

// e.g. "850/1000 targets matched (85%)" or "1000/1000 targets matched"
function formatRatio(num, total, noun, verb) {
  verb = verb || 'matched';
  var s = utils.format("%'d/%'d %s%s %s", num, total, noun, utils.pluralSuffix(total), verb);
  if (num < total) {
    s += ' (' + Math.round(100 * num / total) + '%)';
  }
  return s;
}

function formatGapDetail(unmatched, unused) {
  var parts = [];
  if (unmatched > 0) parts.push(utils.format("%'d target%s unmatched", unmatched, utils.pluralSuffix(unmatched)));
  if (unused > 0) parts.push(utils.format("%'d source%s unused", unused, utils.pluralSuffix(unused)));
  return parts.join(', ');
}

// e.g. Sample unmatched target keys (NAME): "Bar ", "Baz ", "Foo "
// `samples` is already sorted+capped by takeSampleKeys().
function formatKeySampleLine(label, fieldName, samples) {
  return utils.format('Sample %s keys (%s): %s',
      label, fieldName, samples.map(formatKeyValue).join(', '));
}

// Reproducible cross-environment compare: numeric ordering for numbers,
// plain code-point string compare otherwise.
function compareKeys(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  var sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// JSON-quote strings so trailing whitespace, empty strings, etc. are visible.
// Other types stringify to their JSON form (numbers, null, booleans).
function formatKeyValue(v) {
  if (v === undefined) return 'undefined';
  var s = JSON.stringify(v);
  if (typeof v === 'string' && s.length > 42) {
    s = s.slice(0, 39) + '..."';
  }
  return s;
}

function formatFlagHint(unmatched, unused, opts) {
  var needUnmatched = unmatched > 0 && !opts.unmatched;
  var needUnjoined = unused > 0 && !opts.unjoined;
  if (needUnmatched && needUnjoined) {
    return 'Add the unmatched and/or unjoined flag to keep these records as separate layers';
  }
  if (needUnmatched) {
    return 'Add the unmatched flag to keep unmatched targets as a separate layer';
  }
  if (needUnjoined) {
    return 'Add the unjoined flag to keep unused sources as a separate layer';
  }
  return null;
}

export function getFieldsToJoin(destFields, srcFields, opts) {
  var joinFields;
  if (opts.fields) {
    if (opts.fields.indexOf('*') > -1) {
      joinFields = srcFields;
    } else {
      joinFields = opts.fields;
      validateFieldNames(joinFields);
    }
  } else if (opts.calc) {
    // presence of calc= option suggests a many-to-one or many-to-many join;
    // it usually doesn't make sense to join all fields by default
    joinFields = [];
  } else {
    // If a list of fields to join is not given, try to join all of the
    // source fields
    joinFields = srcFields;
    // exclude source key field from key-based join (if fields are not given explicitly)
    if (opts.keys) {
      joinFields = utils.difference(joinFields, [opts.keys[1]]);
    }
  }
  if (!opts.force && !opts.prefix) {
    // overwrite existing fields if the "force" option is set.
    // prefix also overwrites... TODO: consider changing this
    var duplicateFields = utils.intersection(joinFields, destFields);
    if (duplicateFields.length > 0) {
      message('Same-named fields not joined without the "force" flag:', duplicateFields);
      joinFields = utils.difference(joinFields, duplicateFields);
    }
  }
  return joinFields;
}

