(function() {
  var defaultProvider = "anthropic";

  var common = {
    enabled: true,
    mode: "direct",
    label: "Ask Mapshaper",
    title: "Ask Mapshaper",
    staticContextUrls: [
      "/docs/ai/bot-instructions.html.md",
      "/docs/ai/command-cheatsheet.html.md",
      "/llms-full.txt"
    ],
    sendRuntimeContext: true,
    sendSampleValues: false,
    allowRunCommands: false
  };

  var providers = {
    anthropic: {
      provider: "anthropic",
      apiKey: "",
      model: "claude-sonnet-4-6",
      cacheControl: {type: "ephemeral"},
      cacheTtl: "1h"
    },
    openai: {
      provider: "openai",
      apiKey: "",
      model: "gpt-4.1-mini"
    },
    gemini: {
      provider: "gemini",
      apiKey: "",
      model: "gemini-3.1-pro-preview"
    },
    mock: {
      mode: "mock",
      provider: "mock"
    }
  };

  function getSelectedProvider() {
    var params = new URLSearchParams(window.location.search);
    return params.get("ai") || defaultProvider;
  }

  function mergeConfig() {
    var selected = getSelectedProvider();
    var providerConfig = providers[selected] || providers[defaultProvider];
    return Object.assign({
      selectedProvider: providers[selected] ? selected : defaultProvider
    }, common, providerConfig);
  }

  window.mapshaperAIConfigs = {
    defaultProvider: defaultProvider,
    common: common,
    providers: providers
  };
  window.mapshaperAI = mergeConfig();
})();
