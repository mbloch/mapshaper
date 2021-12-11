import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';
import { getDatasetCRS, getCRS, requireProjectedDataset } from '../crs/mapshaper-projections';

cmd.shapes = function(lyr, dataset, opts) {
  requireProjectedDataset(dataset);
};

function makeShape(type, center, opts) {

}

function makeCircle(center, opts) {

}

function makeRegularPolygon(center, maxLen, sideCount, opts) {

}

function makeStar(center, outerLen, innerLen, opts) {

}
