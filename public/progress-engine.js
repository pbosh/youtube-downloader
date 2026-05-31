/**
 * Display-only progress engine. Server sends userPercent (0–100 end-to-end).
 * This layer smooths motion and never moves backward.
 */
(function (global) {
  "use strict";

  const STEP_KINDS = ["mp3", "video", "thumb"];

  function createTrack() {
    return {
      target: 0,
      shown: 0,
      active: false,
      complete: false,
    };
  }

  function resolveStep(activeKind, data, currentStep) {
    if (activeKind !== "all") return activeKind;
    return (
      data.step ||
      STEP_KINDS[Math.max(0, (data.stepIndex || 1) - 1)] ||
      currentStep ||
      STEP_KINDS[0]
    );
  }

  class DownloadProgressEngine {
    constructor(onUpdate) {
      this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
      this.rafId = 0;
      this.activeKind = null;
      this.currentStep = null;
      this.jobTarget = 0;
      this.jobShown = 0;
      this.tracks = {
        mp3: createTrack(),
        video: createTrack(),
        thumb: createTrack(),
      };
    }

    reset() {
      this.stop();
      this.activeKind = null;
      this.currentStep = null;
      this.jobTarget = 0;
      this.jobShown = 0;
      this.tracks = {
        mp3: createTrack(),
        video: createTrack(),
        thumb: createTrack(),
      };
      this.onUpdate(this.snapshot());
    }

    start(kind) {
      this.stop();
      this.activeKind = kind;
      this.currentStep = kind === "all" ? "mp3" : kind;
      this.jobTarget = 0;
      this.jobShown = 0;
      this.tracks = {
        mp3: createTrack(),
        video: createTrack(),
        thumb: createTrack(),
      };

      const first = this.currentStep;
      this.tracks[first].active = true;

      this._loop();
      this.onUpdate(this.snapshot());
    }

    feed(payload) {
      if (!this.activeKind) return;

      const kind = payload.kind || this.activeKind;

      if (payload.phase === "done") {
        const step = resolveStep(kind, payload, this.currentStep);
        this._completeStep(step, kind === "all");

        if (typeof payload.overallUserPercent === "number") {
          this.jobTarget = Math.max(this.jobTarget, payload.overallUserPercent);
          this.jobShown = Math.max(this.jobShown, this.jobTarget);
        }

        this.onUpdate(this.snapshot());
        return;
      }

      const step = resolveStep(kind, payload, this.currentStep);
      const stepIdx = STEP_KINDS.indexOf(step);
      if (stepIdx < 0) return;

      if (kind === "all") {
        for (let i = 0; i < stepIdx; i++) {
          this._completeStep(STEP_KINDS[i], false);
        }
      } else if (kind !== step) {
        return;
      }

      this.currentStep = step;
      const track = this.tracks[step];
      track.active = true;

      const userPercent = this._readPercent(payload);
      track.target = Math.max(track.target, userPercent);
      if (userPercent > track.shown) {
        track.shown = this._smooth(track.shown, userPercent);
      }

      if (typeof payload.overallUserPercent === "number") {
        this.jobTarget = Math.max(this.jobTarget, payload.overallUserPercent);
      } else if (kind === "all") {
        this.jobTarget = Math.max(this.jobTarget, this._estimateAllTarget());
      }

      this.onUpdate(this.snapshot());
    }

    finish(kind) {
      if (kind === "all") {
        for (const stepKind of STEP_KINDS) {
          this._completeStep(stepKind, false);
        }
        this.jobShown = 100;
        this.jobTarget = 100;
      } else if (STEP_KINDS.includes(kind)) {
        this._completeStep(kind, false);
      }
      this.stop();
      this.onUpdate(this.snapshot());
    }

    stop() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
    }

    snapshot() {
      const kind = this.activeKind;
      const buttons = {};

      for (const stepKind of STEP_KINDS) {
        const track = this.tracks[stepKind];
        const isCurrent = this.currentStep === stepKind;

        buttons[stepKind] = {
          percent: track.shown,
          active: this._isButtonActive(kind, stepKind, track, isCurrent),
          running: Boolean(
            kind &&
              isCurrent &&
              !track.complete &&
              (kind === "all" || kind === stepKind),
          ),
          complete: track.complete && (kind === "all" || kind === stepKind),
        };
      }

      buttons.all = {
        percent: kind === "all" ? this.jobShown : 0,
        active: kind === "all" && this.jobShown < 100,
        running: kind === "all" && this.jobShown < 100,
        complete: kind === "all" && this.jobShown >= 100,
      };

      return {
        kind,
        currentStep: this.currentStep,
        steps: {
          mp3: this.tracks.mp3.shown,
          video: this.tracks.video.shown,
          thumb: this.tracks.thumb.shown,
        },
        overall: kind === "all" ? this.jobShown : 0,
        buttons,
      };
    }

    _readPercent(payload) {
      if (typeof payload.userPercent === "number") {
        return Math.max(0, Math.min(100, payload.userPercent));
      }
      if (typeof payload.stepPercent === "number") {
        return Math.max(0, Math.min(100, payload.stepPercent));
      }
      if (typeof payload.percent === "number") {
        return Math.max(0, Math.min(100, payload.percent));
      }
      return 0;
    }

    _estimateAllTarget() {
      let sum = 0;
      for (const stepKind of STEP_KINDS) {
        sum += this.tracks[stepKind].complete
          ? 100
          : this.tracks[stepKind].target;
      }
      return sum / STEP_KINDS.length;
    }

    _completeStep(stepKind, advance) {
      const track = this.tracks[stepKind];
      track.active = true;
      track.complete = true;
      track.target = 100;
      track.shown = 100;

      if (advance) {
        const stepIdx = STEP_KINDS.indexOf(stepKind);
        if (stepIdx >= 0 && stepIdx < STEP_KINDS.length - 1) {
          const next = STEP_KINDS[stepIdx + 1];
          this.currentStep = next;
          this.tracks[next].active = true;
        }
      }
    }

    _loop() {
      this.rafId = requestAnimationFrame(() => {
        this._tick();
        if (this.activeKind) this._loop();
      });
    }

    _tick() {
      let changed = false;
      const kind = this.activeKind;

      for (const stepKind of STEP_KINDS) {
        const track = this.tracks[stepKind];
        const isRelevant =
          kind === "all" || kind === stepKind;

        if (!isRelevant || (!track.active && !track.complete)) continue;

        const next = track.complete
          ? 100
          : this._smooth(track.shown, track.target);
        if (next > track.shown) {
          track.shown = next;
          changed = true;
        }
      }

      if (this.activeKind === "all") {
        const nextJob = this._smooth(this.jobShown, this.jobTarget);
        if (nextJob > this.jobShown) {
          this.jobShown = nextJob;
          changed = true;
        }
      }

      if (changed) {
        this.onUpdate(this.snapshot());
      }
    }

    _smooth(current, target) {
      if (target <= current) return current;
      if (target >= 99) return target;
      const delta = target - current;
      if (delta >= 12) return current + delta * 0.55;
      const step = Math.max(0.12, delta * 0.28);
      return Math.min(target, current + step);
    }

    _isButtonActive(kind, stepKind, track, isCurrent) {
      if (!kind) return false;
      if (kind === "all") {
        return isCurrent || track.complete;
      }
      return kind === stepKind && (track.active || track.complete);
    }
  }

  global.DownloadProgressEngine = DownloadProgressEngine;
})(window);
