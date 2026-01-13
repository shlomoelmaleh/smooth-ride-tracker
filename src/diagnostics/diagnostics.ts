import { CORE_ANALYSIS_CONFIG } from '@/core/analysisConfig';
import { CapabilitiesReport, CollectionHealth, UnifiedSampleV2 } from '@/sensors/sensorTypes';

export type SensorStatus = 'OK' | 'DEGRADED' | 'LOST' | 'DENIED' | 'UNSUPPORTED';
export type DiagnosticSeverity = 'info' | 'warn' | 'error';

export type DiagnosticKind =
  | 'gps_lost'
  | 'gps_low_rate'
  | 'gps_poor_accuracy'
  | 'imu_stalled'
  | 'imu_low_rate'
  | 'permission_denied_gps'
  | 'permission_denied_motion'
  | 'unsupported_gps'
  | 'unsupported_motion';

export interface DiagnosticEvent {
  kind: DiagnosticKind;
  tStartSec: number;
  tEndSec: number | null;
  durationSec: number | null;
  metrics?: Record<string, number>;
  severity: DiagnosticSeverity;
}

export interface DiagnosticIssue {
  kind: DiagnosticKind;
  title: string;
  severity: DiagnosticSeverity;
  sensor: 'gps' | 'motion';
  status: SensorStatus;
  metrics?: Record<string, number>;
}

export interface DiagnosticsSummary {
  status: 'OK' | 'Issues';
  issuesCount: number;
}

export interface DiagnosticsSnapshot {
  activeIssues: DiagnosticIssue[];
  sessionFindings: DiagnosticEvent[];
  sensorStatus: Record<'gps' | 'motion', SensorStatus>;
  summary: DiagnosticsSummary;
}

export interface DiagnosticsPermissions {
  motion: PermissionState | 'unsupported';
  location: PermissionState | 'unsupported';
  orientation?: PermissionState | 'unsupported';
}

interface IssueState {
  active: boolean;
  pendingSinceMs: number | null;
  recoverSinceMs: number | null;
  openedAtMs: number | null;
  metrics?: Record<string, number>;
}

interface IssueCandidate {
  kind: DiagnosticKind;
  immediate: boolean;
  metrics?: Record<string, number>;
}

const PROBLEM_HOLD_MS = 2500;
const RECOVER_HOLD_MS = 1500;
const GPS_LOST_MS = 5000;
const GPS_FIRST_FIX_MS = 5000;
const IMU_STALL_MS = 1200;
const IMU_FIRST_SAMPLE_MS = 200;

const IMU_MIN_HZ = Number(
  (CORE_ANALYSIS_CONFIG.windowing.minImuSamples / (CORE_ANALYSIS_CONFIG.windowing.sizeMs / 1000)).toFixed(1)
);
const GPS_MIN_HZ = CORE_ANALYSIS_CONFIG.gps.minHz;
const GPS_MAX_ACCURACY_P95_M = CORE_ANALYSIS_CONFIG.gps.maxAccuracyP95M;

const DIAGNOSTIC_CATALOG: Record<DiagnosticKind, { title: string; severity: DiagnosticSeverity; sensor: 'gps' | 'motion' }> = {
  gps_lost: { title: 'GPS signal lost', severity: 'error', sensor: 'gps' },
  gps_low_rate: { title: 'GPS update rate low', severity: 'warn', sensor: 'gps' },
  gps_poor_accuracy: { title: 'GPS accuracy degraded', severity: 'warn', sensor: 'gps' },
  imu_stalled: { title: 'Motion sensor stalled', severity: 'error', sensor: 'motion' },
  imu_low_rate: { title: 'Motion sensor rate low', severity: 'warn', sensor: 'motion' },
  permission_denied_gps: { title: 'Location permission denied', severity: 'error', sensor: 'gps' },
  permission_denied_motion: { title: 'Motion permission denied', severity: 'error', sensor: 'motion' },
  unsupported_gps: { title: 'GPS unsupported', severity: 'error', sensor: 'gps' },
  unsupported_motion: { title: 'Motion sensors unsupported', severity: 'error', sensor: 'motion' }
};

