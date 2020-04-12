import { getJoinCalc } from '../join/mapshaper-join-calc';
import { getJoinFilter } from '../join/mapshaper-join-filter';
import { message, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { DataTable } from '../datatable/mapshaper-data-table';

// Join data from @src table to records in @dest table
// @join function
//    Receives index of record in the dest table
//    Returns array of matching records in src table, or null if no matches
//
export function joinTables(dest, src, join, opts) {
  var srcRecords = src.getRecords(),
      destRecords = dest.getRecords(),
      prefix = opts.prefix || '',
      unmatchedRecords = [],
      joinFields = getFieldsToJoin(dest.getFields(), src.getFields(), opts),
      sumFields = opts.sum_fields || [],
      copyFields = utils.difference(joinFields, sumFields),
      joinCounts = new Uint32Array(srcRecords.length),
      matchCount = 0,
      collisionCount = 0,
      collisionFields = [],
      skipCount = 0,
      retn = {},
      srcRec, srcId, destRec, joins, count, filter, calc, i, j, n, m;

  if (opts.where) {
    filter = getJoinFilter(src, opts.where);
  }

  if (opts.calc) {
    calc = getJoinCalc(src, opts.calc);
  }

  // join source records to target records
  for (i=0, n=destRecords.length; i<n; i++) {
    destRec = destRecords[i];
    joins = join(i);
    if (joins && filter) {
      skipCount += joins.length;
      joins = filter(joins, destRec);
      skipCount -= joins.length;
    }
    for (j=0, count=0, m=joins ? joins.length : 0; j<m; j++) {
      srcId = joins[j];
      srcRec = srcRecords[srcId];
      if (count === 0) {
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
      calc(joins, destRec);
    }
    if (count > 0) {
      matchCount++;
    } else if (destRec) {
      if (opts.unmatched) {
        // Save a copy of unmatched record, before null values from join fields
        // are added.
        unmatchedRecords.push(utils.extend({}, destRec));
      }
      updateUnmatchedRecord(destRec, copyFields, sumFields, prefix);
    }
  }

  printJoinMessage(matchCount, destRecords.length,
      countJoins(joinCounts), srcRecords.length, skipCount, collisionCount, collisionFields);

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

function printJoinMessage(matches, n, joins, m, skipped, collisions, collisionFields) {
  // TODO: add tip for troubleshooting join problems, if join is less than perfect.
  if (matches > 0 === false) {
    message("No records could be joined");
    return;
  }
  message(utils.format("Joined data from %'d source record%s to %'d target record%s",
      joins, utils.pluralSuffix(joins), matches, utils.pluralSuffix(matches)));
  if (matches < n) {
    message(utils.format('%d/%d target records received no data', n-matches, n));
  }
  if (joins < m) {
    message(utils.format("%d/%d source records could not be joined", m-joins, m));
  }
  if (skipped > 0) {
    message(utils.format("%d/%d source records were skipped", skipped, m));
  }
  if (collisions > 0) {
    message(utils.format('%d/%d target records were matched by multiple source records', collisions, n));
    if (collisionFields.length > 0) {
      message(utils.format('Found inconsistent values in field%s [%s] during many-to-one join', utils.pluralSuffix(collisionFields.length), collisionFields.join(', ')));
    }
  }
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
    joinFields = utils.difference(joinFields, destFields);
  }
  return joinFields;
}

