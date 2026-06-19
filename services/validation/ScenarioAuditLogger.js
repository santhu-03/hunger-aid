export class ScenarioAuditLogger {
  constructor(onLogUpdate) {
    this.logs = [];
    this.onLogUpdate = onLogUpdate;
  }

  _append(msg, type) {
    const entry = { time: new Date().toLocaleTimeString(), msg, type };
    this.logs.push(entry);
    if (this.onLogUpdate) {
      this.onLogUpdate([...this.logs]);
    }
  }

  info(msg) {
    this._append(msg, 'info');
  }

  success(msg) {
    this._append(`[PASS] ${msg}`, 'success');
  }

  error(msg) {
    this._append(`[FAIL] ${msg}`, 'error');
  }

  header(msg) {
    this._append(`--- ${msg} ---`, 'header');
  }

  clear() {
    this.logs = [];
    if (this.onLogUpdate) {
      this.onLogUpdate([]);
    }
  }

  getLogs() {
    return this.logs;
  }
}
