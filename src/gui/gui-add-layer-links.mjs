import { El } from './gui-el';
import { runGuiEditCommand } from './gui-edit-command';
import {
  DRAW_KINDS, findDrawKind, getAddLayerCommand, getNewLayerName, kindFitsLayer
} from './gui-add-layer-commands';

// The "Add labels" and "Draw" links in the layer panel: one click creates a
// layer and opens the tool that draws into it.
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
//
// Labels have a link of their own, because placing labels by hand is more
// common than drawing, and is not quite drawing. The other kinds are in a menu
// opened from "Draw".
export function AddLayerLinks(gui) {
  var row = gui.container.findChild('.layer-add-links');
  if (!row.node()) return;
  var drawKinds = DRAW_KINDS.filter(function(kind) {
    return kind.kind != 'labels';
  });
  var menuBtn = row.findChild('.draw-menu-btn');
  var menu = El('div').addClass('draw-menu').attr('role', 'menu')
    .appendTo('body').hide();

  initLink(row.findChild('.add-labels-link').attr('title', findDrawKind('labels').tip),
    findDrawKind('labels'));
  initMenu();
  gui.on('sidebar', closeMenu);

  function initMenu() {
    drawKinds.forEach(function(kind) {
      El('div').addClass('draw-menu-item').attr('role', 'menuitem')
        .attr('data-kind', kind.kind).attr('title', kind.tip).text(kind.kind)
        .appendTo(menu)
        .on('click', function() {
          closeMenu();
          startDrawing(kind);
        });
    });
    menuBtn.on('click', toggleMenu).on('keydown', function(e) {
      if (e.key == 'Enter' || e.key == ' ') {
        e.preventDefault();
        toggleMenu();
      }
    });
    document.addEventListener('mousedown', function(e) {
      if (!menuIsOpen() || menu.node().contains(e.target) ||
          menuBtn.node().contains(e.target)) return;
      closeMenu();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key == 'Escape' && menuIsOpen()) closeMenu();
    });
  }

  function initLink(link, kind) {
    link.on('click', function() {
      startDrawing(kind);
    }).on('keydown', function(e) {
      if (e.key == 'Enter' || e.key == ' ') {
        e.preventDefault();
        startDrawing(kind);
      }
    });
  }

  function menuIsOpen() {
    return menu.node().style.display != 'none';
  }

  function toggleMenu() {
    if (menuIsOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  // Below the button, left-aligned with it. The menu is attached to the body,
  // because the row of links hides its overflow.
  function openMenu() {
    var rect = menuBtn.node().getBoundingClientRect();
    menu.css('left', rect.left + window.pageXOffset - 4 + 'px');
    menu.css('top', rect.bottom + window.pageYOffset + 4 + 'px');
    menu.show();
    menuBtn.addClass('open');
  }

  function closeMenu() {
    menu.hide();
    menuBtn.removeClass('open');
  }

  function startDrawing(kind) {
    var active = gui.model.getActiveLayer();
    gui.clearMode(); // close the import dialog, if it is open
    if (active && kindFitsLayer(kind, active.layer)) {
      openTool(kind.mode);
      return;
    }
    runGuiEditCommand(gui, getAddLayerCommand(kind.geometryType,
      getNewLayerName(kind, getLayerNames())), {
      title: 'Add layer error',
      onSuccess: function() {
        // The tool opens after the command has run, because it reads the active
        // layer as it opens: the label tool arms a tool according to it, and the
        // drawing tools append to it.
        openTool(kind.mode);
      }
    });
  }

  // Opens a tool, including the one already open. setMode() does nothing when
  // the mode has not changed, which would leave the tool that clearMode() just
  // closed shut, with the arrow menu still saying it was on -- the state two
  // clicks on one link used to end in.
  function openTool(mode) {
    if (gui.interaction.getMode() == mode) {
      gui.interaction.setMode('off');
    }
    gui.interaction.setMode(mode);
  }

  function getLayerNames() {
    return gui.model.getLayers().map(function(o) {
      return o.layer.name;
    });
  }
}
