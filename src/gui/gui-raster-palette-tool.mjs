import { ColorSchemePanel } from './gui-color-scheme-panel';
import { layerHasPaletteRaster, getRasterLayerPaletteKey } from './gui-raster-band-values';

// The 'palette' mode: the color palettes panel on a data raster (a DEM, a land
// cover raster...), which colors a band with -classify. As on a polygon
// layer, the time the panel is open is one undo state and one command in the
// session history. Closing the panel leaves the mode, and leaving the mode
// (another tool, a layer that can't take a palette) closes the panel.
// Selecting another raster moves the panel to it if it has a palette already;
// otherwise the mode closes, rather than coloring the raster.
// See docs/development/raster-palette-design.md
export function RasterPaletteTool(gui) {
  var targetLayer = null;
  var schemePanel = null; // made when first needed
  var moving = false; // the panel is closing on one layer to open on another

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
    if (lyr == targetLayer) return;
    if (layerHasPaletteRaster(lyr) && getRasterLayerPaletteKey(lyr)) {
      moving = true;
      try {
        turnOn();
      } finally {
        moving = false;
      }
    } else {
      gui.interaction.turnOff();
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
          if (moving) return;
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
