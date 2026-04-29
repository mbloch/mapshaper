// Lightweight accessors for furniture-layer metadata. Extracted from
// mapshaper-furniture.mjs so that frame-utils -- which only needs the
// type/data accessors -- doesn't form an import cycle with the
// scalebar-aware renderer registry that lives in furniture.mjs.

// @lyr dataset layer
export function getFurnitureLayerType(lyr) {
  var rec = lyr.data && lyr.data.getReadOnlyRecordAt(0);
  return rec && rec.type || null;
}

export function getFurnitureLayerData(lyr) {
  return lyr.data && lyr.data.getReadOnlyRecordAt(0);
}
