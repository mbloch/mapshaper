import { getDefaultFontName, getFontStyleVariants, getInstalledFonts,
  getNearestFontStyleVariant, getNewLabelFontName,
  variantIsRegular } from './gui-label-fonts';
import { ColorPicker, isHexColor } from './gui-color-picker';
import { StylePresetControl } from './gui-style-preset-control';
import { SizeField } from './gui-size-field';
import {
  claimFieldKeys, isTextInput, releasePanelFocus
} from './gui-panel-focus';
import {
  makeColorField, makeOpacityInput, makePanelButton, makePanelSection,
  setPanelButtonDisabled
} from './gui-panel-controls';
import { parseOpacityValue, formatOpacityPct } from './gui-style-values';
import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { quoteCommandValue } from './gui-command-utils';
import {
  getNewLabelStyle, updateNewLabelStyle, getLabelTextSession,
  getLabelPositionMode, setLabelPositionMode, getToggleState
} from './gui-label-style-state';
import { getTextCentreOffset, getNearestPosition } from './gui-label-offset';

var fontField = 'font-family';
var fontSizeField = 'font-size';
var fontStyleField = 'font-style';
var fontWeightField = 'font-weight';
var fillField = 'fill';
var opacityField = 'opacity';
var letterSpacingField = 'letter-spacing';
var lineHeightField = 'line-height';
var textAnchorField = 'text-anchor';
var labelAlignField = 'label-align';
var cssField = 'css';
var iconField = 'icon';
var iconSizeField = 'icon-size';
var iconColorField = 'icon-color';
var iconOpacityField = 'icon-opacity';
var defaultFontSize = 12;
var defaultFontStyle = 'normal';
var defaultFontWeight = '400';
var defaultLabelColor = '#000000';
var defaultIconColor = '#000000';
var defaultIconSize = 5;
// The line height field shows this rather than renderLabel()'s 1.1em default,
// and shows it as a placeholder rather than a value, so that a label carries
// no line-height until one is chosen. "auto" is the honest description of a
// blank field: something else decides.
var lineHeightPlaceholder = 'auto';
// What a control shows for a selection whose labels disagree about it. One
// word, used in every field and menu that can be in that state: the panel
// otherwise says it by showing nothing, which is also what an unset property
// looks like.
var MIXED_TEXT = 'mixed';
var labelStyleMode = 'label_style';
var labelStylePanelMode = 'label_style_tool';
var labelMode = 'label';
var savedStylesKey = 'label_styles';
var savedStyleFields = [
  fontField,
  fontSizeField,
  fontStyleField,
  fontWeightField,
  fillField,
  opacityField,
  letterSpacingField,
  lineHeightField,
  labelAlignField,
  cssField,
  'label-pos',
  iconField,
  iconSizeField,
  iconColorField,
  iconOpacityField
];
var labelPositions = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
// The position an icon moves a centred label to when it is switched on: upper
// right, the conventional first choice for a point label and the one a
// cartographer would have to undo least often.
var labelPositionBesideIcon = 'ne';
// What a drag on a label's glyphs means. This belongs to the tool rather than
// to the label -- nothing here is written to a record, and it is left out of
// the saved styles for that reason. See getLabelPositionMode().
var labelDragModes = [{
  name: 'fixed',
  label: 'Fixed',
  title: 'Dragging a label moves it, text and anchor together'
}, {
  name: 'draggable',
  label: 'Draggable',
  title: 'Dragging a label\'s text offsets it from its anchor'
}];
// No "none" among the shapes: whether a label has a symbol at all is what the
// section's toggle says, which leaves these four to answer only which one.
var iconTypes = [{
  name: 'circle'
}, {
  name: 'square'
}, {
  name: 'star'
}, {
  name: 'ring'
}];
var defaultIconShape = 'circle';
// Alignment writes label-align rather than text-anchor, because text-anchor
// answers two questions at once -- how the lines line up with each other and
// where the block of them sits -- and this control is only asking the first.
// See svg-label-align.mjs.
var labelAlignments = [{
  name: 'left',
  title: 'align left'
}, {
  name: 'center',
  title: 'align center'
}, {
  name: 'right',
  title: 'align right'
}];
// Three lines of unequal length, ragged on the side the text is not aligned to.
// The raggedness has to be the whole difference between the three glyphs, so
// the short lines are short: at 13px a couple of pixels of inset reads as
// nothing.
// For reading a drawn label back into the control: an unaligned label is drawn
// with the justification its position or the SVG default implies, and that is
// the button to light.
var anchorAlignments = {
  start: 'left',
  middle: 'center',
  end: 'right'
};
var alignButtonSymbols = {
  left: '<line x1="3" y1="4.5" x2="13" y2="4.5"></line><line x1="3" y1="8" x2="8" y2="8"></line><line x1="3" y1="11.5" x2="11" y2="11.5"></line>',
  center: '<line x1="3" y1="4.5" x2="13" y2="4.5"></line><line x1="5.5" y1="8" x2="10.5" y2="8"></line><line x1="4" y1="11.5" x2="12" y2="11.5"></line>',
  right: '<line x1="3" y1="4.5" x2="13" y2="4.5"></line><line x1="8" y1="8" x2="13" y2="8"></line><line x1="5" y1="11.5" x2="13" y2="11.5"></line>'
};
var iconButtonSymbols = {
  circle: '<circle cx="8" cy="8" r="4.25"></circle>',
  square: '<rect x="4" y="4" width="8" height="8"></rect>',
  ring: '<circle cx="8" cy="8" r="3.8"></circle>',
  star: '<path d="M8 3.2l1.18 2.92 3.14.22-2.42 2 .76 3.06L8 9.75 5.34 11.4l.76-3.06-2.42-2 3.14-.22L8 3.2z"></path>'
};

