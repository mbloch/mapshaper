
export function addFurnitureLayer(lyr, catalog) {
  var o = {
    info: {},
    layers: [lyr]
  };
  catalog.getDatasets().push(o);
}
