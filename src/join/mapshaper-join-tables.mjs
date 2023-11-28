import { getJoinCalc } from '../join/mapshaper-join-calc';
import { getJoinFilter } from '../join/mapshaper-join-filter';
import { message, stop } from '../utils/mapshaper-logging';
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
//    Receives index of record in the dest table
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
      copyFields = utils.difference(joinFields, sumFields),
      joinCounts = new Uint32Array(srcRecords.length),
      matchCount = 0,
      collisionCount = 0,
      collisionFields = [],
      skipCount = 0,
      retn = {},
      srcRec, srcId, destRec, joins, count, filter, calc, i, j, n, m;

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
    joins = join(i);
    if (joins && filter) {
      skipCount += joins.length;
      joins = filter(joins, destRec);
      skipCount -= joins.length;
    }
    for (j=0, count=0, m=joins ? joins.length : 0; j<m; j++) {
      srcId = joins[j];
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

  printJoinMessage(matchCount, n,
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
  var unmatched = n - matches;
  if (matches > 0 === false) {
    message("No records could be joined");
    return;
  }
  message(utils.format("Joined data from %'d source record%s to %'d target record%s",
      joins, utils.pluralSuffix(joins), matches, utils.pluralSuffix(matches)));
  if (unmatched > 0) {
    message(utils.format('%d target record%s received no data', unmatched, utils.pluralSuffix(unmatched)));
    // message(utils.format('%d target records received no data', n-matches));
  }
  if (joins < m) {
    message(utils.format("%d/%d source records could not be joined", m-joins, m));
  }
  if (skipped > 0) {
    message(utils.format("%d/%d source records were skipped", skipped, m));
  }
  if (collisions > 0) {
    message(utils.format('%d/%d target records were matched by multiple source records (many-to-one relationship)', collisions, n));
    if (collisionFields.length > 0) {
      message(utils.format('Inconsistent values were found in field%s [%s] during many-to-one join. Values in the first joining record were used.', utils.pluralSuffix(collisionFields.length), collisionFields.join(',')));
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

