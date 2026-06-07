export function getServerCapabilities() {
  return { tools: {} };
}

export function getToolNames(): string[] {
  return [
    "comet_connect",
    "comet_ask",
    "comet_poll",
    "comet_stop",
    "comet_screenshot",
    "comet_tabs",
    "comet_mode",
    "comet_upload",
  ];
}
