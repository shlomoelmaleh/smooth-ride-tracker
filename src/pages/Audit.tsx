import { useState, useEffect, useRef } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
    ShieldCheck,
    Activity,
    Download,
    Copy,
    Play,
    AlertCircle,
    AlertTriangle,
    Info,
    CheckCircle2,
    Clock,
    Square
} from 'lucide-react';
import { toast } from 'sonner';
import pkg from '../../package.json';
import { detectCapabilities, requestSensorPermissions } from '@/sensors/sensorRegistry';
import { startCollectors } from '@/sensors/sensorCollector';
import { CapabilitiesReport, CollectionHealth, StreamHealth, UnifiedSampleV2 } from '@/sensors/sensorTypes';
import { createEngine } from '@/core';
import { buildCoreWindowing } from '@/core/windowing';
import { AnalyzeResultV1, CoreFrameV1, SegmentSummaryV1, WindowingResultV1 } from '@/core/types';
import { createDiagnosticsManager, DiagnosticEvent, DiagnosticIssue, DiagnosticsSummary } from '@/diagnostics/diagnostics';

type RideProfile = 'private_car' | 'bus';
type ManualEventType = 'hazard' | 'stop' | 'hard_brake';
type ManualEvent = {
    id: string;
    type: ManualEventType;
    source: 'manual';
    tMs: number;
    wallTimeIso: string;
    rideProfile: RideProfile;
};

const FREE_PLAY_DURATION_MS = -1;

