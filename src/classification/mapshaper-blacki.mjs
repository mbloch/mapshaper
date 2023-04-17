import utils from '../utils/mapshaper-utils';
import { error } from '../utils/mapshaper-logging';

export function getBlackiClassifier(lyr, dataField) {
	var records = lyr.data.getRecords();
  // classes are integers, dataIds can be any scalar
  var dataToClassIndex = {};
  var classToDataIndex = [];
  var classCount = 0;

  records.forEach(function(rec, recId) {
    var dataIds = rec[dataField];
    var thisClass = -1;
    var thatClass, dataId;

    if (!Array.isArray(dataIds)) return;

    for (var i=0; i<dataIds.length; i++) {
      dataId = dataIds[i];
      thatClass = dataId in dataToClassIndex ? dataToClassIndex[dataId] : -1;
      if (thatClass == -1) {
        if (thisClass == -1) {
          thisClass = classCount++;
        }
        if (Array.isArray(classToDataIndex[thisClass])) {
          if (!classToDataIndex[thisClass].includes(dataId)) {
            classToDataIndex[thisClass].push(dataId);
          }
        } else {
          classToDataIndex[thisClass] = [dataId];
        }
        dataToClassIndex[dataId] = thisClass;

      } else {

        if (thisClass == -1) {
          thisClass = thatClass;
        } else if (thisClass > thatClass) {
          mergeClassIntoClass(thisClass, thatClass);
          thisClass = thatClass;
        } else if (thisClass < thatClass) {
          mergeClassIntoClass(thatClass, thisClass);
        }
      }
    }
  });

  var remapTable = compressClassIds();
  var classIds = records.map(function(rec) {
    var ids = rec[dataField];
    if (!Array.isArray(ids) || ids.length === 0) return -1;
    // TODO: assert that ids all belong to the same class
    if (ids[0] in dataToClassIndex === false) {
      error('Internal error');
    }
    return remapTable[dataToClassIndex[ids[0]]];
  });

  classToDataIndex = null;
  dataToClassIndex = null;

  return function(recId) {
    return classIds[recId];
  };

  function compressClassIds() {
    var newId = -1;
    return classToDataIndex.map(function(d, oldId) {
      if (d !== null) newId++;
      return newId;
    });
  }

  function mergeClassIntoClass(fromId, toId) {
    classToDataIndex[fromId].forEach(function(dataId) {
      dataToClassIndex[dataId] = toId;
    });
    classToDataIndex[toId] = utils.uniq(classToDataIndex[toId].concat(classToDataIndex[fromId]));
    classToDataIndex[fromId] = null;
  }
}
