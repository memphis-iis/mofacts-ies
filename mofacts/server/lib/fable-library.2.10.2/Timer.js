"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Timer = void 0;

var _Event = _interopRequireDefault(require("./Event"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Timer {
  constructor(interval) {
    this._enabled = false;
    this._isDisposed = false;
    this._intervalId = 0;
    this._timeoutId = 0;
    this.Interval = interval && interval > 0 ? interval : 100;
    this.AutoReset = true;
    this._elapsed = new _Event.default();
  }

  get Elapsed() {
    return this._elapsed;
  }

  get Enabled() {
    return this._enabled;
  }

  set Enabled(x) {
    if (!this._isDisposed && this._enabled !== x) {
      this._enabled = x;

      if (this._enabled) {
        if (this.AutoReset) {
          this._intervalId = setInterval(() => {
            if (!this.AutoReset) {
              this.Enabled = false;
            }

            this._elapsed.Trigger(new Date());
          }, this.Interval);
        } else {
          this._timeoutId = setTimeout(() => {
            this.Enabled = false;
            this._timeoutId = 0;

            if (this.AutoReset) {
              this.Enabled = true;
            }

            this._elapsed.Trigger(new Date());
          }, this.Interval);
        }
      } else {
        if (this._timeoutId) {
          clearTimeout(this._timeoutId);
          this._timeoutId = 0;
        }

        if (this._intervalId) {
          clearInterval(this._intervalId);
          this._intervalId = 0;
        }
      }
    }
  }

  Dispose() {
    this.Enabled = false;
    this._isDisposed = true;
  }

  Close() {
    this.Dispose();
  }

  Start() {
    this.Enabled = true;
  }

  Stop() {
    this.Enabled = false;
  }

}

exports.Timer = Timer;
var _default = Timer;
exports.default = _default;