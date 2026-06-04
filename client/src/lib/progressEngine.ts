import type { DownloadKind, DownloadProgressPayload } from "../types/api";

const STEP_KINDS = ["mp3", "video", "thumb"] as const;
type StepKind = (typeof STEP_KINDS)[number];

interface Track {
  target: number;
  shown: number;
  active: boolean;
  complete: boolean;
}

function createTrack(): Track {
  return { target: 0, shown: 0, active: false, complete: false };
}

function resolveStep(
  activeKind: DownloadKind | null,
  data: DownloadProgressPayload,
  currentStep: StepKind | null,
): StepKind {
  if (activeKind !== "all") return (activeKind ?? "mp3") as StepKind;
  return (
    (data.step && data.step !== "all" ? data.step : undefined) ??
    STEP_KINDS[Math.max(0, (data.stepIndex ?? 1) - 1)] ??
    currentStep ??
    STEP_KINDS[0]
  );
}

export interface ButtonProgressState {
  percent: number;
  active: boolean;
  running: boolean;
  complete: boolean;
}

export interface ProgressSnapshot {
  kind: DownloadKind | null;
  currentStep: StepKind | null;
  steps: Record<StepKind, number>;
  overall: number;
  buttons: Record<DownloadKind | "all", ButtonProgressState>;
}

export class DownloadProgressEngine {
  private onUpdate: (snapshot: ProgressSnapshot) => void;
  private rafId = 0;
  private activeKind: DownloadKind | null = null;
  private currentStep: StepKind | null = null;
  private jobTarget = 0;
  private jobShown = 0;
  private tracks: Record<StepKind, Track> = {
    mp3: createTrack(),
    video: createTrack(),
    thumb: createTrack(),
  };

  constructor(onUpdate: (snapshot: ProgressSnapshot) => void) {
    this.onUpdate = onUpdate;
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

  start(kind: DownloadKind) {
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
    this.loop();
    this.onUpdate(this.snapshot());
  }

  feed(payload: DownloadProgressPayload & { kind?: DownloadKind }) {
    if (!this.activeKind) return;

    const kind = payload.kind ?? this.activeKind;

    if (payload.phase === "done") {
      const step = resolveStep(kind, payload, this.currentStep);
      this.completeStep(step, kind === "all");

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
        this.completeStep(STEP_KINDS[i]!, false);
      }
    } else if (kind !== step) {
      return;
    }

    this.currentStep = step;
    const track = this.tracks[step];
    track.active = true;

    const userPercent = this.readPercent(payload);
    track.target = Math.max(track.target, userPercent);
    if (userPercent > track.shown) {
      track.shown = this.smooth(track.shown, userPercent);
    }

    if (typeof payload.overallUserPercent === "number") {
      this.jobTarget = Math.max(this.jobTarget, payload.overallUserPercent);
    } else if (kind === "all") {
      this.jobTarget = Math.max(this.jobTarget, this.estimateAllTarget());
    }

    this.onUpdate(this.snapshot());
  }

  finish(kind: DownloadKind) {
    if (kind === "all") {
      for (const stepKind of STEP_KINDS) {
        this.completeStep(stepKind, false);
      }
      this.jobShown = 100;
      this.jobTarget = 100;
    } else if (STEP_KINDS.includes(kind)) {
      this.completeStep(kind, false);
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

  snapshot(): ProgressSnapshot {
    const kind = this.activeKind;
    const buttons = {} as ProgressSnapshot["buttons"];

    for (const stepKind of STEP_KINDS) {
      const track = this.tracks[stepKind];
      const isCurrent = this.currentStep === stepKind;

      buttons[stepKind] = {
        percent: track.shown,
        active: this.isButtonActive(kind, stepKind, track, isCurrent),
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

  private readPercent(payload: DownloadProgressPayload) {
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

  private estimateAllTarget() {
    let sum = 0;
    for (const stepKind of STEP_KINDS) {
      sum += this.tracks[stepKind].complete
        ? 100
        : this.tracks[stepKind].target;
    }
    return sum / STEP_KINDS.length;
  }

  private completeStep(stepKind: StepKind, advance: boolean) {
    const track = this.tracks[stepKind];
    track.active = true;
    track.complete = true;
    track.target = 100;
    track.shown = 100;

    if (advance) {
      const stepIdx = STEP_KINDS.indexOf(stepKind);
      if (stepIdx >= 0 && stepIdx < STEP_KINDS.length - 1) {
        const next = STEP_KINDS[stepIdx + 1]!;
        this.currentStep = next;
        this.tracks[next].active = true;
      }
    }
  }

  private loop() {
    this.rafId = requestAnimationFrame(() => {
      this.tick();
      if (this.activeKind) this.loop();
    });
  }

  private tick() {
    let changed = false;
    const kind = this.activeKind;

    for (const stepKind of STEP_KINDS) {
      const track = this.tracks[stepKind];
      const isRelevant = kind === "all" || kind === stepKind;

      if (!isRelevant || (!track.active && !track.complete)) continue;

      const next = track.complete ? 100 : this.smooth(track.shown, track.target);
      if (next > track.shown) {
        track.shown = next;
        changed = true;
      }
    }

    if (this.activeKind === "all") {
      const nextJob = this.smooth(this.jobShown, this.jobTarget);
      if (nextJob > this.jobShown) {
        this.jobShown = nextJob;
        changed = true;
      }
    }

    if (changed) {
      this.onUpdate(this.snapshot());
    }
  }

  private smooth(current: number, target: number) {
    if (target <= current) return current;
    if (target >= 99) return target;
    const delta = target - current;
    if (delta >= 12) return current + delta * 0.55;
    const step = Math.max(0.12, delta * 0.28);
    return Math.min(target, current + step);
  }

  private isButtonActive(
    kind: DownloadKind | null,
    stepKind: StepKind,
    track: Track,
    isCurrent: boolean,
  ) {
    if (!kind) return false;
    if (kind === "all") {
      return isCurrent || track.complete;
    }
    return kind === stepKind && (track.active || track.complete);
  }
}
