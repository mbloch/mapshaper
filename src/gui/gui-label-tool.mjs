import { getFontStyleVariants, getInstalledFonts } from './gui-label-fonts';
import { ColorPicker, isHexColor } from './gui-color-picker';
import { StylePresetControl } from './gui-style-preset-control';
import { SizeField } from './gui-size-field';
import { parseOpacityValue, formatOpacityPct } from './gui-style-values';
import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { quoteCommandValue } from './gui-command-utils';
import {
  getNewLabelStyle, updateNewLabelStyle, getLabelTextSession,
  getLabelPositionMode, setLabelPositionMode
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
    // take focus and hand it back (see restoreTextFocus).
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
      restoreTextFocus();
    });

    var header = El('div').addClass('label-style-panel-title').appendTo(panel).text('Label styles');
    closeBtn = El('button').addClass('label-style-close').appendTo(header).text('×').on('click', function() {
      gui.clearMode();
    });

    var selectRow = El('div').addClass('label-style-row label-style-selection-row').appendTo(panel);
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
      onStep: nudgeFontSize
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
    opacityInput = makeOpacityInput(opacityCell, applyLabelOpacity);

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
      onStep: nudgeIconSize
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
    iconOpacityInput = makeOpacityInput(iconOpacityCell, applyIconOpacity);

    var positionSection = addSection('Label position', {minor: true});

    var posRow = El('div').addClass('label-style-row label-position-row').appendTo(positionSection);
    var grid = El('div').addClass('label-position-grid').appendTo(posRow);
    posBtns = {};
    labelPositions.forEach(function(pos) {
      posBtns[pos] = makePanelButton(grid, '', function() {
          applyLabelPosition(pos);
        })
        .attr('data-position', pos)
        .attr('title', pos);
    });

    // Beside the grid rather than under it, because the two work together: the
    // grid puts a label in one of nine places around its anchor, this says
    // whether a drag may then take it somewhere else, and clicking a cell is
    // the way back from having done so.
    var dragModeGroup = El('div').addClass('label-btn-group label-drag-mode-buttons').appendTo(posRow);
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
    var section = El('div').addClass('label-style-section').appendTo(panel);
    // The heading's type is on the name rather than on the row, because the
    // row also holds things that are not headings -- the icon switch, and the
    // caption over the size field in the row below.
    var row = El('div').addClass('label-style-section-title')
      .classed('label-style-section-minor', !!(opts && opts.minor))
      .appendTo(section);
    El('span').addClass('label-style-section-name').appendTo(row).text(title);
    return section;
  }

  // A two-state switch: a track with a knob that sits left when off and right
  // when on, which is the direction users expect and the only thing that says
  // which state is which without a label for each.
  function makeToggle(parent, opts) {
    var track = El('div').addClass('label-toggle').attr('role', 'switch').appendTo(parent);
    var on = false;
    var disabled = false;
    El('div').addClass('label-toggle-knob').appendTo(track);
    if (opts.title) track.attr('title', opts.title);
    track.on('click', function() {
      if (disabled) return;
      opts.onChange(!on);
    });
    return {
      setState: function(isOn) {
        on = !!isOn;
        track.classed('on', on).attr('aria-checked', on ? 'true' : 'false');
      },
      getState: function() {
        return on;
      },
      setDisabled: function(off) {
        disabled = !!off;
        track.classed('disabled', disabled)
          .attr('aria-disabled', disabled ? 'true' : 'false');
      }
    };
  }

  // A colour swatch and its hex value inside one border, so that the pair reads
  // as one field rather than as a button beside a text box.
  function makeColorField(parent, chit, input) {
    var box = El('div').addClass('label-color-field').appendTo(parent);
    chit.appendTo(box);
    input.appendTo(box);
    return box;
  }

  // Opacity is shown as a percentage and stored as a fraction. It is a plain
  // field rather than a swatch or a slider: a swatch beside a colour reads as a
  // second colour, and a slider gives up the exact value for a drag that a
  // zoomable map makes risky.
  function makeOpacityInput(parent, action) {
    var input = El('input').attr('type', 'text').addClass('label-opacity-input')
      .attr('title', 'Opacity, 0-100%')
      .appendTo(parent)
      .on('change', function() {
        var val = parseOpacityValue(input.node().value);
        if (val === null) {
          updateControls(); // puts back what the field was showing
          return;
        }
        action(val);
      });
    return input;
  }

  // A field for an SVG length: 2, 2px, 0.1em. Blank means the property is not
  // set, and blanking a field that was set removes it -- which is the only way
  // back to the renderer's own spacing once a value has been chosen.
  function makeMeasureInput(parent, field, placeholder) {
    var input = El('input').attr('type', 'text').addClass('label-measure-input')
      .attr('placeholder', placeholder)
      .appendTo(parent)
      .on('change', function() {
        applyStyleValues([[field, input.node().value.trim()]]);
      });
    return input;
  }

  // Deliberately not focusable: the GUI is pointer-only, so a tab stop here
  // would lead into a control the keyboard cannot then operate. See the focus
  // note in page.css.
  function makePanelButton(parent, label, action) {
    return El('div')
      .addClass('label-panel-btn')
      .attr('role', 'button')
      .appendTo(parent)
      .text(label)
      .on('click', function(e) {
        if (this.classList.contains('disabled')) return;
        action(e);
      });
  }

  function setPanelButtonDisabled(el, disabled) {
    el.classed('disabled', !!disabled)
      .attr('aria-disabled', disabled ? 'true' : 'false');
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
    // Named rather than blank, because with the row's label gone the select's
    // own contents are what say which control it is -- and because a label
    // carries no font-family until one is chosen, which is the usual state.
    El('option').attr('value', '').appendTo(fontSelect).text('Default font');
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
    var fontVal = getCommonValue(ids, fontField);
    var fontSizeVal = getCommonValue(ids, fontSizeField, {useDefault: true, defaultValue: defaultFontSize});
    var fontStyleVal = getCommonValue(ids, fontStyleField, {useDefault: true, defaultValue: defaultFontStyle});
    var fontWeightVal = getCommonValue(ids, fontWeightField, {useDefault: true, defaultValue: defaultFontWeight});
    var fillVal = getCommonValue(ids, fillField, {useDefault: true, defaultValue: defaultLabelColor});
    var opacityVal = getCommonValue(ids, opacityField, {useDefault: true, defaultValue: 1});
    var letterSpacingVal = getCommonValue(ids, letterSpacingField);
    var lineHeightVal = getCommonValue(ids, lineHeightField);
    var alignVal = getCommonAlignment(ids);
    var cssVal = getCommonValue(ids, cssField);
    var posVal = getCommonValue(ids, 'label-pos');
    var iconVal = getCommonValue(ids, iconField);
    var iconSizeVal = getCommonValue(ids, iconSizeField, {useDefault: true, defaultValue: defaultIconSize});
    var iconColorVal = getCommonValue(ids, iconColorField, {useDefault: true, defaultValue: defaultIconColor});
    var iconOpacityVal = getCommonValue(ids, iconOpacityField, {useDefault: true, defaultValue: 1});
    updateEditingStatus(manualIds.length, !!getLabelTextSession(gui));
    updateSavedStyleControls();
    fontSelect.node().disabled = !showValues;
    fontSelect.node().value = fontVal;
    updateFontStyleControls(fontVal, fontStyleVal, fontWeightVal);
    updateFontSizeControls(showValues ? fontSizeVal : '');
    updateColorControls(showValues ? fillVal : '');
    updateOpacityControl(opacityInput, showValues ? opacityVal : '');
    updateMeasureControl(letterSpacingInput, showValues ? letterSpacingVal : '');
    updateMeasureControl(lineHeightInput, showValues ? lineHeightVal : '');
    updateAlignButtons(showValues ? alignVal : '');
    updateCssControl(showValues ? cssVal : '');
    updatePositionButtons(showValues ? posVal : '', ids);
    // The symbol's controls keep showing their values while the switch is off,
    // greyed: what they show is what the symbol comes back as.
    var iconOff = updateIconControls(showValues ? iconVal : '');
    updateIconSizeControls(showValues ? iconSizeVal : '', iconOff);
    updateIconColorControls(showValues ? iconColorVal : '', iconOff);
    updateOpacityControl(iconOpacityInput, showValues ? iconOpacityVal : '', iconOff);
  }

  function updateOpacityControl(input, val, disabled) {
    input.node().disabled = disabled || !controlsEnabled();
    input.node().value = val === '' ? '' : formatOpacityPct(val);
  }

  function updateMeasureControl(input, val) {
    input.node().disabled = !controlsEnabled();
    input.node().value = val || val === 0 ? String(val) : '';
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

  function updateFontSizeControls(fontSizeVal) {
    fontSizeInput.setValue(fontSizeVal || '');
    fontSizeInput.setDisabled(!controlsEnabled());
  }

  function updateFontStyleControls(fontName, fontStyleVal, fontWeightVal) {
    var disabled = !controlsEnabled() || !fontName;
    fontStyleSelect.empty();
    El('option').attr('value', '').appendTo(fontStyleSelect).text('Default style');
    if (fontName) {
      getFontStyleVariants(fontName).forEach(function(variant) {
        El('option').attr('value', variant.value).appendTo(fontStyleSelect).text(variant.label);
      });
    }
    fontStyleSelect.node().disabled = disabled;
    fontStyleSelect.node().value = fontStyleVal && fontWeightVal ?
      fontStyleVal + '|' + fontWeightVal : '';
    // A style with no font to belong to matches none of the options -- the list
    // is the faces the chosen font is installed with, and there is no chosen
    // font -- and an unmatched value leaves the box blank rather than on its
    // first entry, which is what an unset style is.
    if (fontStyleSelect.node().selectedIndex < 0) {
      fontStyleSelect.node().selectedIndex = 0;
    }
  }

  function updateColorControls(colorVal) {
    var disabled = !controlsEnabled();
    colorInput.node().disabled = disabled;
    colorInput.node().value = colorVal || '';
    colorFieldBox.classed('disabled', disabled);
    setPanelButtonDisabled(colorChit, disabled);
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

  function updateCssControl(cssVal) {
    cssInput.node().disabled = !controlsEnabled();
    cssInput.node().value = cssVal || '';
  }

  // The toggle reads the data rather than holding a state of its own: a symbol
  // is on when the target has one, which is what makes it follow an undo.
  //
  // A selection where only some labels have a symbol counts as on, so that the
  // section stays usable -- turning the switch off then removes every symbol in
  // it, and a shape applies to all of them. Treating it as off would show the
  // one state from which nothing in the section can be reached.
  function updateIconControls(iconVal) {
    var enabled = controlsEnabled();
    var on = enabled && !everyTargetLacksAnIcon();
    if (iconVal) lastIconShape = iconVal;
    iconToggle.setState(on);
    iconToggle.setDisabled(!enabled);
    // The group is faded as a whole rather than button by button, so that the
    // border the buttons share fades with them -- a live border around dead
    // buttons is the one part of a disabled control that still looks usable.
    iconGroupEl.classed('disabled', !on);
    iconTypes.forEach(function(icon) {
      iconBtns[icon.name].classed('selected', on && icon.name == iconVal);
      setPanelButtonDisabled(iconBtns[icon.name], !on);
    });
    return !on;
  }

  function setIconOn(on) {
    applyIcon(on ? lastIconShape : '');
  }

  function updateIconSizeControls(iconSizeVal, iconOff) {
    iconSizeInput.setValue(iconSizeVal || '');
    iconSizeInput.setDisabled(iconOff || !controlsEnabled());
  }

  function updateIconColorControls(colorVal, iconOff) {
    var disabled = iconOff || !controlsEnabled();
    iconColorInput.node().disabled = disabled;
    iconColorInput.node().value = colorVal || '';
    iconColorFieldBox.classed('disabled', disabled);
    setPanelButtonDisabled(iconColorChit, disabled);
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
    var table = getActiveTable();
    var records = table && table.getRecords();
    var value, val, hasValue;
    if (ids.length === 0) return getNewLabelValue(field, opts);
    if (!records) return '';
    for (var i=0; i<ids.length; i++) {
      val = records[ids[i]] && records[ids[i]][field];
      if (!val) {
        if (opts && opts.useDefault) {
          val = opts.defaultValue;
        } else {
          return '';
        }
      } else {
        hasValue = true;
      }
      if (i === 0) {
        value = val;
      } else if (val != value) {
        return '';
      }
    }
    return hasValue || opts && opts.useDefault ? value : '';
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

  function applyFont(fontName) {
    applyStyleValues([[fontField, fontName]]);
  }

  function nudgeFontSize(delta) {
    var ids = getTargetIds();
    var size = getNumericSize(ids, fontSizeField, defaultFontSize);
    if (!controlsEnabled()) return;
    size = Math.max(1, size + delta);
    applyStyleValues([[fontSizeField, size]]);
  }

  function applyFontStyleVariant(value) {
    var variant = parseFontStyleVariant(value);
    if (!variant) return;
    applyStyleValues([[fontStyleField, variant.style], [fontWeightField, variant.weight]]);
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
      styles.push([iconSizeField, getNumericSize(ids, iconSizeField, defaultIconSize)]);
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
    applyStyleValues([[iconSizeField, value]]);
  }

  function applyIconColor(color) {
    applyStyleValues([[iconColorField, color]]);
  }

  function applyIconOpacity(value) {
    applyStyleValues([[iconOpacityField, value]]);
  }

  function nudgeIconSize(delta) {
    var ids = getTargetIds();
    var size = getNumericSize(ids, iconSizeField, defaultIconSize);
    if (!controlsEnabled()) return;
    size = Math.max(1, size + delta);
    applyIconSize(size);
  }

  // An icon-size or icon-color on a label with no symbol draws nothing, which
  // is why the shape, size and colour controls are inert until the toggle puts
  // a symbol there to style.
  function everyTargetLacksAnIcon() {
    var ids = getTargetIds();
    var table = getActiveTable();
    if (ids.length === 0) return !getNewLabelValue(iconField);
    return ids.every(function(id) {
      var rec = table && table.getRecordAt(id);
      return !(rec && rec[iconField]);
    });
  }

  function getIconOpacityToWrite() {
    var val = parseOpacityValue(iconOpacityInput.node().value);
    if (val !== null) return val;
    // The field reads blank while the section is off, so a symbol switched off
    // and on again takes back the fade still stored on the label rather than
    // being reset to full.
    var stored = getCommonValue(getTargetIds(), iconOpacityField, {useDefault: true, defaultValue: 1});
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

  function isTextInput(node) {
    if (!node) return false;
    if (node.nodeName == 'TEXTAREA') return true;
    return node.nodeName == 'INPUT' &&
      !/^(button|checkbox|radio|submit)$/.test(node.type);
  }

  // Whether clicking this node puts a native menu on screen, which must then be
  // left holding the focus. OPTION counts because a browser that reports the
  // chosen option as the click target is reporting a menu interaction either
  // way, and a choice restores the caret through its change handler.
  function opensAMenu(node) {
    return !!node && /^(SELECT|OPTION)$/.test(node.nodeName);
  }

  // Returns the caret to a label being typed into, after a control that took
  // focus to do its job. Only pulls focus out of this panel, so that clicking
  // somewhere else while a menu is open still means what it says.
  function restoreTextFocus() {
    var session = getLabelTextSession(gui);
    if (!session) return;
    if (!panel.node().contains(document.activeElement)) return;
    session.refocus();
  }

  function applyStyleValues(styles) {
    if (styles.length === 0) return;
    restoreTextFocus();
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
    if (getTargetIds().length > 0) {
      applyStyleCommand(styles);
      return;
    }
    if (!labelModeIsOn()) return;
    updateControls();
  }

  function refreshPendingLabel() {
    var session = getLabelTextSession(gui);
    if (session && session.id == -1 && session.refresh) session.refresh();
  }

  function applyStyleCommand(styles) {
    var lyr = getActiveLayer();
    var ids = getTargetIds();
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