
import React, { useState, useEffect, useRef } from 'react';
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
    Info,
    CheckCircle2,
    XCircle,
    Clock
} from 'lucide-react';
import { toast } from 'sonner';
import pkg from '../../package.json';

// --- UTILS ---
const median = (arr: number[]) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const percentile = (arr: number[], p: number) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(s.length * (p / 100));
    return s[Math.min(idx, s.length - 1)];
};

const safeNum = (n: any) => (typeof n === 'number' && !isNaN(n)) ? Number(n.toFixed(2)) : null;

// --- TYPES ---
interface SensorMetrics {
    samplesCount: number;
    observedHz: number | null;
    dtMsMedian: number | null;
    dtMsP95: number | null;
    missingRate: number | null;
}

interface GpsMetrics extends SensorMetrics {
    accuracyMedianM: number | null;
    accuracyP95M: number | null;
    hasSpeed: boolean;
    speedMedian: number | null;
}

interface CapabilityStatus {
    supportedByApi: boolean;
    supportedInPractice: boolean;
}

const Audit = () => {
    const [permissions, setPermissions] = useState({
        motion: 'prompt' as PermissionState | 'unsupported',
        location: 'prompt' as PermissionState | 'unsupported'
    });

    const [capabilities, setCapabilities] = useState({
        deviceMotion: { supportedByApi: false, supportedInPractice: false },
        deviceOrientation: { supportedByApi: false, supportedInPractice: false },
        gyroscopeRate: { supportedByApi: false, supportedInPractice: false },
        linearAcceleration: { supportedByApi: false, supportedInPractice: false },
        accelerometer: { supportedByApi: false, supportedInPractice: false },
        gps: { supportedByApi: false, supportedInPractice: false, hasSpeed: false, hasAccuracy: false }
    });

    const [isTesting, setIsTesting] = useState(false);
    const [testProgress, setTestProgress] = useState(0);
    const [testResults, setTestResults] = useState<{
        deviceMotion: SensorMetrics;
        deviceOrientation: SensorMetrics;
        gps: GpsMetrics;
    } | null>(null);
    const [flags, setFlags] = useState<string[]>([]);

    // Internal test buffers
    const motionBuffer = useRef<{ t: number, acc: any, grav: any, rot: any }[]>([]);
    const orientationBuffer = useRef<{ t: number, alpha: any, beta: any, gamma: any }[]>([]);
    const gpsBuffer = useRef<{ t: number, accuracy: number, speed: number | null }[]>([]);

    // 1. Initial Capability & Permission Check
    useEffect(() => {
        const checkInitial = async () => {
            const caps = { ...capabilities };
            caps.deviceMotion.supportedByApi = "DeviceMotionEvent" in window;
            caps.deviceOrientation.supportedByApi = "DeviceOrientationEvent" in window;
            caps.gps.supportedByApi = "geolocation" in navigator;

            setCapabilities(caps);

            if (navigator.permissions) {
                try {
                    const loc = await navigator.permissions.query({ name: 'geolocation' as any });
                    setPermissions(p => ({ ...p, location: loc.state }));
                    loc.onchange = () => setPermissions(p => ({ ...p, location: loc.state }));
                } catch (e) { }
            }

            if (typeof (DeviceMotionEvent as any).requestPermission !== "function") {
                setPermissions(p => ({ ...p, motion: 'granted' })); // Desktop/Android
            } else {
                setPermissions(p => ({ ...p, motion: 'prompt' })); // iOS
            }
        };

        checkInitial();
    }, []);

    const requestPermissions = async () => {
        // Location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                () => setPermissions(p => ({ ...p, location: 'granted' })),
                () => setPermissions(p => ({ ...p, location: 'denied' }))
            );
        }

        // Motion (iOS Gesture)
        if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
            try {
                const res = await (DeviceMotionEvent as any).requestPermission();
                setPermissions(p => ({ ...p, motion: res }));
            } catch (e) {
                setPermissions(p => ({ ...p, motion: 'denied' }));
            }
        }
    };

    const runTest = () => {
        setIsTesting(true);
        setTestProgress(0);
        setTestResults(null);
        setFlags([]);

        // Reset Practice Flags
        setCapabilities(prev => ({
            ...prev,
            deviceMotion: { ...prev.deviceMotion, supportedInPractice: false },
            deviceOrientation: { ...prev.deviceOrientation, supportedInPractice: false },
            gyroscopeRate: { ...prev.gyroscopeRate, supportedInPractice: false },
            linearAcceleration: { ...prev.linearAcceleration, supportedInPractice: false },
            accelerometer: { ...prev.accelerometer, supportedInPractice: false },
            gps: { ...prev.gps, supportedInPractice: false }
        }));

        motionBuffer.current = [];
        orientationBuffer.current = [];
        gpsBuffer.current = [];

        const duration = 10000;
        const startAt = Date.now();

        const onMotion = (e: DeviceMotionEvent) => {
            const t = Date.now();
            motionBuffer.current.push({
                t,
                acc: e.acceleration,
                grav: e.accelerationIncludingGravity,
                rot: e.rotationRate
            });
        };

        const onOrientation = (e: DeviceOrientationEvent) => {
            orientationBuffer.current.push({
                t: Date.now(),
                alpha: e.alpha,
                beta: e.beta,
                gamma: e.gamma
            });
        };

        window.addEventListener('devicemotion', onMotion);
        window.addEventListener('deviceorientation', onOrientation);

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                gpsBuffer.current.push({
                    t: pos.timestamp,
                    accuracy: pos.coords.accuracy,
                    speed: pos.coords.speed
                });
            },
            null,
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );

        const interval = setInterval(() => {
            const elapsed = Date.now() - startAt;
            setTestProgress(Math.min(100, (elapsed / duration) * 100));

            if (elapsed >= duration) {
                clearInterval(interval);
                window.removeEventListener('devicemotion', onMotion);
                window.removeEventListener('deviceorientation', onOrientation);
                navigator.geolocation.clearWatch(watchId);
                setIsTesting(false);
                computeAdvancedMetrics();
            }
        }, 100);
    };

    const computeAdvancedMetrics = () => {
        const durationSec = 10;

        const process = (buffer: { t: number }[]) => {
            if (buffer.length < 2) return { samplesCount: buffer.length, observedHz: 0, dtMsMedian: null, dtMsP95: null, missingRate: 0 };
            const dts: number[] = [];
            for (let i = 1; i < buffer.length; i++) dts.push(buffer[i].t - buffer[i - 1].t);
            const m = median(dts) || 0;
            const countMissing = dts.filter(d => d > 2 * m).length;
            return {
                samplesCount: buffer.length,
                observedHz: safeNum(buffer.length / durationSec),
                dtMsMedian: safeNum(m),
                dtMsP95: safeNum(percentile(dts, 95)),
                missingRate: safeNum((countMissing / dts.length) * 100)
            };
        };

        const motion = process(motionBuffer.current);
        const orientation = process(orientationBuffer.current);
        const gpsBase = process(gpsBuffer.current);

        // Deep checks for practice support
        const hasLinear = motionBuffer.current.some(b => b.acc?.x !== null || b.acc?.y !== null || b.acc?.z !== null);
        const hasGrav = motionBuffer.current.some(b => b.grav?.x !== null || b.grav?.y !== null || b.grav?.z !== null);
        const hasRot = motionBuffer.current.some(b => b.rot?.alpha !== null || b.rot?.beta !== null || b.rot?.gamma !== null);
        const hasOrient = orientationBuffer.current.some(b => b.alpha !== null || b.beta !== null || b.gamma !== null);
        const gpsUpdates = gpsBuffer.current;
        const hasSpeed = gpsUpdates.some(g => typeof g.speed === "number" && g.speed !== null);

        setCapabilities(prev => ({
            ...prev,
            deviceMotion: { ...prev.deviceMotion, supportedInPractice: motion.samplesCount > 5 },
            deviceOrientation: { ...prev.deviceOrientation, supportedInPractice: hasOrient },
            gyroscopeRate: { ...prev.gyroscopeRate, supportedByApi: !!motionBuffer.current[0]?.rot, supportedInPractice: hasRot },
            linearAcceleration: { ...prev.linearAcceleration, supportedByApi: !!motionBuffer.current[0]?.acc, supportedInPractice: hasLinear },
            accelerometer: { ...prev.accelerometer, supportedByApi: !!motionBuffer.current[0]?.grav, supportedInPractice: hasGrav },
            gps: { ...prev.gps, supportedInPractice: gpsBase.samplesCount > 0, hasSpeed, hasAccuracy: gpsUpdates.length > 0 }
        }));

        const gpsExtra: GpsMetrics = {
            ...gpsBase,
            accuracyMedianM: safeNum(median(gpsUpdates.map(g => g.accuracy))),
            accuracyP95M: safeNum(percentile(gpsUpdates.map(g => g.accuracy), 95)),
            hasSpeed,
            speedMedian: hasSpeed ? safeNum(median(gpsUpdates.map(g => g.speed).filter(s => s !== null) as number[])) : null
        };

        setTestResults({
            deviceMotion: motion,
            deviceOrientation: orientation,
            gps: gpsExtra
        });

        // Flags
        const newFlags: string[] = [];
        if (gpsBase.observedHz && gpsBase.observedHz < 0.8) newFlags.push("Low GPS update rate");
        if (gpsExtra.accuracyMedianM && gpsExtra.accuracyMedianM > 50) newFlags.push("High GPS accuracy values (noisy GPS)");
        if (permissions.motion !== "granted" && "DeviceMotionEvent" in window) newFlags.push("Motion permission missing");
        if (hasOrient && motion.samplesCount === 0) newFlags.push("Orientation available but motion missing");
        if (motion.dtMsP95 && motion.dtMsMedian && motion.dtMsP95 > motion.dtMsMedian * 3) newFlags.push("Unstable sensor jitter detected");

        setFlags(newFlags);
    };

    const generateReport = () => {
        return {
            generatedAt: new Date().toISOString(),
            app: { name: "SmartRide", version: pkg.version },
            device: {
                userAgent: navigator.userAgent,
                platform: (navigator as any).platform || 'unknown',
                language: navigator.language
            },
            permissions,
            capabilities,
            observed: testResults,
            flags
        };
    };

    const exportReport = () => {
        const report = generateReport();
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartride_audit_v${pkg.version}_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Report exported');
    };

    const copyReport = () => {
        const report = generateReport();
        navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        toast.success('Report copied to clipboard');
    };

    return (
        <Layout>
            <div className="w-full max-w-2xl mx-auto pb-20 px-6 pt-4 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">

                {/* HEADER */}
                <div className="space-y-1">
                    <Badge variant="outline" className="text-[9px] uppercase tracking-widest font-black px-2 py-0.5 bg-primary/5 text-primary/60 border-primary/20">
                        Advanced Sensor Profiler
                    </Badge>
                    <h1 className="text-3xl font-bold tracking-tight">Audit</h1>
                    <p className="text-sm text-muted-foreground/60 font-medium leading-relaxed">
                        Truth-testing browser sensor streams & latency jitter
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
                        {(permissions.motion === 'prompt' || permissions.location === 'prompt') && (
                            <Button onClick={requestPermissions} className="w-full rounded-2xl h-12 font-bold shadow-lg shadow-primary/10">
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Request Remaining Permissions
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {/* CAPABILITIES MATRIX */}
                <div className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 px-1">Capability Matrix (API vs Practice)</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <CapRow label="Motion" cap={capabilities.deviceMotion} />
                        <CapRow label="Orientation" cap={capabilities.deviceOrientation} />
                        <CapRow label="Gyro Rate" cap={capabilities.gyroscopeRate} />
                        <CapRow label="Linear Accel" cap={capabilities.linearAcceleration} />
                        <CapRow label="Accel (with G)" cap={capabilities.accelerometer} />
                        <CapRow label="GPS Fix" cap={capabilities.gps} />
                    </div>
                </div>

                {/* LIVE TEST */}
                <Card className="border-none bg-primary/[0.03] shadow-none ring-1 ring-primary/10 rounded-3xl">
                    <CardHeader>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40">10s Audit Test</h3>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {!testResults && !isTesting ? (
                            <div className="py-8 text-center space-y-4">
                                <p className="text-xs text-muted-foreground/60 max-w-xs mx-auto font-medium">
                                    Measures truthful sampling rates and timing distribution in memory.
                                </p>
                                <Button onClick={runTest} className="rounded-full px-10 h-14 font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform">
                                    <Play className="mr-2 h-4 w-4 fill-current" />
                                    Run Audit
                                </Button>
                            </div>
                        ) : isTesting ? (
                            <div className="space-y-4 py-4">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-primary/60 px-1">
                                    <span className="flex items-center">
                                        <Activity className="mr-2 h-3 w-3 animate-pulse" />
                                        Profiling Sensors...
                                    </span>
                                    <span>{Math.round(testProgress)}%</span>
                                </div>
                                <Progress value={testProgress} className="h-1.5 bg-primary/10" />
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <ResultCard label="Motion" metrics={testResults?.deviceMotion} />
                                    <ResultCard label="Orientation" metrics={testResults?.deviceOrientation} />
                                    <GpsResultCard label="GPS (Geolocation)" metrics={testResults?.gps} />
                                </div>
                                <div className="flex justify-center">
                                    <Button variant="ghost" onClick={runTest} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary">
                                        Restart Profiler
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* FLAGS */}
                {flags.length > 0 && (
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 px-1">Findings</h4>
                        <div className="space-y-2">
                            {flags.map((f, i) => (
                                <div key={i} className="flex items-center space-x-3 p-4 bg-amber-500/5 text-amber-700 rounded-2xl ring-1 ring-amber-500/10">
                                    <AlertCircle className="h-4 w-4 shrink-0 opacity-50" />
                                    <span className="text-[11px] font-bold">{f}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* EXPORT */}
                <div className="pt-8 border-t border-border/10 grid grid-cols-2 gap-4">
                    <Button onClick={copyReport} variant="outline" className="rounded-2xl h-14 font-bold border-2 hover:bg-muted/50">
                        <Copy className="mr-2 h-4 w-4" />
                        Copy JSON
                    </Button>
                    <Button onClick={exportReport} className="rounded-2xl h-14 font-bold shadow-lg shadow-primary/10">
                        <Download className="mr-2 h-4 w-4" />
                        Export Report
                    </Button>
                </div>

                <div className="text-center opacity-20">
                    <p className="text-[9px] uppercase font-black tracking-[0.4em]">Privacy First Diagnostic</p>
                </div>
            </div>
        </Layout>
    );
};

// --- COMPONENTS ---

const StatusBox = ({ label, status }: { label: string, status: string }) => {
    const isGranted = status === 'granted';
    return (
        <div className="p-4 bg-muted/20 rounded-2xl ring-1 ring-border/20 flex flex-col space-y-2">
            <span className="text-[9px] uppercase font-bold text-muted-foreground/50">{label}</span>
            <div className="flex items-center space-x-2">
                {isGranted ? <CheckCircle2 className="h-4 w-4 text-green-500/60" /> : <ShieldAlert className="h-4 w-4 text-muted-foreground/30" />}
                <span className={`text-xs font-black uppercase tracking-widest ${isGranted ? 'text-green-600' : 'text-muted-foreground/60'}`}>{status}</span>
            </div>
        </div>
    );
};

const CapRow = ({ label, cap }: { label: string, cap: CapabilityStatus }) => (
    <div className="p-3 bg-card/40 border border-border/50 rounded-2xl space-y-2">
        <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/40 block text-center truncate">{label}</span>
        <div className="flex justify-center space-x-1.5">
            <div className={`h-2.5 w-2.5 rounded-full ${cap.supportedByApi ? 'bg-blue-500/40' : 'bg-muted/30'}`} title="Supported by API" />
            <div className={`h-2.5 w-2.5 rounded-full ${cap.supportedInPractice ? 'bg-green-500/60 shadow-[0_0_8px_rgba(34,197,94,0.3)]' : 'bg-muted/30'}`} title="Verified in Practice" />
        </div>
    </div>
);

const ResultCard = ({ label, metrics }: { label: string, metrics?: SensorMetrics | null }) => (
    <div className="p-4 bg-background/50 rounded-2xl ring-1 ring-border/10 space-y-4">
        <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{label}</span>
            <Badge variant="ghost" className="text-[10px] p-0 font-bold opacity-30">{metrics?.samplesCount ?? 0} samples</Badge>
        </div>
        <div className="flex items-baseline space-x-1">
            <span className="text-2xl font-black">{metrics?.observedHz ?? '—'}</span>
            <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">Hz</span>
        </div>
        <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-[10px] font-bold">
                <span className="text-muted-foreground/40 uppercase tracking-widest">Median Δ</span>
                <span className="font-mono">{metrics?.dtMsMedian ? `${metrics.dtMsMedian}ms` : '—'}</span>
            </div>
            <div className="flex justify-between text-[10px] font-bold">
                <span className="text-muted-foreground/40 uppercase tracking-widest">P95 Δ</span>
                <span className="font-mono">{metrics?.dtMsP95 ? `${metrics.dtMsP95}ms` : '—'}</span>
            </div>
            <div className="flex justify-between text-[10px] font-bold">
                <span className="text-muted-foreground/40 uppercase tracking-widest">Loss Est.</span>
                <span className={`font-mono ${(metrics?.missingRate || 0) > 5 ? 'text-rose-500' : 'text-green-500/60'}`}>{metrics?.missingRate ? `${metrics.missingRate}%` : '0%'}</span>
            </div>
        </div>
    </div>
);

const GpsResultCard = ({ label, metrics }: { label: string, metrics?: GpsMetrics | null }) => (
    <div className="col-span-2 p-4 bg-background/50 rounded-2xl ring-1 ring-border/10 space-y-4">
        <div className="flex items-center justify-between border-b border-border/5 pb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{label}</span>
            <div className="flex space-x-2">
                <Badge className={`${metrics?.hasSpeed ? 'bg-green-500/10 text-green-600' : 'bg-muted/30 text-muted-foreground/40'} border-none text-[8px] uppercase font-black`}>Speed-API</Badge>
                <Badge variant="ghost" className="text-[10px] p-0 font-bold opacity-30">{metrics?.samplesCount ?? 0} locks</Badge>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
                <div className="flex items-baseline space-x-1">
                    <span className="text-2xl font-black">{metrics?.observedHz ?? '—'}</span>
                    <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">Hz</span>
                </div>
                <div className="space-y-1">
                    <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">Update Rate</span>
                    <Progress value={(metrics?.observedHz || 0) * 100} className="h-1 bg-muted/30" />
                </div>
            </div>

            <div className="space-y-2 text-right">
                <div className="space-y-0.5">
                    <span className="text-[9px] font-black uppercase text-muted-foreground/40 block">Median Accuracy</span>
                    <span className="text-lg font-black">{metrics?.accuracyMedianM ? `${metrics.accuracyMedianM}m` : '—'}</span>
                </div>
                <div className="space-y-0.5">
                    <span className="text-[9px] font-black uppercase text-muted-foreground/40 block">P95 Accuracy</span>
                    <span className="text-xs font-bold text-foreground/60">{metrics?.accuracyP95M ? `${metrics.accuracyP95M}m` : '—'}</span>
                </div>
            </div>
        </div>
    </div>
);

export default Audit;
