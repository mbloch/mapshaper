import { ColorSchemePanel } from './gui-color-scheme-panel';
import { layerHasPaletteRaster } from './gui-raster-band-values';

// The 'palette' mode: the color palettes panel on a data raster (a DEM, a land
// cover raster...), which colors a band with -classify. As on a polygon
// layer, the time the panel is open is one undo state and one command in the
// session history. Closing the panel leaves the mode, and leaving the mode
// (another tool, a layer that can't take a palette) closes the panel.
// See docs/development/raster-palette-design.md
export function RasterPaletteTool(gui) {
  var targetLayer = null;
  var schemePanel = null; // made when first needed

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'palette' && layerHasPaletteRaster(getActiveLayer())) {
      turnOn();
    } else {
      turnOff();
    }
  });

  gui.model.on('update', function() {
    var lyr;
    if (!targetLayer) return;
    lyr = getActiveLayer();
    if (!layerHasPaletteRaster(lyr)) {
      gui.interaction.turnOff();
    } else if (lyr != targetLayer) {
      // another raster was selected, which the panel moves to
      turnOn();
    }
  });

  function turnOn() {
    targetLayer = getActiveLayer();
    getPanel().open(targetLayer);
  }

  function getPanel() {
    if (!schemePanel) {
      schemePanel = new ColorSchemePanel(gui, {
        onUpdate: function() {},
        onClose: function() {
          targetLayer = null;
          if (gui.interaction.getMode() == 'palette') gui.interaction.turnOff();
        }
      });
    }
    return schemePanel;
  }

  function turnOff() {
    if (!targetLayer) return;
    targetLayer = null;
    schemePanel.close();
  }

  function getActiveLayer() {
    var o = gui.model.getActiveLayer();
    return o && o.layer || null;
  }
}
