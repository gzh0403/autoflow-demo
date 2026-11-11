/**
 * 本地状态：localStorage 持久化，刷新保留，一键重置到预置数据。
 */
(function (root) {
  "use strict";
  var KEY = "autoflow-demo-state-v1";
  var META = "autoflow-demo-meta-v1";

  function defaultMeta() {
    return { role: "customer", frame: "wide", lastPath: { customer: "/c/home", staff: "/s/today", boss: "/b/dashboard" } };
  }

  function loadMeta() {
    try {
      var raw = localStorage.getItem(META);
      if (!raw) return defaultMeta();
      var m = JSON.parse(raw);
      var d = defaultMeta();
      return {
        role: m.role || d.role,
        frame: m.frame || d.frame,
        lastPath: Object.assign(d.lastPath, m.lastPath || {}),
      };
    } catch (e) {
      return defaultMeta();
    }
  }

  function saveMeta(meta) {
    localStorage.setItem(META, JSON.stringify(meta));
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return root.AFData.createSeed();
      var state = JSON.parse(raw);
      if (!state || !state.version || !state.bookings) return root.AFData.createSeed();
      return state;
    } catch (e) {
      return root.AFData.createSeed();
    }
  }

  function saveState(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function resetState() {
    var state = root.AFData.createSeed();
    saveState(state);
    return state;
  }

  root.AFStore = {
    KEY: KEY,
    loadMeta: loadMeta,
    saveMeta: saveMeta,
    loadState: loadState,
    saveState: saveState,
    resetState: resetState,
  };
})(typeof self !== "undefined" ? self : this);