const Audit = () => {
    const [permissions, setPermissions] = useState<{ motion: string, location: string }>({
        motion: 'prompt',
        location: 'prompt'
    });

    const [capabilities, setCapabilities] = useState<CapabilitiesReport | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [isLive, setIsLive] = useState(false);
    const [selectedDuration, setSelectedDuration] = useState(30000); // Default 30s
    const [testProgress, setTestProgress] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [liveHealth, setLiveHealth] = useState<CollectionHealth | null>(null);
    const [liveData, setLiveData] = useState<UnifiedSampleV2 | null>(null);
    const [testResults, setTestResults] = useState<CollectionHealth | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AnalyzeResultV1 | null>(null);
    const [coreWindowing, setCoreWindowing] = useState<WindowingResultV1 | null>(null);
    const [manualEvents, setManualEvents] = useState<ManualEvent[]>([]);
    const [recordingStartMs, setRecordingStartMs] = useState<number | null>(null);
    const [activeDiagnostics, setActiveDiagnostics] = useState<DiagnosticIssue[]>([]);
    const [sessionFindings, setSessionFindings] = useState<DiagnosticEvent[]>([]);
    const [diagnosticsSummary, setDiagnosticsSummary] = useState<DiagnosticsSummary>({ status: 'OK', issuesCount: 0 });
    const [selectedProfile, setSelectedProfile] = useState<RideProfile | null>(null);
    const [sessionProfile, setSessionProfile] = useState<RideProfile | null>(null);
    const [profileLocked, setProfileLocked] = useState(false);

    const collectorRef = useRef<{ stop: () => void } | null>(null);
    const engineRef = useRef(createEngine());
    const diagnosticsRef = useRef(createDiagnosticsManager());
    const auditFramesRef = useRef<CoreFrameV1[]>([]);
    const recordingStartMsRef = useRef<number | null>(null);
    const baselineTimersRef = useRef<number[]>([]);
    const manualEventsRef = useRef<ManualEvent[]>([]);
    const manualEventHandledRef = useRef(false);
    const diagnosticsPrevRef = useRef<string>('');
    const findingsCountRef = useRef(0);
    const lastHealthRef = useRef<CollectionHealth | null>(null);

    // Toggle to omit per-window summaries from exported Audit JSON.
    const includeWindowSummaries = true;
    const isFreePlay = selectedDuration === FREE_PLAY_DURATION_MS;
    const durationLabel = isFreePlay ? 'Free play' : `${selectedDuration / 1000}s`;

    useEffect(() => {
        const checkInitial = async () => {
            const caps = await detectCapabilities();
            setCapabilities(caps);
            diagnosticsRef.current.updateCapabilities(caps);
        };
        checkInitial();
        return () => {
            collectorRef.current?.stop();
            baselineTimersRef.current.forEach((timer) => window.clearTimeout(timer));
            baselineTimersRef.current = [];
        };
    }, []);

    useEffect(() => {
        const current = activeDiagnostics.map(issue => issue.kind).sort().join('|');
        if (current !== diagnosticsPrevRef.current) {
            console.info('Audit: diagnostics updated', {
                active: activeDiagnostics.map(issue => issue.kind),
                status: diagnosticsSummary.status,
                issuesCount: diagnosticsSummary.issuesCount
            });
            diagnosticsPrevRef.current = current;
        }
    }, [activeDiagnostics, diagnosticsSummary]);

    useEffect(() => {
        if (sessionFindings.length !== findingsCountRef.current) {
            console.info('Audit: session findings updated', { count: sessionFindings.length });
            findingsCountRef.current = sessionFindings.length;
        }
    }, [sessionFindings.length]);

    const handleRequestPermissions = async () => {
        const perms = await requestSensorPermissions();
        setPermissions({ motion: perms.motion, location: perms.location });
        diagnosticsRef.current.updatePermissions(perms);
        const caps = await detectCapabilities(); // Refresh
        setCapabilities(caps);
        diagnosticsRef.current.updateCapabilities(caps);
        console.info('Audit: permissions checked', perms);
    };

    const handleProfileSelect = (profile: RideProfile) => {
        if (profileLocked || isTesting) {
            console.error('Audit: profile change blocked during recording', { attempted: profile, active: sessionProfile });
            return;
        }
        setSelectedProfile(profile);
        console.info('Audit: profile selected', { profile });
    };

    const stopAuditRun = (health: CollectionHealth | null, stoppedAtMs: number) => {
        const startedAt = recordingStartMsRef.current;
        collectorRef.current?.stop();
        setIsTesting(false);
        setTestResults(health ?? lastHealthRef.current);
        baselineTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        baselineTimersRef.current = [];
        const finalSnapshot = diagnosticsRef.current.stopSession(stoppedAtMs);
        setSessionFindings(finalSnapshot.sessionFindings);
        setDiagnosticsSummary(finalSnapshot.summary);
        setProfileLocked(false);
        console.info('Audit: recording stopped', { elapsedMs: startedAt ? stoppedAtMs - startedAt : 0, profile: sessionProfile });
        setRecordingStartMs(null);
        recordingStartMsRef.current = null;

        // Finalize Analysis
        if (capabilities) {
            engineRef.current.setCapabilities({
                deviceMotion: capabilities.deviceMotion,
                gps: capabilities.gps
            });
        }
        const analysis = engineRef.current.finalize();
        setAnalysisResult(analysis);

        const analysisSnapshot = JSON.stringify(analysis);
        const manualEventsForWindowing = manualEventsRef.current.map((event) => ({
            tSec: Math.round((event.tMs / 1000) * 10) / 10,
            kind: 'tap' as const
        }));
        const windowingResult = buildCoreWindowing(
            auditFramesRef.current,
            undefined,
            undefined,
            manualEventsForWindowing
        );
        setCoreWindowing(windowingResult);
        const analysisSnapshotAfter = JSON.stringify(analysis);

        if (analysisSnapshotAfter !== analysisSnapshot) {
            console.warn('Audit: Windowing mutated analysis output');
        }
    };

    const runAuditTest = () => {
        if (!selectedProfile) {
            toast.error('Select a ride profile before recording');
            console.warn('Audit: recording blocked, no profile selected');
            return;
        }
        if (isLive) return; // Prevent concurrent collectors
        setIsTesting(true);
        setProfileLocked(true);
        setSessionProfile(selectedProfile);
        setTestProgress(0);
        setElapsedTime(0);
        setTestResults(null);
        setAnalysisResult(null);
        setCoreWindowing(null);
        engineRef.current.reset();
        auditFramesRef.current = [];
        setManualEvents([]);
        manualEventsRef.current = [];
        lastHealthRef.current = null;
        console.info('Audit: recording started', { profile: selectedProfile, durationMs: isFreePlay ? 'free' : selectedDuration });
        const duration = isFreePlay ? null : selectedDuration;
        const startAt = Date.now();
        const diagnosticsSnapshot = diagnosticsRef.current.startSession(startAt);
        setActiveDiagnostics(diagnosticsSnapshot.activeIssues);
        setSessionFindings(diagnosticsSnapshot.sessionFindings);
        setDiagnosticsSummary(diagnosticsSnapshot.summary);
        recordingStartMsRef.current = startAt;
        setRecordingStartMs(startAt);
        baselineTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        baselineTimersRef.current = [
            window.setTimeout(() => {
                const snapshot = diagnosticsRef.current.tick(Date.now());
                setActiveDiagnostics(snapshot.activeIssues);
                setSessionFindings(snapshot.sessionFindings);
                setDiagnosticsSummary(snapshot.summary);
            }, 250),
            window.setTimeout(() => {
                const snapshot = diagnosticsRef.current.tick(Date.now());
                setActiveDiagnostics(snapshot.activeIssues);
                setSessionFindings(snapshot.sessionFindings);
                setDiagnosticsSummary(snapshot.summary);
            }, 5000)
        ];

        const collector = startCollectors({
            onSample: (sample) => {
                // Convert to CoreFrameV1 for engine
                const frame: CoreFrameV1 = {
                    schema: 1,
                    timestamp: sample.timestamp,
                    accG: sample.sensors.motion?.accelGravity || { x: 0, y: 0, z: 0 },
                    linAcc: sample.sensors.motion?.accel,
                    gyroRate: sample.sensors.motion?.rotationRate,
                    gps: sample.sensors.gps ? {
                        lat: sample.sensors.gps.lat,
                        lon: sample.sensors.gps.lon,
                        accuracy: sample.sensors.gps.accuracy,
                        speed: sample.sensors.gps.speed,
                        heading: sample.sensors.gps.heading,
                        timestamp: sample.sensors.gps.timestamp
                    } : undefined
                };
                engineRef.current.ingest(frame);
                auditFramesRef.current.push(frame);
                diagnosticsRef.current.recordSample(sample);
            },
            onHealthUpdate: (health) => {
                const now = Date.now();
                const elapsed = now - startAt;
                setElapsedTime(Math.floor(elapsed / 1000));
                lastHealthRef.current = health;
                if (duration) {
                    setTestProgress(Math.min(100, (elapsed / duration) * 100));
                } else {
                    setTestProgress(0);
                }
                const diagnosticsSnapshot = diagnosticsRef.current.updateHealth(health, now);
                setActiveDiagnostics(diagnosticsSnapshot.activeIssues);
                setSessionFindings(diagnosticsSnapshot.sessionFindings);
                setDiagnosticsSummary(diagnosticsSnapshot.summary);

                if (duration && elapsed >= duration) {
                    stopAuditRun(health, now);
                }
            }
        });
        collectorRef.current = collector;
    };

    const handleStopRun = () => {
        if (!isTesting) return;
        const now = Date.now();
        stopAuditRun(lastHealthRef.current, now);
    };

    const handleManualEvent = (type: ManualEventType) => {
        if (!isTesting || recordingStartMsRef.current === null || recordingStartMs === null || !sessionProfile) return;
        const now = Date.now();
        const tMs = now - recordingStartMsRef.current;
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${now}-${Math.random().toString(36).slice(2, 10)}`;
        const nextEvent: ManualEvent = {
            id,
            type,
            source: 'manual',
            tMs,
            wallTimeIso: new Date(now).toISOString(),
            rideProfile: sessionProfile
        };
        setManualEvents((prev) => [...prev, nextEvent]);
        manualEventsRef.current = [...manualEventsRef.current, nextEvent];
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(10);
        }
        const toastLabel = type === 'hard_brake' ? 'HARD_BRAKE' : type.toUpperCase();
        toast.success(`Saved: ${toastLabel}`);
        console.info('Audit: manual event', { type, tMs });
    };

    const handleManualEventRelease = (type: ManualEventType) => {
        if (manualEventHandledRef.current) return;
        manualEventHandledRef.current = true;
        handleManualEvent(type);
        window.setTimeout(() => {
            manualEventHandledRef.current = false;
        }, 0);
    };

    const toggleLiveSampling = () => {
        if (isTesting) return; // Prevent conflict
        if (isLive) {
            collectorRef.current?.stop();
            setIsLive(false);
            baselineTimersRef.current.forEach((timer) => window.clearTimeout(timer));
            baselineTimersRef.current = [];
            const snapshot = diagnosticsRef.current.resetAll(Date.now());
            setActiveDiagnostics(snapshot.activeIssues);
            setSessionFindings(snapshot.sessionFindings);
            setDiagnosticsSummary(snapshot.summary);
        } else {
            setIsLive(true);
            baselineTimersRef.current.forEach((timer) => window.clearTimeout(timer));
            baselineTimersRef.current = [];
            const snapshot = diagnosticsRef.current.resetAll(Date.now());
            setActiveDiagnostics(snapshot.activeIssues);
            setSessionFindings(snapshot.sessionFindings);
            setDiagnosticsSummary(snapshot.summary);
            const collector = startCollectors({
                onSample: (s) => {
                    setLiveData(s);
                    diagnosticsRef.current.recordSample(s);
                },
                onHealthUpdate: (h) => {
                    setLiveHealth(h);
                    const diagnosticsSnapshot = diagnosticsRef.current.updateHealth(h, Date.now());
                    setActiveDiagnostics(diagnosticsSnapshot.activeIssues);
                    setSessionFindings(diagnosticsSnapshot.sessionFindings);
                    setDiagnosticsSummary(diagnosticsSnapshot.summary);
                }
            });
            collectorRef.current = collector;
        }
    };

    const sanitizeCoreAnalysisForExport = (analysis: AnalyzeResultV1 | null): any => {
        if (!analysis) return null;
        // Deep clone to avoid mutating state
        const sanitized = JSON.parse(JSON.stringify(analysis));

        // Remove any leaked lat/lon if they were ever added to the result by mistake
        if (sanitized.gps) {
            delete sanitized.gps.lat;
            delete sanitized.gps.lon;
        }

        if (sanitized.impactEvents) {
            sanitized.impactEvents.forEach((ev: any) => {
                if (ev.gpsContext) {
                    delete ev.gpsContext.lat;
                    delete ev.gpsContext.lon;
                }
            });
        }

        return sanitized;
    };

    const pickTopSegments = (segments: SegmentSummaryV1[], limit: number) => {
        return [...segments]
            .sort((a, b) => (b.tEndSec - b.tStartSec) - (a.tEndSec - a.tStartSec))
            .slice(0, limit);
    };

    const buildCoreSummary = (analysis: AnalyzeResultV1 | null, windowing: WindowingResultV1 | null): any => {
        if (!analysis) return null;

        return {
            rideProfile: sessionProfile,
            durationMs: analysis.durationMs,
            imu: {
                hz: analysis.imu.observedHz,
                dtMedian: analysis.imu.dtMedian,
                dtP95: analysis.imu.dtP95,
                accelRms: analysis.imu.accelRms,
                accelP95: analysis.imu.accelP95,
                jerkRms: analysis.imu.jerkRms,
                jerkP95: analysis.imu.jerkP95,
                gyroRms: analysis.imu.gyroRms,
                gyroP95: analysis.imu.gyroP95
            },
            gps: {
                samplesCount: analysis.gps.samplesCount,
                hz: analysis.gps.observedHz,
                accuracyMedianM: analysis.gps.accuracyMedianM,
                accuracyP95M: analysis.gps.accuracyP95M,
                hasSpeedObserved: analysis.gps.hasSpeedObserved
            },
            flags: analysis.flags,
            impactEventsCount: analysis.impactEvents.length,
            topImpactEvents: analysis.impactEvents.slice(0, 5).map(ev => ({
                tPeakSec: Number(((ev.tPeak - analysis.impactEvents[0].tStart) / 1000).toFixed(1)),
                peakAcc: ev.peakAcc,
                energyIndex: ev.energyIndex
            })),
            windowEventsCount: windowing?.events.length || 0,
            topWindowEvents: windowing?.events.slice(0, 5) || [],
            windowsCount: windowing?.windows.length || 0,
            segmentsCount: windowing?.segments.length || 0,
            topSegments: windowing ? pickTopSegments(windowing.segments, 5) : [],
            manualEventsCount: manualEvents.length,
            manualEvents
        };
    };

    const buildFlagsFromFindings = (findings: DiagnosticEvent[]) => {
        const grouped = new Map<string, { kind: string; severity: string; firstSeenSec: number; lastSeenSec: number }>();
        findings.forEach((finding) => {
            const key = finding.kind;
            const firstSeen = finding.tStartSec;
            const lastSeen = finding.tEndSec ?? finding.tStartSec;
            const existing = grouped.get(key);
            if (!existing) {
                grouped.set(key, {
                    kind: finding.kind,
                    severity: finding.severity,
                    firstSeenSec: firstSeen,
                    lastSeenSec: lastSeen
                });
                return;
            }
            existing.firstSeenSec = Math.min(existing.firstSeenSec, firstSeen);
            existing.lastSeenSec = Math.max(existing.lastSeenSec, lastSeen);
        });
        return Array.from(grouped.values());
    };

    const formatSeconds = (value: number | null) => {
        if (value === null || Number.isNaN(value)) return '-';
        return `${value.toFixed(1)}s`;
    };

    const formatFindingWindow = (finding: DiagnosticEvent) => {
        const start = formatSeconds(finding.tStartSec);
        const end = finding.tEndSec === null ? 'open' : formatSeconds(finding.tEndSec);
        const duration = finding.durationSec === null ? '-' : formatSeconds(finding.durationSec);
        return `${start} -> ${end} (${duration})`;
    };

    const generateReport = () => {
        const sanitizedCore = sanitizeCoreAnalysisForExport(analysisResult);
        const durationSec = analysisResult?.durationMs
            ? analysisResult.durationMs / 1000
            : isFreePlay
                ? elapsedTime
                : selectedDuration / 1000;
        const coreAnalysisWindows = includeWindowSummaries && coreWindowing
            ? {
                windowSizeMs: coreWindowing.windowSizeMs,
                stepMs: coreWindowing.stepMs,
                windowsCount: coreWindowing.windows.length,
                windows: coreWindowing.windows
            }
            : undefined;
        const sessionFindingsForExport = sessionFindings.length > 0 ? sessionFindings : undefined;
        const auditMetadata = sessionProfile ? { rideProfile: sessionProfile, profileLocked: true } : undefined;
        return {
            generatedAt: new Date().toISOString(),
            app: { name: "SmartRide", version: pkg.version, schema: 2 },
            device: {
                userAgent: navigator.userAgent,
                platform: (navigator as any).platform || 'unknown',
            },
            permissions,
            capabilities,
            ...(auditMetadata ? { auditMetadata } : {}),
            testDurationSec: durationSec,
            observed: testResults || liveHealth,
            coreAnalysis: sanitizedCore,
            coreSummary: buildCoreSummary(analysisResult, coreWindowing),
            coreAnalysisWindows,
            coreSegments: coreWindowing?.segments,
            coreWindowingEvents: coreWindowing?.events,
            ...(sessionFindingsForExport ? { sessionFindings: sessionFindingsForExport } : {}),
            ...(sessionFindingsForExport ? { flags: buildFlagsFromFindings(sessionFindingsForExport) } : {})
        };
    };

    const exportReport = () => {
        const report = generateReport();
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartride_audit_v${pkg.version}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Report exported');
    };

    return (
        <Layout>
            <div className="w-full max-w-2xl mx-auto pb-20 px-6 pt-4 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="space-y-1">
                    <Badge variant="outline" className="text-[9px] uppercase tracking-widest font-black px-2 py-0.5 bg-primary/5 text-primary/60 border-primary/20">
                        Unified Sensor Engine v{pkg.version}
                    </Badge>
                    <h1 className="text-3xl font-bold tracking-tight">Audit</h1>
                    <p className="text-sm text-muted-foreground/60 font-medium tracking-tight">
                        Standardized sensor collection & health profiling
                    </p>
                </div>

                {/* PERMISSIONS */}
                <Card className="border-none bg-card/40 shadow-none ring-1 ring-border/50 rounded-3xl overflow-hidden">
                    <CardHeader className="pb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Permissions</h3>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <StatusBox label="Motion" status={permissions.motion} />
                            <StatusBox label="Location" status={permissions.location} />
                        </div>
                        <Button onClick={handleRequestPermissions} className="w-full rounded-2xl h-12 font-bold shadow-lg shadow-primary/10">
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Request Permissions
                        </Button>
                    </CardContent>
                </Card>

                {/* CAPABILITIES */}
                <div className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 px-1">Capabilities</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <CapRow label="Motion" cap={capabilities?.deviceMotion} />
                        <CapRow label="Orientation" cap={capabilities?.deviceOrientation} />
                        <CapRow label="Gyro Rate" cap={capabilities?.gyroscopeRate} />
                        <CapRow label="Linear Accel" cap={capabilities?.linearAcceleration} />
                        <CapRow label="Accel (with G)" cap={capabilities?.accelerometer} />
                        <CapRow label="GPS Fix" cap={capabilities?.gps} />
                    </div>
                </div>

                {/* RIDE PROFILE */}
                <Card className="border-none bg-card/40 shadow-none ring-1 ring-border/50 rounded-3xl overflow-hidden">
                    <CardHeader className="pb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Ride Profile</h3>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            {([
                                { id: 'private_car', label: 'Private Car' },
                                { id: 'bus', label: 'Bus' }
                            ] as const).map(option => {
                                const isSelected = selectedProfile === option.id;
                                return (
                                    <Button
                                        key={option.id}
                                        type="button"
                                        variant={isSelected ? 'default' : 'outline'}
                                        disabled={profileLocked || isTesting}
                                        onClick={() => handleProfileSelect(option.id)}
                                        className={`h-12 rounded-2xl font-bold uppercase tracking-widest text-[10px] ${isSelected ? 'shadow-lg shadow-primary/20' : ''}`}
                                    >
                                        {option.label}
                                    </Button>
                                );
                            })}
                        </div>
                        {!selectedProfile && (
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center">
                                Select a profile to enable recording
                            </p>
                        )}
                        {(profileLocked || isTesting) && (
                            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600/70 text-center">
                                Profile locked during recording
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* LIVE SNAPSHOT */}
                <Card className="border-none bg-card/40 shadow-none ring-1 ring-border/50 rounded-3xl overflow-hidden border-l-2 border-l-blue-500/20">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Live Snapshot</h3>
                        <Button
                            variant={isLive ? "destructive" : "secondary"}
                            size="sm"
                            disabled={isTesting}
                            onClick={toggleLiveSampling}
                            className="h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-widest"
                        >
                            {isLive ? <Square className="mr-1.5 h-3 w-3 fill-current" /> : <Play className="mr-1.5 h-3 w-3 fill-current" />}
                            {isLive ? 'Stop' : 'Start Live'}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isLive ? (
                            <div className="grid grid-cols-2 gap-4">
                                <LiveMetric label="Accel (with G)" val={liveData?.sensors?.motion?.accelGravity} u="m/s²" />
                                <LiveMetric label="Rotation" val={liveData?.sensors?.motion?.rotationRate} u="rad/s" />
                                <LiveMetric label="Orientation" val={liveData?.sensors?.orientation} u="°" />
                                <div className="p-3 bg-muted/20 rounded-2xl space-y-1">
                                    <span className="text-[9px] uppercase font-black text-muted-foreground/40">GPS Status</span>
                                    <div className="flex items-baseline space-x-1">
                                        <span className="text-sm font-black">{liveData?.sensors?.gps?.accuracy ? `${liveData.sensors.gps.accuracy.toFixed(1)}m` : 'No Fix'}</span>
                                        <span className="text-[10px] font-bold text-muted-foreground/40 uppercase leading-none">{liveHealth?.gps?.observedHz || 0} Hz</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-center py-4 text-[11px] font-medium text-muted-foreground/40">Start sampling to see real-time data</p>
                        )}
                    </CardContent>
                </Card>

                {/* AUDIT TEST */}
                <Card className="border-none bg-primary/[0.03] shadow-none ring-1 ring-primary/10 rounded-3xl overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40">Audit Test</h3>
                        {!isTesting && !testResults && (
                            <div className="flex bg-muted/30 p-0.5 rounded-full ring-1 ring-border/20">
                                {[
                                    { value: 10000, label: '10s' },
                                    { value: 30000, label: '30s' },
                                    { value: 60000, label: '60s' },
                                    { value: 300000, label: '300s' },
                                    { value: FREE_PLAY_DURATION_MS, label: 'Free' }
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => setSelectedDuration(option.value)}
                                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter transition-all ${selectedDuration === option.value ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {!testResults && !isTesting ? (
                            <div className="py-8 text-center space-y-4">
                                <p className="text-xs text-muted-foreground/60 max-w-xs mx-auto font-medium">
                                    High-performance diagnostic profiling for motion, orientation, and GPS stability.
                                </p>
                                <Button
                                    onClick={runAuditTest}
                                    disabled={isLive || !selectedProfile}
                                    className="rounded-full px-10 h-14 font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                                >
                                    Run Audit ({durationLabel})
                                </Button>
                            </div>
                        ) : isTesting ? (
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-primary/60 text-center sm:text-left">
                                        Manual Events
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onPointerUp={() => handleManualEventRelease('hazard')}
                                            onTouchEnd={() => handleManualEventRelease('hazard')}
                                            className="h-10 px-4 w-full rounded-xl text-[11px] font-black uppercase tracking-widest border-2 border-primary/50 text-primary bg-background/80 hover:bg-primary/5 shadow-sm"
                                        >
                                            מפגע בדרך
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onPointerUp={() => handleManualEventRelease('stop')}
                                            onTouchEnd={() => handleManualEventRelease('stop')}
                                            className="h-10 px-4 w-full rounded-xl text-[11px] font-black uppercase tracking-widest border-2 border-primary/50 text-primary bg-background/80 hover:bg-primary/5 shadow-sm"
                                        >
                                            עצירה
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onPointerUp={() => handleManualEventRelease('hard_brake')}
                                            onTouchEnd={() => handleManualEventRelease('hard_brake')}
                                            className="h-10 px-4 w-full rounded-xl text-[11px] font-black uppercase tracking-widest border-2 border-primary/50 text-primary bg-background/80 hover:bg-primary/5 shadow-sm"
                                        >
                                            בלימה חזקה
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-primary/60 px-1">
                                    <span className="flex items-center"><Activity className="mr-2 h-3 w-3 animate-pulse" /> Profiling...</span>
                                    <span>{elapsedTime}s / {durationLabel}</span>
                                </div>
                                {!isFreePlay && <Progress value={testProgress} className="h-1.5 bg-primary/10" />}
                                {isFreePlay && (
                                    <Button
                                        onClick={handleStopRun}
                                        variant="destructive"
                                        className="w-full h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                                    >
                                        <Square className="mr-2 h-3 w-3 fill-current" />
                                        Stop run
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6 scale-in-sm duration-300">
                                {/* Summary Snapshot */}
                                <div className="grid grid-cols-3 gap-2 pb-2">
                                    <SummaryMini label="Motion" hz={testResults?.motion?.observedHz} score={testResults?.motion?.dtMsP95} u="Hz" />
                                    <SummaryMini label="Orient" hz={testResults?.orientation?.observedHz} score={testResults?.orientation?.dtMsP95} u="Hz" />
                                    <SummaryMini label="GPS Fix" hz={testResults?.gps?.observedHz} score={testResults?.gps?.accuracyMedianM} u="m" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <ResultCard label="Motion" health={testResults?.motion} />
                                    <ResultCard label="Orientation" health={testResults?.orientation} />
                                    <ResultCard label="GPS / Location" health={testResults?.gps} />
                                </div>

                                {/* Core Analysis v1 Section */}
                                {analysisResult && (
                                    <div className="space-y-4 pt-4 border-t border-primary/10">
                                        <div className="flex items-center space-x-2">
                                            <Activity className="h-4 w-4 text-primary opacity-40" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40">Core Analysis (v1)</h3>
                                            <Badge variant="outline" className="text-[8px] font-bold opacity-30 px-1 leading-none rounded-md">BATCH</Badge>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 bg-primary/[0.03] rounded-2xl border border-primary/5 space-y-2">
                                                <span className="text-[8px] font-black uppercase text-primary/40 tracking-tight">IMU High-Fidelity</span>
                                                <div className="space-y-1">
                                                    <MetricLine label="Accel RMS" val={analysisResult.imu.accelRms} u="m/s²" />
                                                    <MetricLine label="Accel P95" val={analysisResult.imu.accelP95} u="m/s²" />
                                                    <MetricLine label="Jerk RMS" val={analysisResult.imu.jerkRms} u="m/s³" />
                                                    <MetricLine label="Jerk P95" val={analysisResult.imu.jerkP95} u="m/s³" />
                                                </div>
                                            </div>

                                            <div className="p-3 bg-primary/[0.03] rounded-2xl border border-primary/5 space-y-2">
                                                <span className="text-[8px] font-black uppercase text-primary/40 tracking-tight">Impact Detection</span>
                                                <div className="flex items-baseline space-x-1">
                                                    <span className="text-xl font-black text-primary/80">{analysisResult.impactEvents.length}</span>
                                                    <span className="text-[9px] font-bold text-primary/40 uppercase">Events</span>
                                                </div>
                                                <div className="space-y-1 pt-1 max-h-[80px] overflow-y-auto pr-1 custom-scrollbar">
                                                    {analysisResult.impactEvents.length > 0 ? (
                                                        analysisResult.impactEvents.slice(0, 3).map((ev, i) => (
                                                            <div key={i} className="text-[9px] font-bold py-1 border-b border-primary/5 last:border-0 flex justify-between items-center">
                                                                <span className="text-primary/60">@{((ev.tPeak - analysisResult.impactEvents[0].tStart + 1) / 1000).toFixed(1)}s</span>
                                                                <span className="font-mono text-primary/80">{ev.peakAcc}g</span>
                                                                <span className="text-[8px] opacity-40 px-1 bg-primary/10 rounded">E:{ev.energyIndex}</span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-[9px] font-medium text-muted-foreground/30 italic py-2">No significant impacts</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pt-1 text-[8px] font-bold text-green-600/60 flex items-center justify-center opacity-80">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Export includes Core Analysis ✅
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2 pt-2">
                                    <Button variant="ghost" onClick={runAuditTest} className="w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/30 h-12 rounded-2xl">
                                        Restart Profile
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* DIAGNOSTICS */}
                <div className="space-y-6">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Active Diagnostics (Live)</h4>
                            <Badge variant="outline" className={`text-[9px] font-black uppercase tracking-widest ${diagnosticsSummary.status === 'OK' ? 'text-green-600 border-green-600/20 bg-green-500/5' : 'text-amber-600 border-amber-600/20 bg-amber-500/10'}`}>
                                {diagnosticsSummary.status === 'OK' ? 'OK' : `Issues ${diagnosticsSummary.issuesCount}`}
                            </Badge>
                        </div>
                        {activeDiagnostics.length > 0 ? (
                            <div className="space-y-2">
                                {activeDiagnostics.map((issue, i) => {
                                    const icon = issue.severity === 'error'
                                        ? <AlertCircle className="h-4 w-4 shrink-0 opacity-70 text-red-600" />
                                        : issue.severity === 'warn'
                                            ? <AlertTriangle className="h-4 w-4 shrink-0 opacity-70 text-amber-600" />
                                            : <Info className="h-4 w-4 shrink-0 opacity-70 text-blue-600" />;
                                    const tone = issue.severity === 'error'
                                        ? 'bg-red-500/5 text-red-700 ring-1 ring-red-500/10'
                                        : issue.severity === 'warn'
                                            ? 'bg-amber-500/5 text-amber-700 ring-1 ring-amber-500/10'
                                            : 'bg-blue-500/5 text-blue-700 ring-1 ring-blue-500/10';
                                    return (
                                        <div key={`${issue.kind}-${i}`} className={`flex items-center space-x-3 p-4 rounded-2xl ${tone}`}>
                                            {icon}
                                            <div className="flex-1">
                                                <div className="text-[11px] font-bold">{issue.title}</div>
                                                <div className="text-[9px] font-bold uppercase tracking-widest opacity-50">{issue.kind.replace(/_/g, ' ')}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-center py-4 text-[11px] font-medium text-muted-foreground/40">No active issues detected</p>
                        )}
                    </div>

                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 px-1">This Recording - Findings</h4>
                        {sessionFindings.length > 0 ? (
                            <div className="space-y-2">
                                {sessionFindings.map((finding, i) => (
                                    <div key={`${finding.kind}-${i}`} className="flex items-center space-x-3 p-4 bg-muted/20 rounded-2xl ring-1 ring-border/20">
                                        <Clock className="h-4 w-4 shrink-0 opacity-50" />
                                        <div className="flex-1 space-y-1">
                                            <div className="text-[11px] font-bold">{finding.kind.replace(/_/g, ' ')}</div>
                                            <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">{formatFindingWindow(finding)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center py-4 text-[11px] font-medium text-muted-foreground/40">No findings recorded yet</p>
                        )}
                    </div>

                </div>

                {/* EXPORT */}
                <div className="pt-8 border-t border-border/10 grid grid-cols-2 gap-4">
                    <Button onClick={() => { navigator.clipboard.writeText(JSON.stringify(generateReport(), null, 2)); toast.success('Copied JSON') }} variant="outline" className="rounded-2xl h-14 font-bold border-2 hover:bg-muted/50">
                        <Copy className="mr-2 h-4 w-4" /> Copy JSON
                    </Button>
                    <Button onClick={exportReport} className="rounded-2xl h-14 font-bold shadow-lg shadow-primary/10">
                        <Download className="mr-2 h-4 w-4" /> Export Report
                    </Button>
                </div>
            </div>
        </Layout>
    );
};

// --- COMPONENTS ---

const StatusBox = ({ label, status }: { label: string, status: any }) => {
    const isGranted = status === 'granted';
    const SafeIcon = ({ icon: Icon, ...props }: any) => {
        if (!Icon) return <div className="h-4 w-4 rounded-full bg-muted/20" />;
        try { return <Icon {...props} />; } catch (e) { return <div className="h-4 w-4 rounded-full bg-muted/20" />; }
    };

    return (
        <div className="p-4 bg-muted/20 rounded-2xl ring-1 ring-border/20 flex flex-col space-y-2">
            <span className="text-[9px] uppercase font-bold text-muted-foreground/50">{label}</span>
            <div className="flex items-center space-x-2">
                {isGranted ? <SafeIcon icon={CheckCircle2} className="h-4 w-4 text-green-500/60" /> : <SafeIcon icon={AlertTriangle} className="h-4 w-4 text-muted-foreground/30" />}
                <span className={`text-xs font-black uppercase tracking-widest ${isGranted ? 'text-green-600' : 'text-muted-foreground/60'}`}>{status}</span>
            </div>
        </div>
    );
};

const CapRow = ({ label, cap }: { label: string, cap?: any }) => (
    <div className="p-3 bg-card/40 border border-border/50 rounded-2xl space-y-2">
        <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/40 block text-center truncate">{label}</span>
        <div className="flex justify-center space-x-1.5">
            <div className={`h-2.5 w-2.5 rounded-full ${cap?.supportedByApi ? 'bg-blue-500/40' : 'bg-muted/30'}`} />
            <div className={`h-2.5 w-2.5 rounded-full ${cap?.supportedInPractice ? 'bg-green-500/60 shadow-[0_0_8px_rgba(34,197,94,0.3)]' : 'bg-muted/30'}`} />
        </div>
    </div>
);

const SummaryMini = ({ label, hz, score, u }: any) => (
    <div className="p-2.5 bg-primary/5 rounded-2xl flex flex-col items-center justify-center space-y-0.5 border border-primary/5">
        <span className="text-[8px] font-black uppercase text-primary/40 tracking-tight">{label}</span>
        <div className="flex items-baseline space-x-0.5">
            <span className="text-sm font-black text-primary/80">{hz || '0'}</span>
            <span className="text-[8px] font-bold text-primary/40">Hz</span>
        </div>
        <div className="text-[8px] font-bold opacity-60">
            {score ? `${score}${u}` : '—'}
        </div>
    </div>
);

const ResultCard = ({ label, health }: { label: string, health?: StreamHealth }) => {
    const hasData = (health?.samplesCount || 0) >= 3;

    return (
        <div className={`p-4 rounded-2xl ring-1 ring-border/10 space-y-3 ${!hasData ? 'bg-muted/5 opacity-80' : 'bg-background/50'}`}>
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{label}</span>
                <Badge variant="outline" className="text-[10px] p-0 font-bold opacity-30 px-1 leading-none">{health?.samplesCount ?? 0} samples</Badge>
            </div>
            <div className="flex items-baseline space-x-1">
                <span className="text-2xl font-black">{health?.observedHz ?? '0'}</span>
                <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">Hz</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold border-t border-muted/20 pt-2">
                <div className="space-y-0.5">
                    <span className="text-muted-foreground/40 uppercase text-[8px]">Median Jitter</span>
                    <div className="font-mono">{hasData ? (health?.dtMsMedian ?? '—') : <span className="text-muted-foreground/30 text-[9px] font-normal italic">Insufficient</span>}{hasData ? 'ms' : ''}</div>
                </div>
                <div className="space-y-0.5">
                    <span className="text-muted-foreground/40 uppercase text-[8px]">P95 Jitter</span>
                    <div className="font-mono">{hasData ? (health?.dtMsP95 ?? '—') : <span className="text-muted-foreground/30 text-[9px] font-normal italic">Insufficient</span>}{hasData ? 'ms' : ''}</div>
                </div>
            </div>

            {health?.accuracyMedianM !== undefined && (
                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold bg-primary/5 p-2 rounded-xl">
                    <div className="space-y-0.5 text-primary/60">
                        <span className="uppercase text-[8px]">Accuracy Med</span>
                        <div className="font-mono">{health.accuracyMedianM ?? '—'}m</div>
                    </div>
                    <div className="space-y-0.5 text-primary/60">
                        <span className="uppercase text-[8px]">Accuracy P95</span>
                        <div className="font-mono">{health.accuracyP95M ?? '—'}m</div>
                    </div>
                    {health.speedMedian !== null && (
                        <div className="col-span-2 pt-1 mt-1 border-t border-primary/10 text-primary/60">
                            <span className="uppercase text-[8px]">Median Speed: {health.speedMedian} m/s</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const LiveMetric = ({ label, val, u }: { label: string, val: any, u: string }) => {
    const formatVal = (v: any) => {
        if (!v) return '—';
        if (typeof v === 'object') {
            const keys = Object.keys(v).filter(k => typeof v[k] === 'number');
            return keys.map(k => `${k}:${v[k].toFixed(1)}`).join(' ');
        }
        return v.toFixed(1);
    };
    return (
        <div className="p-3 bg-muted/20 rounded-2xl space-y-1 overflow-hidden">
            <span className="text-[9px] uppercase font-black text-muted-foreground/40 block">{label}</span>
            <div className="flex flex-wrap items-baseline gap-1">
                <span className="text-[11px] font-mono font-black break-all leading-tight">{formatVal(val)}</span>
                <span className="text-[9px] font-bold text-muted-foreground/40 uppercase">{u}</span>
            </div>
        </div>
    );
};

const MetricLine = ({ label, val, u }: { label: string, val: number, u: string }) => (
    <div className="flex justify-between items-baseline">
        <span className="text-[8px] font-bold text-muted-foreground/50 uppercase">{label}</span>
        <div className="flex items-baseline space-x-0.5">
            <span className="text-xs font-black text-primary/70">{val}</span>
            <span className="text-[8px] font-bold text-muted-foreground/30">{u}</span>
        </div>
    </div>
);

export default Audit;