const mergeMetrics = (prev: Record<string, number> | undefined, next: Record<string, number> | undefined) => {
  if (!next) return prev;
  if (!prev) return { ...next };
  const merged: Record<string, number> = { ...prev };
  Object.entries(next).forEach(([key, value]) => {
    if (!Number.isFinite(value)) return;
    const existing = merged[key];
    if (!Number.isFinite(existing)) {
      merged[key] = value;
      return;
    }
    if (key.startsWith('min')) {
      merged[key] = Math.min(existing, value);
      return;
    }
    if (key.startsWith('max')) {
      merged[key] = Math.max(existing, value);
      return;
    }
    if (key.endsWith('Count')) {
      merged[key] = Math.max(existing, value);
      return;
    }
    merged[key] = value;
  });
  return merged;
};

const buildIssueMetrics = (kind: DiagnosticKind, health?: CollectionHealth): Record<string, number> | undefined => {
  if (!health) return undefined;
  const gps = health.gps;
  const motion = health.motion;

  switch (kind) {
    case 'gps_lost':
      return gps ? {
        maxAgeMs: gps.lastSampleAgeMs ?? 0,
        samplesCount: gps.samplesCount ?? 0
      } : undefined;
    case 'gps_low_rate':
      return gps ? {
        minHz: gps.observedHz ?? 0,
        samplesCount: gps.samplesCount ?? 0
      } : undefined;
    case 'gps_poor_accuracy':
      return gps ? {
        accuracyP95: gps.accuracyP95M ?? 0,
        samplesCount: gps.samplesCount ?? 0
      } : undefined;
    case 'imu_stalled':
      return motion ? {
        maxAgeMs: motion.lastSampleAgeMs ?? 0,
        samplesCount: motion.samplesCount ?? 0
      } : undefined;
    case 'imu_low_rate':
      return motion ? {
        minHz: motion.observedHz ?? 0,
        samplesCount: motion.samplesCount ?? 0
      } : undefined;
    default:
      return undefined;
  }
};

const computeCandidates = (params: {
  health?: CollectionHealth | null;
  permissions?: DiagnosticsPermissions | null;
  capabilities?: CapabilitiesReport | null;
  nowMs: number;
  sessionStartMs: number | null;
  lastMotionSampleMs: number | null;
  lastGpsSampleMs: number | null;
}): { candidates: IssueCandidate[]; sensorStatus: Record<'gps' | 'motion', SensorStatus> } => {
  const { health, permissions, capabilities, nowMs, sessionStartMs, lastMotionSampleMs, lastGpsSampleMs } = params;
  const candidates: IssueCandidate[] = [];

  let gpsStatus: SensorStatus = 'OK';
  let motionStatus: SensorStatus = 'OK';

  const motionPerm = permissions?.motion ?? 'prompt';
  const gpsPerm = permissions?.location ?? 'prompt';

  const gpsHealth = health?.gps;
  const motionHealth = health?.motion;

  const gpsSamples = gpsHealth?.samplesCount ?? (lastGpsSampleMs ? 1 : 0);
  const motionSamples = motionHealth?.samplesCount ?? (lastMotionSampleMs ? 1 : 0);

  const gpsLastAge = gpsHealth?.lastSampleAgeMs ?? (lastGpsSampleMs ? nowMs - lastGpsSampleMs : null);
  const motionLastAge = motionHealth?.lastSampleAgeMs ?? (lastMotionSampleMs ? nowMs - lastMotionSampleMs : null);

  const gpsObservedHz = gpsHealth?.observedHz ?? 0;
  const motionObservedHz = motionHealth?.observedHz ?? 0;

  const gpsAccuracyP95 = gpsHealth?.accuracyP95M ?? null;

  const motionUnsupported = capabilities ? (!capabilities.deviceMotion.supportedByApi || !capabilities.deviceMotion.supportedInPractice) : false;
  const gpsUnsupported = capabilities ? (!capabilities.gps.supportedByApi || !capabilities.gps.supportedInPractice) : false;

  const gpsBaselineExceeded = sessionStartMs !== null && (nowMs - sessionStartMs) >= GPS_FIRST_FIX_MS && gpsSamples === 0;
  const motionBaselineExceeded = sessionStartMs !== null && (nowMs - sessionStartMs) >= IMU_FIRST_SAMPLE_MS && motionSamples === 0;

  if (motionPerm === 'denied') {
    motionStatus = 'DENIED';
    candidates.push({ kind: 'permission_denied_motion', immediate: true });
  } else if (motionPerm === 'unsupported' || motionUnsupported) {
    motionStatus = 'UNSUPPORTED';
    candidates.push({ kind: 'unsupported_motion', immediate: true });
  } else if ((motionLastAge !== null && motionLastAge > IMU_STALL_MS) || motionBaselineExceeded) {
    motionStatus = 'LOST';
    candidates.push({ kind: 'imu_stalled', immediate: motionBaselineExceeded });
  } else if (motionObservedHz > 0 && motionObservedHz < IMU_MIN_HZ) {
    motionStatus = 'DEGRADED';
    candidates.push({ kind: 'imu_low_rate', immediate: false });
  }

  if (gpsPerm === 'denied') {
    gpsStatus = 'DENIED';
    candidates.push({ kind: 'permission_denied_gps', immediate: true });
  } else if (gpsPerm === 'unsupported' || gpsUnsupported) {
    gpsStatus = 'UNSUPPORTED';
    candidates.push({ kind: 'unsupported_gps', immediate: true });
  } else if ((gpsLastAge !== null && gpsLastAge > GPS_LOST_MS) || gpsBaselineExceeded) {
    gpsStatus = 'LOST';
    candidates.push({ kind: 'gps_lost', immediate: gpsBaselineExceeded });
  } else {
    let degraded = false;
    if (gpsObservedHz > 0 && gpsObservedHz < GPS_MIN_HZ) {
      degraded = true;
      candidates.push({ kind: 'gps_low_rate', immediate: false });
    }
    if (gpsAccuracyP95 !== null && gpsAccuracyP95 > GPS_MAX_ACCURACY_P95_M) {
      degraded = true;
      candidates.push({ kind: 'gps_poor_accuracy', immediate: false });
    }
    if (degraded) {
      gpsStatus = 'DEGRADED';
    }
  }

  return { candidates, sensorStatus: { gps: gpsStatus, motion: motionStatus } };
};

