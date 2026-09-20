import { El } from './gui-el';
import { runGuiEditCommand } from './gui-edit-command';
import {
  DRAW_KINDS, getAddLayerCommand, getNewLayerName, kindFitsLayer
} from './gui-add-layer-commands';

// The "Draw" links in the layer panel: one click creates a layer and opens the
// tool that draws into it.
//
// They replace "Add empty layer", which created an inert layer of a geometry
// type chosen in a popup -- the user then had to find the tool that draws into
// it in the arrow menu, which only lists the tools that suit the active layer's
// geometry type. So adding labels to a polygon layer was one click (the label
// tool makes the layer it needs), while drawing a line beside it was a popup and
// a hunt through a menu.
//
// The links are named for the drawing rather than for the layer, because the
// drawing is what the user came to do; that a layer is created is in the tip on
// each link, and in the layer list directly below them.
export function AddLayerLinks(gui) {
  var container = gui.container.findChild('.new-layer-links');
  if (!container.node()) return;
  DRAW_KINDS.forEach(function(kind, i) {
    if (i > 0) {
      El('span').addClass('layer-menu-link-separator').html('&nbsp;·&nbsp;')
        .appendTo(container);
    }
    El('span').addClass('layer-menu-link').attr('data-kind', kind.kind)
      .attr('title', kind.tip).text(kind.kind).appendTo(container)
      .on('click', function() {
        startDrawing(gui, kind);
      });
  });

  function startDrawing(gui, kind) {
    var active = gui.model.getActiveLayer();
    gui.clearMode(); // close the import dialog, if it is open
    if (active && kindFitsLayer(kind, active.layer)) {
      openTool(gui, kind.mode);
      return;
    }
    runGuiEditCommand(gui, getAddLayerCommand(kind.geometryType,
      getNewLayerName(kind, getLayerNames(gui))), {
      title: 'Add layer error',
      onSuccess: function() {
        // The tool opens after the command has run, because it reads the active
        // layer as it opens: the label tool arms a tool according to it, and the
        // drawing tools append to it.
        openTool(gui, kind.mode);
      }
    });
  }

  // Opens a tool, including the one already open. setMode() does nothing when
  // the mode has not changed, which would leave the tool that clearMode() just
  // closed shut, with the arrow menu still saying it was on -- the state two
  // clicks on one link used to end in.
  function openTool(gui, mode) {
    if (gui.interaction.getMode() == mode) {
      gui.interaction.setMode('off');
    }
    gui.interaction.setMode(mode);
  }

  function getLayerNames(gui) {
    return gui.model.getLayers().map(function(o) {
      return o.layer.name;
    });
  }
}
