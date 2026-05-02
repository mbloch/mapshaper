import { internal } from './gui-core';

var FIELD_TYPE_SCAN_LIMIT = 1000;
var RECENT_COMMAND_LIMIT = 20;
var RECENT_MESSAGE_LIMIT = 10;

export function getRuntimeStateContext(gui) {
  var layers = gui.model.getLayers();
  var active = gui.model.getActiveLayer();
  var history = gui.session.getHistorySnapshot();
  var messages = gui.getMessages ? gui.getMessages() : [];

  return {
    schema: 'mapshaper-runtime-context',
    schema_version: 1,
    generated_at: new Date().toISOString(),
    privacy_note: 'Contains project metadata only: layer names, field names/types, counts, CRS, recent commands and recent messages. It does not include geometry or attribute records.',
    ui: getUiContext(gui),
    active_layer: active ? getLayerTargetId(gui, active.layer) : null,
    default_targets: getDefaultTargets(gui),
    layers: layers.map(function(o, i) {
      return getLayerContext(gui, o.layer, o.dataset, i, active && active.layer);
    }),
    session: {
      command_count: history.commands.length,
      recent_commands: history.commands.slice(-RECENT_COMMAND_LIMIT),
      unsaved_changes: gui.session.unsavedChanges()
    },
    messages: messages.slice(0, RECENT_MESSAGE_LIMIT)
  };
}

export function stringifyRuntimeStateContext(gui) {
  return JSON.stringify(getRuntimeStateContext(gui), null, 2);
}

function getUiContext(gui) {
  return {
    interface: 'web_app',
    console_open: gui.consoleIsOpen(),
    panel_mode: gui.getMode(),
    interaction_mode: gui.interaction ? gui.interaction.getMode() : null,
    dataset_count: gui.model.getDatasets().length,
    layer_count: gui.model.getLayers().length,
    has_data: !gui.model.isEmpty()
  };
}

function getDefaultTargets(gui) {
  return gui.model.getDefaultTargets().map(function(target) {
    return {
      layers: target.layers.map(function(lyr) {
        return getLayerTargetId(gui, lyr);
      })
    };
  });
}

function getLayerContext(gui, lyr, dataset, i, activeLyr) {
  var fields = getFieldContexts(lyr);
  var context = {
    id: i + 1,
    target_id: getLayerTargetId(gui, lyr),
    name: lyr.name || null,
    active: lyr == activeLyr,
    geometry_type: lyr.geometry_type || null,
    feature_count: internal.getFeatureCount(lyr),
    field_count: fields.length,
    fields: fields
  };
  if (lyr.geometry_type) {
    context.crs = getCrsContext(dataset);
  }
  if (dataset.info && dataset.info.input_formats) {
    context.input_formats = dataset.info.input_formats.slice();
  }
  return context;
}

function getCrsContext(dataset) {
  var crs = null;
  try {
    crs = internal.getProjInfo(dataset);
  } catch(e) {}
  return crs || null;
}

function getFieldContexts(lyr) {
  if (!lyr.data || lyr.data.size() === 0) return [];
  return lyr.data.getFields().map(function(name) {
    return {
      name: name,
      type: getSampledFieldType(lyr.data, name)
    };
  });
}

function getSampledFieldType(table, name) {
  var n = Math.min(table.size(), FIELD_TYPE_SCAN_LIMIT);
  var rec, type;
  for (var i = 0; i < n; i++) {
    rec = table.getReadOnlyRecordAt(i);
    type = rec ? internal.getValueType(rec[name]) : null;
    if (type) return type;
  }
  return null;
}

function getLayerTargetId(gui, lyr) {
  return internal.formatOptionValue(internal.getLayerTargetId(gui.model, lyr));
}