export const createDiagnosticsManager = () => {
  let permissions: DiagnosticsPermissions | null = null;
  let capabilities: CapabilitiesReport | null = null;
  let lastHealth: CollectionHealth | null = null;
  let sessionStartMs: number | null = null;
  let isRecording = false;
  let sensorStatus: Record<'gps' | 'motion', SensorStatus> = { gps: 'OK', motion: 'OK' };
  let lastMotionSampleMs: number | null = null;
  let lastGpsSampleMs: number | null = null;

  const issueStates = new Map<DiagnosticKind, IssueState>();
  const openEvents = new Map<DiagnosticKind, DiagnosticEvent>();
  let sessionFindings: DiagnosticEvent[] = [];

  const resetIssueStates = () => {
    issueStates.clear();
    openEvents.clear();
    sessionFindings = [];
  };

  const updateStates = (nowMs: number) => {
    const { candidates, sensorStatus: computedStatus } = computeCandidates({
      health: lastHealth,
      permissions,
      capabilities,
      nowMs,
      sessionStartMs,
      lastMotionSampleMs,
      lastGpsSampleMs
    });

    sensorStatus = computedStatus;

    const activeKinds = new Set(candidates.map(c => c.kind));

    (Object.keys(DIAGNOSTIC_CATALOG) as DiagnosticKind[]).forEach((kind) => {
      const candidate = candidates.find(c => c.kind === kind);
      const isProblem = activeKinds.has(kind);
      const immediate = candidate?.immediate ?? false;
      const metrics = buildIssueMetrics(kind, lastHealth || undefined);

      const prev = issueStates.get(kind) || {
        active: false,
        pendingSinceMs: null,
        recoverSinceMs: null,
        openedAtMs: null
      };

      if (isProblem) {
        if (prev.active) {
          prev.metrics = mergeMetrics(prev.metrics, metrics);
          const open = openEvents.get(kind);
          if (open) {
            open.metrics = mergeMetrics(open.metrics, metrics);
          }
        } else {
          const pendingSince = prev.pendingSinceMs ?? nowMs;
          const ready = immediate || (nowMs - pendingSince) >= PROBLEM_HOLD_MS;
          if (ready) {
            prev.active = true;
            prev.pendingSinceMs = null;
            prev.recoverSinceMs = null;
            prev.openedAtMs = pendingSince;
            prev.metrics = mergeMetrics(prev.metrics, metrics);

            if (isRecording && sessionStartMs !== null) {
              const tStartSec = Number(((pendingSince - sessionStartMs) / 1000).toFixed(2));
              openEvents.set(kind, {
                kind,
                tStartSec,
                tEndSec: null,
                durationSec: null,
                metrics: mergeMetrics(undefined, metrics),
                severity: DIAGNOSTIC_CATALOG[kind].severity
              });
            }
          } else {
            prev.pendingSinceMs = pendingSince;
          }
        }
      } else {
        if (prev.active) {
          const recoverSince = prev.recoverSinceMs ?? nowMs;
          const ready = (nowMs - recoverSince) >= RECOVER_HOLD_MS;
          if (ready) {
            prev.active = false;
            prev.recoverSinceMs = null;
            prev.pendingSinceMs = null;
            prev.openedAtMs = null;
            prev.metrics = undefined;

            const open = openEvents.get(kind);
            if (open && sessionStartMs !== null) {
              const tEndSec = Number(((nowMs - sessionStartMs) / 1000).toFixed(2));
              open.tEndSec = tEndSec;
              open.durationSec = Number((tEndSec - open.tStartSec).toFixed(2));
              sessionFindings = [...sessionFindings, open];
              openEvents.delete(kind);
            }
          } else {
            prev.recoverSinceMs = recoverSince;
          }
        } else {
          prev.pendingSinceMs = null;
          prev.recoverSinceMs = null;
          prev.metrics = undefined;
        }
      }

      issueStates.set(kind, prev);
    });
  };

  const buildSnapshot = (): DiagnosticsSnapshot => {
    const activeIssues: DiagnosticIssue[] = [];
    issueStates.forEach((state, kind) => {
      if (!state.active) return;
      const catalog = DIAGNOSTIC_CATALOG[kind];
      activeIssues.push({
        kind,
        title: catalog.title,
        severity: catalog.severity,
        sensor: catalog.sensor,
        status: sensorStatus[catalog.sensor],
        metrics: state.metrics
      });
    });

    const open = Array.from(openEvents.values());
    const findings = [...sessionFindings, ...open].sort((a, b) => a.tStartSec - b.tStartSec);
    const issuesCount = activeIssues.length;

    return {
      activeIssues,
      sessionFindings: findings,
      sensorStatus,
      summary: {
        status: issuesCount > 0 ? 'Issues' : 'OK',
        issuesCount
      }
    };
  };

  return {
    updatePermissions: (next: DiagnosticsPermissions | null) => {
      permissions = next;
    },
    updateCapabilities: (next: CapabilitiesReport | null) => {
      capabilities = next;
    },
    recordSample: (sample: UnifiedSampleV2) => {
      if (sample.sensors.motion) {
        lastMotionSampleMs = sample.timestamp;
      }
      if (sample.sensors.gps?.timestamp) {
        if (!lastGpsSampleMs || sample.sensors.gps.timestamp !== lastGpsSampleMs) {
          lastGpsSampleMs = sample.sensors.gps.timestamp;
        }
      }
    },
    updateHealth: (health: CollectionHealth, nowMs: number) => {
      lastHealth = health;
      updateStates(nowMs);
      return buildSnapshot();
    },
    tick: (nowMs: number) => {
      updateStates(nowMs);
      return buildSnapshot();
    },
    resetAll: (nowMs: number) => {
      isRecording = false;
      sessionStartMs = null;
      lastHealth = null;
      lastMotionSampleMs = null;
      lastGpsSampleMs = null;
      resetIssueStates();
      updateStates(nowMs);
      return buildSnapshot();
    },
    startSession: (nowMs: number) => {
      isRecording = true;
      sessionStartMs = nowMs;
      lastHealth = null;
      lastMotionSampleMs = null;
      lastGpsSampleMs = null;
      resetIssueStates();
      updateStates(nowMs);
      return buildSnapshot();
    },
    stopSession: (nowMs: number) => {
      if (sessionStartMs !== null) {
        openEvents.forEach((open) => {
          const tEndSec = Number(((nowMs - sessionStartMs!) / 1000).toFixed(2));
          open.tEndSec = tEndSec;
          open.durationSec = Number((tEndSec - open.tStartSec).toFixed(2));
          sessionFindings = [...sessionFindings, open];
        });
        openEvents.clear();
      }
      isRecording = false;
      return buildSnapshot();
    },
    getSnapshot: () => buildSnapshot()
  };
};