export function LabelTool(gui) {
  // Label styling is opened from the point styling entry point.
  var textBtn = El('div').hide();
  var parent = gui.container.findChild('.mshp-main-map');
  // label-style-panel carries the styling the point and layer panels share; the
  // second class is this panel's own, as theirs are
  var panel = El('div').addClass('label-style-panel text-style-panel rollover').appendTo(parent).hide();
  var presetControl, fontSelect, fontStyleSelect, fontSizeInput, colorFieldBox, colorChit, colorInput, colorPicker, opacityInput, letterSpacingInput, lineHeightInput, alignBtns, cssInput, posBtns, dragModeBtns, iconToggle, iconGroupEl, iconBtns, iconSizeInput, iconColorFieldBox, iconColorChit, iconColorInput, iconColorPicker, iconOpacityInput, editingStatus, clearLink, closeBtn, hit;
  var fontOptionsRendered = false;
  // The shape the toggle turns back on, so that switching a symbol off and on
  // again does not silently change a star into a circle.
  var lastIconShape = defaultIconShape;

  initPanel();
  gui.addMode(labelStylePanelMode, turnOn, turnOff);
  // Panel visibility is derived rather than toggled, because two modes can ask
  // for it -- the label_style entry point through its own GUI mode, and the
  // label tool, which owns the GUI mode itself -- and either can end while the
  // other is still on. Registering after addMode() means turnOff() has already
  // run by the time this recomputes.
  gui.on('mode', updatePanelVisibility);
  gui.model.on('update', updateVisibility);
  gui.model.on('update', function() {
    if (panel.visible()) updateControls();
    setTimeout(updateSelectionDisplay, 0);
  });
  gui.on('undo_redo_post', function() {
    if (panel.visible()) {
      updateControls();
      updateSelectionDisplay();
    }
  });
  gui.on('label_text_session_change', function() {
    // a label opened for typing becomes what the controls act on
    if (panel.visible()) updateControls();
  });
  gui.on('label_position_mode_change', function() {
    // The tool sets the mode back to Fixed when it opens, and the toggle is
    // the only thing on screen that says which of the two is on.
    if (panel.visible()) updateDragModeButtons();
  });
  gui.on('interaction_mode_change', function(e) {
    if (gui.getMode() == labelStylePanelMode && e.mode != labelStyleMode) {
      gui.clearMode(); // runs turnOff(), which recomputes visibility
    } else {
      updatePanelVisibility();
    }
  });

  hit = gui.map.getHitControl && gui.map.getHitControl();
  if (hit) {
    hit.on('change', function(e) {
      if (e.mode == labelStyleMode || e.mode == labelMode) {
        updateSelectionDisplay();
        updateControls();
      }
    });
  }

  updateVisibility();

  this.open = function(lyr, dataset) {
    if (!lyr || !internal.layerHasLabels(lyr)) return;
    if (!gui.map.isActiveLayer(lyr)) {
      modelSelectLayer(lyr, dataset);
    }
    if (gui.getMode() == labelStylePanelMode) {
      showPanel();
    } else {
      gui.enterMode(labelStylePanelMode);
    }
  };

  function initPanel() {
    // A label being typed into keeps the caret while the panel is used. Most of
    // these controls are divs and spans, which take focus from the textarea on
    // mousedown without wanting it, and the editing session ends when the
    // textarea is blurred. Refusing the focus change is what lets the user set
    // a font and carry on typing; the real form elements below are allowed to
    // take focus and hand it back (see releaseFocus).
    panel.node().addEventListener('mousedown', function(e) {
      if (!isFormElement(e.target) && getLabelTextSession(gui)) {
        e.preventDefault();
      }
    });

    // The catch-all for the controls that do take focus and then do not set a
    // style -- the colour picker's Close button is the one that exists. Runs
    // after the control's own handler, and leaves focus alone if it is in
    // something the user is typing into, such as the CSS field.
    //
    // A click on a <select> is left alone too. That click has just opened the
    // menu, and a native menu closes as soon as its element loses focus, so
    // taking the caret back here made the font menu flash open and shut. The
    // menu hands focus back by its own change handler, through
    // applyStyleValues(). Only the click on the menu itself is skipped, so
    // every other way out of a menu still returns the caret: any other control
    // either sets a style or reaches this handler with itself as the target.
    panel.node().addEventListener('click', function(e) {
      if (isTextInput(document.activeElement) || opensAMenu(e.target)) return;
      releaseFocus();
    });

    // The size fields already kept the keyboard to themselves, for the reasons
    // in gui-panel-focus.mjs; this is the rest of the panel's fields.
    claimFieldKeys(panel.node(), {
      revert: updateControls,
      release: releaseFocus
    });

    var header = El('div').addClass('label-style-panel-title').appendTo(panel).text('Label styles');
    closeBtn = El('button').addClass('label-style-close').appendTo(header).text('×').on('click', function() {
      gui.clearMode();
    });

    var selectRow = El('div').addClass('label-style-selection-row').appendTo(panel);
    editingStatus = El('span').addClass('label-editing-status').appendTo(selectRow);
    clearLink = El('span').addClass('label-editing-clear colored-text').appendTo(selectRow).text('deselect').on('click', clearSelection);

    // Three sections rather than one flat stack: the text, the symbol beside
    // it, and where the two sit relative to each other. Text and Icon are
    // deliberately the same shape -- a colour and its opacity on one line, a
    // size on the line above -- so that the second reads as a variation on the
    // first rather than as a different kind of control.
    var textSection = addSection('Text');

    // The controls whose own contents say what they are -- a font name, a hex
    // colour, a percentage, a size beside a font style -- carry no label. The
    // ones that would be a bare number otherwise keep theirs.
    var fontRow = El('div').addClass('label-style-row').appendTo(textSection);
    fontSelect = El('select').attr('title', 'Font').appendTo(fontRow).on('change', function() {
      if (fontSelect.node().value) {
        applyFont(fontSelect.node().value);
      }
    });

    var styleSizeRow = El('div').addClass('label-style-row label-split-row').appendTo(textSection);
    var fontStyleRow = El('div').addClass('label-split-cell label-font-style-row').appendTo(styleSizeRow);
    fontStyleSelect = El('select').attr('title', 'Font style').appendTo(fontStyleRow).on('change', function() {
      if (fontStyleSelect.node().value) {
        applyFontStyleVariant(fontStyleSelect.node().value);
      }
    });

    var fontSizeRow = El('div').addClass('label-split-cell label-size-row').appendTo(styleSizeRow);
    fontSizeInput = new SizeField(fontSizeRow, {
      title: 'Font size in px',
      onSet: function(value) {
        applyStyleValues([[fontSizeField, value]]);
      },
      onStep: nudgeFontSize,
      onDone: releaseFocus
    });

    var colorRow = El('div').addClass('label-style-row label-split-row').appendTo(textSection);
    var textColorCell = El('div').addClass('label-split-cell label-color-row').appendTo(colorRow);
    colorChit = El('div').addClass('label-color-chit').attr('role', 'button');
    colorInput = El('input').attr('type', 'text').attr('title', 'Text color');
    colorFieldBox = makeColorField(textColorCell, colorChit, colorInput);
    colorChit.on('click', function() {
      if (this.classList.contains('disabled')) return;
      toggleColorPicker();
    });
    colorInput.on('change', function() {
      var color = colorInput.node().value.trim();
      if (color) {
        if (isHexColor(color)) {
          colorPicker.setColor(color);
        }
        applyLabelColor(color);
      }
    });
    colorPicker = initColorPicker(textColorCell, colorChit, colorInput, applyLabelColor);

    var opacityCell = El('div').addClass('label-split-cell label-opacity-row label-text-opacity-row').appendTo(colorRow);
    opacityInput = addOpacityInput(opacityCell, applyLabelOpacity);

    // Letter spacing takes the right-hand column on its own, above line
    // height: the two spacing values read as a pair there, and the left of the
    // row is where the alignment buttons go.
    var letterRow = El('div').addClass('label-style-row label-split-row').appendTo(textSection);
    El('div').addClass('label-split-cell').appendTo(letterRow);
    var letterCell = El('div').addClass('label-split-cell label-spacing-row').appendTo(letterRow);
    El('span').appendTo(letterCell).text('Letter spacing');
    letterSpacingInput = makeMeasureInput(letterCell, letterSpacingField, '0');

    var alignRow = El('div').addClass('label-style-row label-split-row').appendTo(textSection);
    var alignCell = El('div').addClass('label-split-cell label-align-row').appendTo(alignRow);
    El('span').appendTo(alignCell).text('Alignment');
    var alignGroup = El('div').addClass('label-btn-group label-align-buttons').appendTo(alignCell);
    alignBtns = {};
    labelAlignments.forEach(function(item) {
      var btn = makePanelButton(alignGroup, '', function() {
          applyLabelAlign(item.name);
        })
        .attr('data-align', item.name)
        .attr('title', item.title);
      alignBtns[item.name] = btn;
      appendAlignButtonSymbol(btn, item.name);
    });

    var lineHeightCell = El('div').addClass('label-split-cell label-spacing-row').appendTo(alignRow);
    El('span').appendTo(lineHeightCell).text('Line height');
    lineHeightInput = makeMeasureInput(lineHeightCell, lineHeightField, lineHeightPlaceholder);

    var cssRow = El('label').addClass('label-style-row label-css-row').appendTo(textSection);
    El('span').appendTo(cssRow).text('Inline CSS');
    cssInput = El('input').attr('type', 'text').appendTo(cssRow).on('change', function() {
      applyInlineCss(cssInput.node().value.trim());
    });

    // The caption for the grid and the drag-mode toggle below it, and what
    // gives Fixed|Draggable something to be an adjective of. "Position" read as
    // the label's own position -- which a drag moves in either mode -- and made
    // Fixed sound like a lock on a label that is still perfectly draggable.
    var positionRow = El('label').addClass('label-style-row').appendTo(textSection);
    El('span').appendTo(positionRow).text('Offset from anchor');

    // Whether the label has a symbol is one question and which symbol it has is
    // another, so the first is a switch on the section's heading rather than a
    // fifth shape button reading "none". Everything below it is inert while it
    // is off, which is also the honest reading of an icon-size or icon-color on
    // a label with no icon: nothing to apply it to.
    var iconSection = addSection('Icon');
    var iconTitle = iconSection.findChild('.label-style-section-title');
    iconToggle = makeToggle(iconTitle, {
      title: 'Draw a symbol at the label anchor',
      onChange: setIconOn
    });
    // The size's caption sits on the heading line, over its own column. It
    // belongs to the field in the row below, but the shapes beside that field
    // have no caption of their own, and a caption over one control of a pair
    // pushes it out of line with the other.
    El('div').addClass('label-icon-size-caption').appendTo(iconTitle).text('Size');

    var iconSizeRow = El('div').addClass('label-style-row label-split-row label-icon-shapes-row').appendTo(iconSection);
    var iconRow = El('div').addClass('label-split-cell').appendTo(iconSizeRow);
    var iconGroup = iconGroupEl = El('div').addClass('label-btn-group label-icon-buttons').appendTo(iconRow);
    iconBtns = {};
    iconTypes.forEach(function(icon) {
      var btn = makePanelButton(iconGroup, '', function() {
          applyIcon(icon.name);
        })
        .attr('data-icon', icon.name)
        .attr('title', icon.name);
      iconBtns[icon.name] = btn;
      appendIconButtonSymbol(btn, icon.name);
    });

    var sizeRow = El('div').addClass('label-split-cell label-icon-size-row').appendTo(iconSizeRow);
    iconSizeInput = new SizeField(sizeRow, {
      title: 'Symbol size in px',
      onSet: function(value) {
        applyIconSize(value);
      },
      onStep: nudgeIconSize,
      onDone: releaseFocus
    });

    var iconColorRow = El('div').addClass('label-style-row label-split-row').appendTo(iconSection);
    var iconColorCell = El('div').addClass('label-split-cell label-color-row label-icon-color-row').appendTo(iconColorRow);
    iconColorChit = El('div').addClass('label-color-chit').attr('role', 'button');
    iconColorInput = El('input').attr('type', 'text').attr('title', 'Symbol color');
    iconColorFieldBox = makeColorField(iconColorCell, iconColorChit, iconColorInput);
    iconColorChit.on('click', function() {
      if (this.classList.contains('disabled')) return;
      iconColorPicker.toggle();
    });
    iconColorInput.on('change', function() {
      var color = iconColorInput.node().value.trim();
      if (color) {
        if (isHexColor(color)) {
          iconColorPicker.setColor(color);
        }
        applyIconColor(color);
      }
    });
    iconColorPicker = initColorPicker(iconColorCell, iconColorChit, iconColorInput, applyIconColor);

    var iconOpacityCell = El('div').addClass('label-split-cell label-opacity-row label-icon-opacity-row').appendTo(iconColorRow);
    iconOpacityInput = addOpacityInput(iconOpacityCell, applyIconOpacity);

    var posRow = El('div').addClass('label-style-row label-position-row').appendTo(textSection);


    // Beside the grid rather than under it, because the two work together: the
    // grid puts a label in one of nine places around its anchor, this says
    // whether a drag may then take it somewhere else, and clicking a cell is
    // the way back from having done so.
    var dragModeGroup = El('div').addClass('label-btn-group label-drag-mode-buttons').appendTo(posRow);

    var grid = El('div').addClass('label-position-grid').appendTo(posRow);
    posBtns = {};
    labelPositions.forEach(function(pos) {
      posBtns[pos] = makePanelButton(grid, '', function() {
          applyLabelPosition(pos);
        })
        .attr('data-position', pos)
        .attr('title', pos);
    });


    dragModeBtns = {};
    labelDragModes.forEach(function(item) {
      dragModeBtns[item.name] = makePanelButton(dragModeGroup, item.label, function() {
          setLabelPositionMode(gui, item.name);
        })
        .attr('data-drag-mode', item.name)
        .attr('title', item.title);
    });

    presetControl = new StylePresetControl(panel, {
      storageKey: savedStylesKey,
      type: 'label',
      useType: false,
      saveTitle: 'Save label style',
      styleLabel: 'label style',
      getStyle: getCurrentStyle,
      applyStyle: applyStyleObject,
      getItemId: getStyleId,
      disabled: function() {
        return !controlsEnabled();
      }
    });
  }

  function appendIconButtonSymbol(btn, iconName) {
    var svg = '<svg class="label-icon-symbol" viewBox="0 0 16 16" aria-hidden="true">' +
      iconButtonSymbols[iconName] + '</svg>';
    El(svg).appendTo(btn);
  }

  function appendAlignButtonSymbol(btn, anchor) {
    var svg = '<svg class="label-align-symbol" viewBox="0 0 16 16" aria-hidden="true">' +
      alignButtonSymbols[anchor] + '</svg>';
    El(svg).appendTo(btn);
  }

  // opts.minor: a heading in the smaller grey of a row label rather than the
  // bold of Text and Icon. Label position gets one: it is a single control, and
  // giving it the weight of those two would overstate it.
  function addSection(title, opts) {
    return makePanelSection(panel, title, opts);
  }

  // A switch: a track with a knob that sits left when off and right when on,
  // which is the direction users expect and the only thing that says which
  // state is which without a label for each. A third state says that the
  // labels it is asking about disagree -- the knob sits over the join of a
  // half-and-half track, which is the panel's only control that has to show
  // "some of them" rather than a value.
  //
  // role=checkbox rather than switch, which is what it looks like: 'mixed' is a
  // legal aria-checked value for a checkbox and not for a switch, and a switch
  // reporting a mixed selection as unchecked would be telling a screen reader
  // the one thing the third state exists to avoid saying.
  function makeToggle(parent, opts) {
    var track = El('div').addClass('label-toggle').attr('role', 'checkbox').appendTo(parent);
    var state = 'off';
    var disabled = false;
    El('div').addClass('label-toggle-knob').appendTo(track);
    if (opts.title) track.attr('title', opts.title);
    // A click on a mixed switch turns everything on. It is the convention, and
    // it is the reading that reaches a state the switch can describe: the next
    // click then turns everything off, so both are one click away.
    track.on('click', function() {
      if (disabled) return;
      opts.onChange(state != 'on');
    });
    return {
      // val: 'on', 'off' or 'mixed'; anything else reads as off
      setState: function(val) {
        state = val == 'on' || val == 'mixed' ? val : 'off';
        track.classed('on', state == 'on')
          .classed('mixed', state == 'mixed')
          .attr('aria-checked', state == 'mixed' ? 'mixed' :
            state == 'on' ? 'true' : 'false');
      },
      setDisabled: function(off) {
        disabled = !!off;
        track.classed('disabled', disabled)
          .attr('aria-disabled', disabled ? 'true' : 'false');
      }
    };
  }

  function addOpacityInput(parent, action) {
    return makeOpacityInput(parent, {
      onSet: action,
      revert: updateControls
    });
  }

  // A field for an SVG length: 2, 2px, 0.1em. Blank means the property is not
  // set, and blanking a field that was set removes it -- which is the only way
  // back to the renderer's own spacing once a value has been chosen.
  function makeMeasureInput(parent, field, placeholder) {
    var input = El('input').attr('type', 'text').addClass('label-measure-input')
      .attr('placeholder', placeholder)
      // The field's own placeholder, kept because the shown one is replaced
      // while the selection disagrees -- see setMixedPlaceholder().
      .attr('data-placeholder', placeholder)
      .appendTo(parent)
      .on('change', function() {
        applyStyleValues([[field, input.node().value.trim()]]);
      });
    return input;
  }

  function turnOn() {
    if (!activeLayerHasLabels()) {
      gui.clearMode();
      return;
    }
    gui.interaction.setMode(labelStyleMode);
    showPanel();
  }

  function turnOff() {
    updatePanelVisibility(); // the label tool may still want the panel up
    if (hit) hit.clearSelection();
    if (gui.interaction.getMode() == labelStyleMode) {
      gui.interaction.turnOff();
    }
  }

  function updatePanelVisibility() {
    if (panelShouldBeVisible()) {
      showPanel();
    } else if (panel.visible()) {
      hidePanel();
    }
  }

  function panelShouldBeVisible() {
    // The label tool keeps the panel up whether or not the layer has labels, so
    // that a style can be chosen before there is a label to apply it to.
    return labelModeIsOn() || gui.getMode() == labelStylePanelMode;
  }

  function showPanel() {
    renderFontOptions();
    gui.state.label_style_panel_open = true;
    panel.show();
    // In label mode the panel belongs to the mode rather than being a thing the
    // user opened, and closing it would leave the tool half on.
    closeBtn[labelModeIsOn() ? 'hide' : 'show']();
    textBtn.addClass('selected');
    updateControls();
    updateSelectionDisplay();
  }

  function hidePanel() {
    panel.hide();
    hideColorPicker();
    gui.state.label_style_panel_open = false;
    textBtn.removeClass('selected');
    clearSelectionDisplay();
  }

  function labelModeIsOn() {
    return !!(gui.interaction && gui.interaction.getMode() == labelMode);
  }

  function updateVisibility() {
    var enabled = activeLayerHasLabels();
    textBtn.classed('disabled', !enabled);
    textBtn[enabled ? 'show' : 'hide']();
    if (!enabled && gui.getMode() == labelStylePanelMode) {
      gui.clearMode();
    }
  }

  function activeLayerHasLabels() {
    var active = gui.model.getActiveLayer();
    return !!(active && internal.layerHasLabels(active.layer));
  }

  function activeLayerIsPointLayer() {
    var active = gui.model.getActiveLayer();
    return !!(active && active.layer && active.layer.geometry_type == 'point');
  }

  function modelSelectLayer(lyr, dataset) {
    if (lyr) lyr.hidden = false;
    gui.model.selectLayer(lyr, dataset);
  }

  function renderFontOptions() {
    if (fontOptionsRendered) return;
    fontOptionsRendered = true;
    fontSelect.empty();
    // No "Default font" entry: it named a font the user could not see and
    // mapshaper could not measure. A label with no font-family of its own is
    // shown in the font the browser draws it in, under that font's own name.
    getInstalledFonts().forEach(function(group) {
      var optgroup = El('optgroup').attr('label', group.name).appendTo(fontSelect);
      group.fonts.forEach(function(fontName) {
        El('option').attr('value', fontName).appendTo(optgroup).text(fontName);
      });
    });
  }


  function clearSelection() {
    if (hit) hit.clearSelection();
    updateSelectionDisplay();
    updateControls();
  }

  function getActiveLayer() {
    var active = gui.model.getActiveLayer();
    return active && active.layer;
  }

  function getActiveTable() {
    var lyr = getActiveLayer();
    return lyr && lyr.data || null;
  }

  function getSelectionIds() {
    return hit ? hit.getSelectionIds() : [];
  }

  // The labels a control acts on: whatever is selected for styling.
  //
  // With the label tool on, an empty selection means the label about to be made
  // rather than every label on the layer -- restyling a whole layer is not what
  // a click on a font control means while labels are being placed. Outside
  // label mode an empty selection still means the whole layer, which is right
  // for a styling mode entered deliberately.
  //
  // A label open for text editing is the target on its own, ahead of the
  // styling selection, which text editing empties anyway. Setting a style
  // while typing is ordinary use rather than a corner case: a label is placed
  // empty, and its font, colour and position are usually chosen before, or
  // instead of, any of its text.
  function getTargetIds() {
    var session = getLabelTextSession(gui);
    var ids;
    // A pending label has no feature to style yet, so a control set while one
    // is open writes the style for the next label -- which is the label being
    // typed into, and which renders it immediately.
    if (session && session.id > -1) return [session.id];
    if (session) return [];
    ids = getSelectionIds();
    if (ids.length > 0) return ids;
    return labelModeIsOn() ? [] : getAllLabelIds();
  }

  // With nothing selected the controls edit the style that new labels are given,
  // so they stay live even when there is no label, and no layer, yet.
  function controlsEnabled() {
    return getTargetIds().length > 0 || labelModeIsOn();
  }

  function getAllLabelIds() {
    var lyr = getActiveLayer();
    var ids = [];
    if (!lyr) return ids;
    for (var i=0, n=internal.getFeatureCount(lyr); i<n; i++) {
      ids.push(i);
    }
    return ids;
  }

  function updateControls() {
    var ids = getTargetIds();
    var manualIds = getSelectionIds();
    var showValues = controlsEnabled();
    // With nothing selected the menu shows the font the next label will be
    // made in; with labels selected it shows the font they are drawn in, which
    // for a label carrying none is whatever sans-serif resolves to here.
    var font = getShownValue(ids, fontField,
      {useDefault: true, defaultValue: getFontNameForTarget(ids)});
    var fontSize = getShownValue(ids, fontSizeField, {useDefault: true, defaultValue: defaultFontSize});
    var fontStyleVal = getCommonValue(ids, fontStyleField, {useDefault: true, defaultValue: defaultFontStyle});
    var fontWeightVal = getCommonValue(ids, fontWeightField, {useDefault: true, defaultValue: defaultFontWeight});
    var fill = getShownValue(ids, fillField, {useDefault: true, defaultValue: defaultLabelColor});
    var opacity = getShownValue(ids, opacityField, {useDefault: true, defaultValue: 1});
    var letterSpacing = getShownValue(ids, letterSpacingField);
    var lineHeight = getShownValue(ids, lineHeightField);
    var alignVal = getCommonAlignment(ids);
    var css = getShownValue(ids, cssField);
    var posVal = getCommonValue(ids, 'label-pos');
    // From the labels that have a symbol, so that a selection where only some
    // do shows the symbols it has rather than blanking every field because the
    // rest of the selection has nothing to compare.
    var iconIds = getIconValueIds();
    var iconVal = getCommonValue(iconIds, iconField);
    var iconSize = getShownValue(iconIds, iconSizeField, {useDefault: true, defaultValue: defaultIconSize});
    var iconColor = getShownValue(iconIds, iconColorField, {useDefault: true, defaultValue: defaultIconColor});
    var iconOpacity = getShownValue(iconIds, iconOpacityField, {useDefault: true, defaultValue: 1});
    updateEditingStatus(manualIds.length, !!getLabelTextSession(gui));
    updateSavedStyleControls();
    fontSelect.node().disabled = !showValues;
    updateFontControl(font);
    updateFontStyleControls(font.value, fontStyleVal, fontWeightVal);
    updateFontSizeControls(fontSize);
    updateColorControls(fill);
    updateOpacityControl(opacityInput, opacity);
    updateMeasureControl(letterSpacingInput, letterSpacing);
    updateMeasureControl(lineHeightInput, lineHeight);
    updateAlignButtons(showValues ? alignVal : '');
    updateCssControl(css);
    updatePositionButtons(showValues ? posVal : '', ids);
    // The symbol's controls keep showing their values while the switch is off,
    // greyed: what they show is what the symbol comes back as.
    var iconOff = updateIconControls(showValues ? iconVal : '');
    updateIconSizeControls(iconSize, iconOff);
    updateIconColorControls(iconColor, iconOff);
    updateOpacityControl(iconOpacityInput, iconOpacity, iconOff);
  }

  // Every field that can show a value can also show nothing, which is why each
  // of these takes a {value, mixed} rather than a value: a field blank because
  // the selected labels disagree says so, in the placeholder, where one blank
  // because the property is unset shows what the renderer will do instead.
  function updateOpacityControl(input, shown, disabled) {
    input.node().disabled = disabled || !controlsEnabled();
    input.node().value = shown.value === '' ? '' : formatOpacityPct(shown.value);
    setMixedPlaceholder(input, shown.mixed);
  }

  function updateMeasureControl(input, shown) {
    var val = shown.value;
    input.node().disabled = !controlsEnabled();
    input.node().value = val || val === 0 ? String(val) : '';
    setMixedPlaceholder(input, shown.mixed);
  }

  // A field showing nothing because the labels disagree says "mixed" where it
  // would otherwise show its own placeholder -- the spacing fields show the
  // value the renderer uses when the property is absent, which is not what is
  // true of a mixed selection.
  function setMixedPlaceholder(input, mixed) {
    var el = input.node();
    var own = el.getAttribute('data-placeholder') || '';
    el.setAttribute('placeholder', mixed ? MIXED_TEXT : own);
  }

  // Alignment stays live whatever is selected, including nothing. It was
  // disabled for anything but a multi-line or path label, on the grounds that
  // alignment and the position grid both write text-anchor and only one of
  // them can be answering the question -- but that reserved it for labels that
  // already have a second line, when the style is usually chosen before the
  // text is typed. Choosing left-aligned and then writing two lines has to
  // work.
  function updateAlignButtons(align) {
    var disabled = !controlsEnabled();
    labelAlignments.forEach(function(item) {
      alignBtns[item.name].classed('selected', !disabled && item.name == align);
      setPanelButtonDisabled(alignBtns[item.name], disabled);
    });
  }

  function updatePositionButtons(pos, ids) {
    // Disabled for a selection of nothing but path labels, whose text runs
    // along a curve from a start offset and so has no position around an anchor
    // to take. The commands ignore a position given for one, and a disabled
    // button says so where a console warning would not.
    var disabled = !controlsEnabled() || everyLabelIsOnAPath(ids);
    var locked = !disabled && gridIsLockedToCentre(ids);
    // Faintly, and only when no cell is lit: a label carrying offsets is not
    // at any of the nine, but one of them is roughly where it is and clicking
    // it is the way back.
    var nearest = !disabled && !pos ? getNearestPositionCell(ids) : '';
    labelPositions.forEach(function(name) {
      posBtns[name].classed('selected', !disabled && name == pos);
      posBtns[name].classed('nearest', name == nearest);
      setPanelButtonDisabled(posBtns[name], disabled || locked && name != 'c');
    });
    updateDragModeButtons();
  }

  // The nine positions place text around something, so with nothing drawn at
  // the anchor the grid is locked to the centre cell: there is no answer to
  // "north-east of what?", and the centre is what -add-label gives a new label
  // anyway. The cell stays clickable, because text over its own symbol is a
  // real thing to ask for.
  //
  // The test is whether the label draws a symbol, not whether it has an icon:
  // a styled dots layer given label text by the point panel's "Create labels"
  // keeps its r and fill, and keying this on icon= alone would lock the
  // commonest labels in the app to the middle of their own dots.
  //
  // A default and a guard rather than an invariant. A label that arrives
  // positioned with nothing at its anchor -- from the CLI, from an expression,
  // from the legacy positioning mode -- is shown as it is, with the grid live:
  // refusing to display what is in the record is worse than letting an odd
  // state be edited. Dragging is not gated on a symbol either, since a labels
  // layer whose dots live in a different layer still needs its text placed.
  function gridIsLockedToCentre(ids) {
    var table = getActiveTable();
    if (!everyTargetLacksASymbol(ids)) return false;
    if (ids.length === 0) return !labelIsPlaced(getNewLabelStyle(gui));
    return ids.every(function(id) {
      return !labelIsPlaced(table && table.getRecordAt(id));
    });
  }

  // Whether a label has been put somewhere other than on top of its anchor: a
  // position of its own other than the centre one, or offsets from a drag.
  function labelIsPlaced(rec) {
    if (!rec) return false;
    if (rec['label-pos']) return rec['label-pos'] != 'c';
    return internal.hasStyleValue(rec, 'dx') ||
      internal.hasStyleValue(rec, 'dy');
  }

  function everyTargetLacksASymbol(ids) {
    var table = getActiveTable();
    if (ids.length === 0) {
      return !internal.featureHasSvgSymbol(getNewLabelStyle(gui));
    }
    return ids.every(function(id) {
      return !internal.featureHasSvgSymbol(table && table.getRecordAt(id));
    });
  }

  // Which of the nine positions a dragged label is nearest, or ''.
  //
  // Only for a single label: the cell is a hint about where one label sits,
  // and the nearest position to several of them at once is not a hint about
  // anything. Offsets are compared through the middle of the text rather than
  // through dx, which means different things at different justifications.
  function getNearestPositionCell(ids) {
    var table = getActiveTable();
    var rec = ids.length == 1 && table ? table.getRecordAt(ids[0]) : null;
    var width, drawn;
    if (!rec || !labelIsPlaced(rec)) return '';
    drawn = internal.svg.getDrawnLabelOffset(rec);
    width = internal.svg.getMeasuredTextWidth(rec) || 0;
    return getNearestPosition({
      x: getTextCentreOffset(drawn.dx, drawn['text-anchor'], width),
      y: drawn.dy
    }, labelPositions.map(function(name) {
      // The position on its own, without the record's own offsets, which win
      // over a position and would make every candidate the same point.
      var o = internal.svg.getDrawnLabelOffset({
        'label-pos': name,
        'font-size': rec['font-size']
      });
      return {
        name: name,
        x: getTextCentreOffset(o.dx, o['text-anchor'], width),
        y: o.dy
      };
    }));
  }

  // The toggle is the tool's state and not the selection's, so nothing here
  // reads a record. It is inert outside the label tool, where there is no drag
  // on a label for it to describe.
  function updateDragModeButtons() {
    var mode = getLabelPositionMode(gui);
    var disabled = !labelModeIsOn();
    labelDragModes.forEach(function(item) {
      dragModeBtns[item.name].classed('selected', !disabled && item.name == mode);
      setPanelButtonDisabled(dragModeBtns[item.name], disabled);
    });
  }

  function everyLabelIsOnAPath(ids) {
    return someLabelIsOnAPath(ids, 'every');
  }

  function anyLabelIsOnAPath(ids) {
    return someLabelIsOnAPath(ids, 'some');
  }

  function someLabelIsOnAPath(ids, method) {
    var lyr = getActiveLayer();
    var table = lyr && lyr.data;
    if (!ids || ids.length === 0 || !lyr || !lyr.shapes) return false;
    return ids[method](function(id) {
      return internal.svg.shapeIsPathLabel(lyr.shapes[id],
        table ? table.getRecordAt(id) : null);
    });
  }

  function updateEditingStatus(count, editingText) {
    editingStatus.text('Editing: ' + describeTarget(count, editingText));
    // "deselect" is for a selection the user made; a label being typed into is
    // left by clicking away or pressing Escape, not from here.
    clearLink.classed('hidden', count === 0 || editingText);
  }

  // What the controls will act on. In label mode an empty selection is the next
  // label rather than the whole layer, and saying "all" there is what would
  // make the panel untrustworthy.
  function describeTarget(count, editingText) {
    if (editingText) return 'this label';
    if (count > 0) return count + ' selected';
    return labelModeIsOn() ? 'new labels' : 'all';
  }

  function updateFontSizeControls(shown) {
    fontSizeInput.setValue(shown.value || '');
    fontSizeInput.setPlaceholder(shown.mixed ? MIXED_TEXT : '');
    fontSizeInput.setDisabled(!controlsEnabled());
  }

  function getFontNameForTarget(ids) {
    return ids.length === 0 ? getNewLabelFontName() : getDefaultFontName();
  }

  // A font the menu does not list still has to show, or the label would look
  // as though it had no font: a file can name a font that is not installed
  // here, and a project moves between machines. It is added to the menu as
  // itself rather than replaced by an installed font, since the name is the
  // user's data and choosing something else for them would restyle the label.
  function updateFontControl(shown) {
    var fontVal = shown.value;
    // A font menu is a list of fonts, so "they are in different fonts" cannot
    // be one of the fonts: it is an entry that appears only while it is true,
    // and picking it does nothing (applyFont() ignores a blank value). The
    // list stays live, so choosing a font is how the selection is brought into
    // line -- as it is for the face menu below.
    setMixedOption(fontSelect, shown.mixed);
    fontSelect.node().value = fontVal || '';
    if (fontVal && fontSelect.node().selectedIndex < 0) {
      El('option').attr('value', fontVal).text(fontVal).appendTo(fontSelect);
      fontSelect.node().value = fontVal;
    }
    // Nothing selected, rather than the first font in the list, for a target
    // there is nothing to say about -- a disabled menu with no labels behind it.
    if (!fontVal && !shown.mixed) fontSelect.node().selectedIndex = -1;
  }

  // Adds or removes a menu's "mixed" entry, which carries no value: a select
  // showing nothing looks like a control that failed to load, and this is the
  // one state the panel cannot express by lighting no button.
  //
  // First in the list, and removed as soon as the selection agrees, so that it
  // is never an option among the real ones.
  function setMixedOption(select, mixed) {
    var el = select.node();
    var first = el.options[0];
    var has = !!first && first.value === '' && first.dataset.mixed == 'true';
    if (mixed && !has) {
      first = document.createElement('option');
      first.value = '';
      first.textContent = MIXED_TEXT;
      first.dataset.mixed = 'true';
      el.insertBefore(first, el.firstChild);
    } else if (!mixed && has) {
      el.removeChild(first);
    }
  }

  // The faces the chosen font is installed with, and no entry for "whatever
  // the font is set in by default": that is Regular, which is one of the faces
  // and is named as one. With no font chosen the menu is empty and dead --
  // there are no faces to list, and a face belongs to a font.
  function updateFontStyleControls(fontName, fontStyleVal, fontWeightVal) {
    var disabled = !controlsEnabled() || !fontName;
    // Empty means the selection disagrees, here as everywhere in the panel;
    // an unset style reads as Regular, because that is what it renders as.
    var mixed = !!fontName && !(fontStyleVal && fontWeightVal);
    var shown = mixed ? null :
      getShownVariant(fontName, fontStyleVal, fontWeightVal);
    fontStyleSelect.empty();
    if (fontName) {
      getFontStyleVariants(fontName).forEach(function(variant) {
        El('option').attr('value', variant.value).appendTo(fontStyleSelect).text(variant.label);
      });
    }
    // The faces are rebuilt above, so the "mixed" entry goes on afterwards.
    setMixedOption(fontStyleSelect, mixed);
    fontStyleSelect.node().disabled = disabled;
    fontStyleSelect.node().value = shown ? shown.value : '';
    // Nothing selected rather than the first face, for a menu with no font to
    // list the faces of.
    if (!shown && !mixed) fontStyleSelect.node().selectedIndex = -1;
  }

  // The face the panel shows for a label in @fontName. A font-style and
  // font-weight the font has no face for still has to show as something, and
  // the nearest face is what the browser is rendering it as anyway.
  function getShownVariant(fontName, fontStyleVal, fontWeightVal) {
    if (!fontName) return null;
    return getNearestFontStyleVariant(fontName, fontStyleVal, fontWeightVal);
  }

  function updateColorControls(shown) {
    var colorVal = shown.value;
    var disabled = !controlsEnabled();
    colorInput.node().disabled = disabled;
    colorInput.node().value = colorVal || '';
    setMixedPlaceholder(colorInput, shown.mixed);
    colorFieldBox.classed('disabled', disabled);
    setPanelButtonDisabled(colorChit, disabled);
    // An empty swatch is how the field says "no colour", so a mixed one is
    // marked instead of being left blank to mean two things.
    colorChit.classed('mixed', shown.mixed);
    colorChit.css('background-color', isHexColor(colorVal) ? colorVal : 'transparent');
    if (colorPicker.visible()) {
      return; // avoid HSB -> RGB -> HSB rounding jumps after picker commits
    }
    if (isHexColor(colorVal)) {
      colorPicker.setColor(colorVal);
    } else {
      hideColorPicker();
    }
  }

  function updateCssControl(shown) {
    cssInput.node().disabled = !controlsEnabled();
    cssInput.node().value = shown.value || '';
    setMixedPlaceholder(cssInput, shown.mixed);
  }

  // The toggle reads the data rather than holding a state of its own: a symbol
  // is on when the target has one, which is what makes it follow an undo.
  //
  // A selection where only some labels have a symbol shows the switch mixed,
  // and the section stays usable: there are symbols in the selection to style.
  // What the controls below it then act on narrows to the labels that have one
  // -- see getIconTargetIds() -- so styling a symbol never creates one. The
  // switch is still the only way to ask for that, and clicking a shape is the
  // one thing in the section that applies to every selected label, because
  // choosing a shape for a group is a plain statement about all of it.
  function updateIconControls(iconVal) {
    var enabled = controlsEnabled();
    var state = enabled ? getIconState() : 'off';
    var off = state == 'off';
    if (iconVal) lastIconShape = iconVal;
    iconToggle.setState(state);
    iconToggle.setDisabled(!enabled);
    // The group is faded as a whole rather than button by button, so that the
    // border the buttons share fades with them -- a live border around dead
    // buttons is the one part of a disabled control that still looks usable.
    iconGroupEl.classed('disabled', off);
    iconTypes.forEach(function(icon) {
      iconBtns[icon.name].classed('selected', !off && icon.name == iconVal);
      setPanelButtonDisabled(iconBtns[icon.name], off);
    });
    return off;
  }

  function setIconOn(on) {
    applyIcon(on ? lastIconShape : '');
  }

  function updateIconSizeControls(shown, iconOff) {
    iconSizeInput.setValue(shown.value || '');
    iconSizeInput.setPlaceholder(shown.mixed ? MIXED_TEXT : '');
    iconSizeInput.setDisabled(iconOff || !controlsEnabled());
  }

  function updateIconColorControls(shown, iconOff) {
    var colorVal = shown.value;
    var disabled = iconOff || !controlsEnabled();
    iconColorInput.node().disabled = disabled;
    iconColorInput.node().value = colorVal || '';
    setMixedPlaceholder(iconColorInput, shown.mixed);
    iconColorFieldBox.classed('disabled', disabled);
    setPanelButtonDisabled(iconColorChit, disabled);
    iconColorChit.classed('mixed', shown.mixed);
    iconColorChit.css('background-color', isHexColor(colorVal) ? colorVal : 'transparent');
    if (iconColorPicker.visible()) {
      return; // avoid HSB -> RGB -> HSB rounding jumps after picker commits
    }
    if (isHexColor(colorVal)) {
      iconColorPicker.setColor(colorVal);
    } else {
      iconColorPicker.hide();
    }
  }

  function updateSavedStyleControls() {
    presetControl.update();
  }

  function getCommonValue(ids, field, opts) {
    return getCommonValueInfo(ids, field, opts).value;
  }

  // What the target labels say about one property:
  //
  //   value: the value they agree on, or '' if they do not
  //   mixed: whether they disagree
  //
  // Both, because a control showing nothing has to be able to say which of the
  // two kinds of nothing it means. Blank is also what an unset property looks
  // like -- a label carries no letter-spacing until one is chosen -- and a
  // field that reads the same either way leaves the user to guess whether the
  // selection is uniform.
  function getCommonValueInfo(ids, field, opts) {
    var table = getActiveTable();
    var records = table && table.getRecords();
    var value, val, hasValue;
    if (ids.length === 0) {
      return {value: getNewLabelValue(field, opts), mixed: false};
    }
    if (!records) return {value: '', mixed: false};
    for (var i=0; i<ids.length; i++) {
      val = records[ids[i]] && records[ids[i]][field];
      if (!val) {
        // A property nobody set reads as what it renders as, where the caller
        // says what that is: a label with font-size=12 and one with no
        // font-size are drawn the same and agree. Without a default the two
        // disagree, which is right for a property that means nothing when it
        // is absent -- one label carrying inline css and one not are not in
        // the same state.
        val = opts && opts.useDefault ? opts.defaultValue : '';
      } else {
        hasValue = true;
      }
      if (i === 0) {
        value = val;
      } else if (val != value) {
        return {value: '', mixed: true};
      }
    }
    return {
      value: hasValue || opts && opts.useDefault ? value : '',
      mixed: false
    };
  }

  // The same, as a control shows it: nothing at all, and nothing to say about
  // it, while there is no target to read.
  function getShownValue(ids, field, opts) {
    if (!controlsEnabled()) return {value: '', mixed: false};
    return getCommonValueInfo(ids, field, opts);
  }

  // The alignment the labels are *drawn* with, rather than the one they carry.
  // A label with no label-align of its own is drawn with the justification its
  // position implies, and one with no position either takes the SVG default,
  // so a control with nothing selected would be saying "no alignment" about
  // text that is plainly aligned one way or another.
  function getCommonAlignment(ids) {
    var records = getActiveTable() && getActiveTable().getRecords();
    var value, val;
    if (ids.length === 0) {
      return resolveAlignment(labelModeIsOn() ? getNewLabelStyle(gui) : null);
    }
    for (var i = 0; i < ids.length; i++) {
      val = resolveAlignment(records && records[ids[i]]);
      if (i === 0) value = val;
      else if (val != value) return '';
    }
    return value;
  }

  function resolveAlignment(rec) {
    var resolved = rec ? internal.resolveLabelPosition(rec) : null;
    var anchor = resolved && resolved[textAnchorField] || 'start';
    return anchorAlignments[anchor] || '';
  }

  // What a control shows when there is nothing to style: the value the next
  // label will be created with, falling back to the same default an existing
  // label would show.
  function getNewLabelValue(field, opts) {
    var style = labelModeIsOn() ? getNewLabelStyle(gui) : null;
    var val = style ? style[field] : '';
    if (val || val === 0) return val;
    return opts && opts.useDefault ? opts.defaultValue : '';
  }

  // Changing the font carries the face across with it: a label in Bold Italic
  // stays in Bold Italic, or in the nearest thing the new font is installed
  // with. Both go in one command, so the change is one undo step and the label
  // is never briefly in a face the font does not have.
  function applyFont(fontName) {
    var ids = getTargetIds();
    var style = getCommonValue(ids, fontStyleField, {useDefault: true, defaultValue: defaultFontStyle});
    var weight = getCommonValue(ids, fontWeightField, {useDefault: true, defaultValue: defaultFontWeight});
    var values = [[fontField, fontName]];
    var variant = getNearestFontStyleVariant(fontName, style, weight);
    if (variant && !(variant.style == style && variant.weight == weight)) {
      values = values.concat(getFontStyleValues(variant));
    }
    applyStyleValues(values);
  }

  function nudgeFontSize(delta) {
    var ids = getTargetIds();
    var size = getNumericSize(ids, fontSizeField, defaultFontSize);
    if (!controlsEnabled()) return;
    size = Math.max(1, size + delta);
    applyStyleValues([[fontSizeField, size]]);
  }

  // A face belongs to a font, so a label given one names the font it is a face
  // of. Labels made before the tool started naming fonts, and labels made by
  // the CLI, carry none: this is where the font they are already drawn in
  // stops being a guess about the machine they are opened on.
  //
  // The font named is the one they are drawn in, not the tool's preferred
  // font: choosing Bold is not a request to change the typeface. A label that
  // does not exist yet is left alone here and given its font when it is made.
  function applyFontStyleVariant(value) {
    var variant = parseFontStyleVariant(value);
    var ids = getTargetIds();
    var values;
    if (!variant) return;
    values = getFontStyleValues(variant);
    if (ids.length > 0 && !getCommonValue(ids, fontField) && getDefaultFontName()) {
      values.unshift([fontField, getDefaultFontName()]);
    }
    applyStyleValues(values);
  }

  // Regular is stored as no face at all, for the same reason full opacity is
  // stored as no opacity: normal 400 is what a font renders as when nothing
  // says otherwise, and a column of them on every label the panel has touched
  // is noise in the user's table.
  function getFontStyleValues(variant) {
    if (variantIsRegular(variant)) {
      return [[fontStyleField, ''], [fontWeightField, '']];
    }
    return [[fontStyleField, variant.style], [fontWeightField, variant.weight]];
  }

  function applyLabelColor(color) {
    applyStyleValues([[fillField, color]]);
  }

  // Full opacity is stored as no opacity at all, rather than as opacity=1: the
  // property is what makes a label translucent, and a column of 1s on every
  // label the panel has touched is noise in the user's table. -style reads the
  // empty value as "remove this".
  function applyLabelOpacity(value) {
    applyStyleValues([[opacityField, value >= 1 ? '' : value]]);
  }

  // The label-align written here replaces any text-anchor the label carries,
  // which is why the two are set together: leaving a stale text-anchor behind
  // would make the record say two things about the same question, and the
  // resolved one wins by a rule rather than by being the last thing the user
  // asked for.
  function applyLabelAlign(align) {
    var values = [[labelAlignField, align]];
    // Only blanked if there is one to blank: -style writes an empty value as a
    // field with nothing in it, and a label that never had a text-anchor
    // should not acquire an empty column for one.
    if (targetsHaveTextAnchor()) values.push([textAnchorField, '']);
    applyStyleValues(values);
  }

  function targetsHaveTextAnchor() {
    var records = getActiveTable() && getActiveTable().getRecords();
    var ids = getTargetIds();
    if (ids.length === 0) {
      return !!(labelModeIsOn() && getNewLabelStyle(gui)[textAnchorField]);
    }
    return ids.some(function(id) {
      var rec = records && records[id];
      return !!(rec && rec[textAnchorField]);
    });
  }

  function applyInlineCss(css) {
    applyStyleValues([[cssField, css || '']]);
  }

  function getStyleId(item) {
    return item.id || 'label-' + item.name;
  }

  function getCurrentStyle() {
    var style = {};
    var fontStyle = parseFontStyleVariant(fontStyleSelect.node().value);
    var icon = getSelectedIcon();
    addStyleValue(style, fontField, fontSelect.node().value);
    if (fontStyle) {
      style[fontStyleField] = fontStyle.style;
      style[fontWeightField] = fontStyle.weight;
    }
    addStyleValue(style, fontSizeField, fontSizeInput.getValue());
    addStyleValue(style, fillField, colorInput.node().value.trim());
    addStyleValue(style, opacityField, getOpacityBelowFull(opacityInput));
    addStyleValue(style, letterSpacingField, letterSpacingInput.node().value.trim());
    addStyleValue(style, lineHeightField, lineHeightInput.node().value.trim());
    addStyleValue(style, labelAlignField, getSelectedAlignment());
    addStyleValue(style, cssField, cssInput.node().value.trim());
    addStyleValue(style, 'label-pos', getSelectedLabelPosition());
    addStyleValue(style, iconField, icon);
    if (icon) {
      addStyleValue(style, iconSizeField, iconSizeInput.getValue());
      addStyleValue(style, iconColorField, iconColorInput.node().value.trim());
      addStyleValue(style, iconOpacityField, getIconOpacityToWrite());
    }
    return style;
  }

  // A saved style carries an opacity only if it has one to carry: saving at
  // 100% and applying it should not write a property the label did not have.
  function getOpacityBelowFull(input) {
    var val = parseOpacityValue(input.node().value);
    return val === null || val >= 1 ? null : val;
  }

  function addStyleValue(style, field, value) {
    if (value || value === 0) {
      style[field] = value;
    }
  }

  function getSelectedLabelPosition() {
    var out = '';
    labelPositions.forEach(function(pos) {
      if (posBtns[pos].hasClass('selected')) out = pos;
    });
    return out;
  }

  function getSelectedAlignment() {
    var out = '';
    labelAlignments.forEach(function(item) {
      if (alignBtns[item.name].hasClass('selected')) out = item.name;
    });
    return out;
  }

  function getSelectedIcon() {
    var out = '';
    iconTypes.forEach(function(icon) {
      if (iconBtns[icon.name].hasClass('selected')) out = icon.name;
    });
    return out;
  }

  function applyStyleObject(style) {
    var styles = [];
    savedStyleFields.forEach(function(field) {
      if (field in style) {
        styles.push([field, style[field]]);
      }
    });
    applyStyleValues(styles);
  }

  function parseFontStyleVariant(value) {
    var parts = String(value).split('|');
    if (parts.length != 2) return null;
    return {
      style: parts[0],
      weight: parts[1]
    };
  }

  function applyLabelPosition(pos) {
    applyStyleValues([['label-pos', pos]]);
  }

  function applyIcon(iconName) {
    var ids = getTargetIds();
    var styles = [[iconField, iconName || '']];
    if (iconName) {
      // The size the symbols in the selection already share, where they share
      // one: a shape applied to a mixed selection gives the labels that had no
      // symbol the size of the ones that did, rather than resetting them all to
      // the default.
      styles.push([iconSizeField, getNumericSize(getIconValueIds(), iconSizeField, defaultIconSize)]);
      // The symbol's own opacity goes on with it, because the label's opacity
      // is applied to both elements: without this, text set to 50% would give
      // a half-faded symbol while the Icon section showed it at 100%.
      styles.push([iconOpacityField, getIconOpacityToWrite()]);
    } else {
      styles.push([iconSizeField, 0]);
    }
    addIconPositionChange(styles, ids, !!iconName);
    applyStyleValues(styles);
  }

  // Switching a symbol on or off changes which positions are legal, so the
  // position moves with it -- in the same command, which makes the pair one
  // undo step.
  //
  // On: the centre cell stops being the default and a label sitting there
  // moves out from under its new symbol. Off: the grid locks back to the
  // centre, so the position goes and the offsets go with it -- label-pos=c
  // clears dx, dy and text-anchor by itself. That makes switching a symbol off
  // destructive, since a hand-placed label loses its placement; being one
  // undoable command is what makes that acceptable.
  //
  // Not for path labels, whose text runs along a curve: the commands ignore a
  // position given for one and warn about it, and a warning from switching a
  // symbol on would be about something the user did not ask for.
  function addIconPositionChange(styles, ids, iconOn) {
    if (anyLabelIsOnAPath(ids)) return;
    if (!iconOn) {
      styles.push(['label-pos', 'c']);
    } else if (everyTargetIsCentred(ids)) {
      styles.push(['label-pos', labelPositionBesideIcon]);
    }
  }

  function everyTargetIsCentred(ids) {
    var table = getActiveTable();
    if (ids.length === 0) return !labelIsPlaced(getNewLabelStyle(gui));
    return ids.every(function(id) {
      return !labelIsPlaced(table && table.getRecordAt(id));
    });
  }

  function applyIconSize(value) {
    applyStyleValues([[iconSizeField, value]], getIconTargetIds());
  }

  function applyIconColor(color) {
    applyStyleValues([[iconColorField, color]], getIconTargetIds());
  }

  function applyIconOpacity(value) {
    applyStyleValues([[iconOpacityField, value]], getIconTargetIds());
  }

  function nudgeIconSize(delta) {
    var size = getNumericSize(getIconTargetIds(), iconSizeField, defaultIconSize);
    if (!controlsEnabled()) return;
    size = Math.max(1, size + delta);
    applyIconSize(size);
  }

  // Whether the target labels have a symbol: 'on', 'off', or 'mixed' when only
  // some of them do.
  //
  // An icon-size or icon-color on a label with no symbol draws nothing, which
  // is why the shape, size and colour controls are inert until the toggle puts
  // a symbol there to style.
  function getIconState() {
    var ids = getTargetIds();
    var table = getActiveTable();
    if (ids.length === 0) return getNewLabelValue(iconField) ? 'on' : 'off';
    return getToggleState(ids.map(function(id) {
      var rec = table && table.getRecordAt(id);
      return !!(rec && rec[iconField]);
    }));
  }

  // The labels an icon-size, icon-color or icon-opacity goes to: those in the
  // target that have a symbol, which is all of them unless the switch is mixed.
  // Writing one of these to a label with no icon would add a property that
  // draws nothing and a column to the user's table.
  //
  // Empty for a target with no symbol anywhere, which is the state those
  // controls are disabled in, and empty for "new labels", where the style is
  // held by the tool rather than by any feature.
  function getIconTargetIds() {
    var ids = getTargetIds();
    var table = getActiveTable();
    return ids.filter(function(id) {
      var rec = table && table.getRecordAt(id);
      return !!(rec && rec[iconField]);
    });
  }

  // The labels the section's controls *show* the values of, which is not quite
  // the set they write to: with no symbol anywhere the fields go on showing
  // what the target carries, greyed, because that is what the symbol comes back
  // as when the switch is turned on. Narrowing there would show the values held
  // for the next label instead of the ones stored on the selection.
  function getIconValueIds() {
    var ids = getIconTargetIds();
    return ids.length > 0 ? ids : getTargetIds();
  }

  function getIconOpacityToWrite() {
    var val = parseOpacityValue(iconOpacityInput.node().value);
    if (val !== null) return val;
    // The field reads blank while the section is off, so a symbol switched off
    // and on again takes back the fade still stored on the label rather than
    // being reset to full.
    var stored = getCommonValue(getIconValueIds(), iconOpacityField, {useDefault: true, defaultValue: 1});
    val = stored === '' ? 1 : Number(stored);
    return isFinite(val) ? val : 1;
  }

  function getNumericSize(ids, field, defaultValue) {
    var val = getCommonValue(ids, field);
    val = val ? Number(val) : defaultValue;
    return isFinite(val) && val > 0 ? val : defaultValue;
  }

  function initColorPicker(parent, chit, input, onChange) {
    return new ColorPicker(parent, {
      onPreview: function(hex) {
        input.node().value = hex;
        chit.css('background-color', hex);
      },
      onChange: onChange
    });
  }

  function toggleColorPicker() {
    colorPicker.toggle();
  }

  function hideColorPicker() {
    colorPicker.hide();
    iconColorPicker.hide();
  }

  function isFormElement(node) {
    return !!node && /^(INPUT|SELECT|TEXTAREA|BUTTON|OPTION)$/.test(node.nodeName);
  }

  // Whether clicking this node puts a native menu on screen, which must then be
  // left holding the focus. OPTION counts because a browser that reports the
  // chosen option as the click target is reporting a menu interaction either
  // way, and a choice restores the caret through its change handler.
  function opensAMenu(node) {
    return !!node && /^(SELECT|OPTION)$/.test(node.nodeName);
  }

  // Hands the keyboard back after a control has done its job: to the label
  // being typed into if there is one, and to nothing at all otherwise.
  function releaseFocus() {
    var session = getLabelTextSession(gui);
    if (!session) {
      releasePanelFocus(panel.node());
    } else if (panel.node().contains(document.activeElement)) {
      session.refocus();
    }
  }

  // idsArg: (optional) the labels to write to, when they are not the whole
  //   target -- an icon property goes only to the labels that have a symbol.
  function applyStyleValues(styles, idsArg) {
    var ids = idsArg || getTargetIds();
    if (styles.length === 0) return;
    releaseFocus();
    // What the panel is set to is always what the next label gets, whether or
    // not these values also went to a label that already exists. -add-label
    // writes them when that label is created, which is why this needs no
    // command and no undo step of its own.
    if (labelModeIsOn()) {
      updateNewLabelStyle(gui, styles);
      // A label being typed into that has no feature yet is drawn from that
      // style, so it has to be redrawn to show the change -- it is the preview.
      refreshPendingLabel();
    }
    if (ids.length > 0) {
      applyStyleCommand(styles, ids);
      return;
    }
    if (!labelModeIsOn()) return;
    updateControls();
  }

  function refreshPendingLabel() {
    var session = getLabelTextSession(gui);
    if (session && session.id == -1 && session.refresh) session.refresh();
  }

  function applyStyleCommand(styles, ids) {
    var lyr = getActiveLayer();
    var parts = ['-style'];
    if (!gui.console || !lyr) return;
    styles.forEach(function(style) {
      parts.push(style[0] + '=' + quoteCommandValue(style[1]));
    });
    if (ids.length < internal.getFeatureCount(lyr)) {
      parts.push('ids=' + ids.join(','));
    }
    runGuiEditCommand(gui, parts.join(' '), {
      title: 'Label styles',
      onDone: function() {
        setTimeout(updateSelectionDisplay, 0);
        updateControls();
        updateSelectionDisplay();
      }
    });
  }

  // The yellow halo, which belongs to the older label_style mode. The label
  // tool draws its selection as an outline instead (gui-label-selection.mjs),
  // because a halo says "this text is marked" where an outline says "this is
  // an object you can act on" -- and the tool needs the second reading now that
  // one click selects and another reaches into the text.
  function updateSelectionDisplay() {
    clearSelectionDisplay();
    if (labelModeIsOn()) return;
    getSelectionIds().forEach(function(id) {
      var textNode = getTextNodeById(id);
      if (textNode) {
        textNode.classList.add('label-style-selected');
      }
    });
  }

  function clearSelectionDisplay() {
    var lyr = hit && hit.getHitTarget();
    var container = lyr && lyr.gui && lyr.gui.svg_container;
    if (!container) return;
    container.querySelectorAll('.label-style-selected').forEach(function(node) {
      node.classList.remove('label-style-selected');
    });
  }

  function getTextNodeById(id) {
    var lyr = hit && hit.getHitTarget();
    var container = lyr && lyr.gui && lyr.gui.svg_container;
    var symbol = container && container.querySelector('[data-id="' + id + '"]');
    if (!symbol) return null;
    return symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
  }

}