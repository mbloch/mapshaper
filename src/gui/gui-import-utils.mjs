import { showPrompt } from './gui-alert';
import { internal } from './gui-core';

export async function considerReprojecting(gui, dataset, opts) {
  var mapCRS = gui.map.getActiveLayerCRS();
  var dataCRS = internal.getDatasetCRS(dataset);
  if (!dataCRS || !mapCRS || internal.crsAreEqual(mapCRS, dataCRS)) return;
  var msg = `The input file ${dataset?.info?.input_files[0] || ''} has a different projection from the current selected layer. Would you like to reproject it to match?`;
  var reproject = await showPrompt(msg, 'Reproject file?');
  if (reproject) {
    internal.projectDataset(dataset, dataCRS, mapCRS, {densify: true});
  }
}
