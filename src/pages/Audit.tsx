
import React, { useState, useEffect, useRef } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
    ShieldAlert,
    ShieldCheck,
    Activity,
    Settings,
    Download,
    Copy,
    Play,
    AlertCircle,
    Info
} from 'lucide-react';
import { toast } from 'sonner';
import pkg from '../../package.json';

interface AuditMetrics {
    observedHz: number | null;
    dtMsP95: number | null;
}

interface GpsAuditMetrics extends AuditMetrics {
    accuracyMedianM: number | null;
    accuracyP95M: number | null;
    speedMedian: number | null;
    hasSpeed: boolean;
}

interface AuditResult {
    accelerometer: AuditMetrics;
    deviceOrientation: AuditMetrics;
    gps: GpsAuditMetrics;
}

const Audit = () => {
    const [permissions, setPermissions] = useState({
        motion: 'prompt' as PermissionState | 'unavailable',
        location: 'prompt' as PermissionState | 'unavailable'
    });

    const [capabilities, setCapabilities] = useState({
        accelerometer: false,
        deviceOrientation: false,
        gyroscopeRate: false,
        linearAcceleration: false,
        gps: false,
        hasSpeed: false,
        hasAccuracy: false
    });

    const [isTesting, setIsTesting] = useState(false);
    const [testProgress, setTestProgress] = useState(0);
    const [testResults, setTestResults] = useState<AuditResult | null>(null);
    const [flags, setFlags] = useState<string[]>([]);

    // Internal test buffers
    const accelBuffer = useRef<{ t: number }[]>([]);
    const orientationBuffer = useRef<{ t: number }[]>([]);
    const gpsBuffer = useRef<{ t: number, accuracy: number, speed: number | null }[]>([]);

    // 1. Initial Capability & Permission Check
    useEffect(() => {
        const checkCapabilities = async () => {
            const caps = { ...capabilities };
            caps.accelerometer = 'Accelerometer' in window;
            caps.deviceOrientation = 'DeviceOrientationEvent' in window;
            caps.linearAcceleration = 'ondevicemotion' in window;
            caps.gps = 'geolocation' in navigator;

            setCapabilities(prev => ({ ...prev, ...caps }));

            // Check permissions if API exists
            if (navigator.permissions) {
                try {
                    const locStatus = await navigator.permissions.query({ name: 'geolocation' as any });
                    setPermissions(p => ({ ...p, location: locStatus.state }));
                    locStatus.onchange = () => setPermissions(p => ({ ...p, location: locStatus.state }));
                } catch (e) {
                    console.warn('Permission query failed', e);
                }
            }

            // Motion permission (iOS specific or general)
            if (typeof (DeviceMotionEvent as any).requestPermission !== 'function') {
                setPermissions(p => ({ ...p, motion: 'granted' })); // Assume desktop/android auto-grant
            }
        };

        checkCapabilities();
    }, []);

    const requestPermissions = async () => {
        // Location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                () => {
                    setPermissions(p => ({ ...p, location: 'granted' }));
                    toast.success('Location permission granted');
                },
                (err) => {
                    setPermissions(p => ({ ...p, location: 'denied' }));
                    toast.error(`Location denied: ${err.message}`);
                }
            );
        }

        // Motion
        if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
            try {
                const state = await (DeviceMotionEvent as any).requestPermission();
                setPermissions(p => ({ ...p, motion: state }));
                if (state === 'granted') toast.success('Motion permission granted');
            } catch (e) {
                setPermissions(p => ({ ...p, motion: 'denied' }));
                toast.error('Motion permission failed');
            }
        }
    };

    const runTest = () => {
        setIsTesting(true);
        setTestProgress(0);
        setTestResults(null);
        accelBuffer.current = [];
        orientationBuffer.current = [];
        gpsBuffer.current = [];

        const duration = 10000; // 10s
        const start = Date.now();

        // Listeners
        const onMotion = (e: DeviceMotionEvent) => {
            accelBuffer.current.push({ t: Date.now() });
        };
        const onOrientation = (e: DeviceOrientationEvent) => {
            orientationBuffer.current.push({ t: Date.now() });
        };

        window.addEventListener('devicemotion', onMotion);
        window.addEventListener('deviceorientation', onOrientation);

        const gpsWatch = navigator.geolocation.watchPosition(
            (pos) => {
                gpsBuffer.current.push({
                    t: pos.timestamp,
                    accuracy: pos.coords.accuracy,
                    speed: pos.coords.speed
                });
                if (pos.coords.speed !== null) setCapabilities(c => ({ ...c, hasSpeed: true }));
                if (pos.coords.accuracy !== null) setCapabilities(c => ({ ...c, hasAccuracy: true }));
            },
            null,
            { enableHighAccuracy: true }
        );

        const interval = setInterval(() => {
            const elapsed = Date.now() - start;
            setTestProgress(Math.min(100, (elapsed / duration) * 100));

            if (elapsed >= duration) {
                clearInterval(interval);
                window.removeEventListener('devicemotion', onMotion);
                window.removeEventListener('deviceorientation', onOrientation);
                navigator.geolocation.clearWatch(gpsWatch);
                setIsTesting(false);
                computeMetrics();
            }
        }, 100);
    };

    const computeMetrics = () => {
        const calc = (buffer: { t: number }[]) => {
            if (buffer.length < 2) return { observedHz: 0, dtMsP95: null };
            const dts = [];
            for (let i = 1; i < buffer.length; i++) dts.push(buffer[i].t - buffer[i - 1].t);
            dts.sort((a, b) => a - b);
            return {
                observedHz: Number((buffer.length / 10).toFixed(1)),
                dtMsP95: dts[Math.floor(dts.length * 0.95)]
            };
        };

        const accel = calc(accelBuffer.current);
        const orientation = calc(orientationBuffer.current);

        // GPS
        let gpsMetrics: GpsAuditMetrics = { observedHz: 0, dtMsP95: null, accuracyMedianM: null, accuracyP95M: null, hasSpeed: false, speedMedian: null };
        if (gpsBuffer.current.length > 0) {
            const base = calc(gpsBuffer.current);
            const accs = gpsBuffer.current.map(p => p.accuracy).sort((a, b) => a - b);
            const speeds = gpsBuffer.current.map(p => p.speed).filter(s => s !== null) as number[];
            gpsMetrics = {
                ...base,
                accuracyMedianM: accs[Math.floor(accs.length * 0.5)],
                accuracyP95M: accs[Math.floor(accs.length * 0.95)],
                hasSpeed: speeds.length > 0,
                speedMedian: speeds.length > 0 ? speeds.sort((a, b) => a - b)[Math.floor(speeds.length * 0.5)] : null
            };
        }

        setTestResults({ accelerometer: accel, deviceOrientation: orientation, gps: gpsMetrics });

        // Generate Flags
        const newFlags: string[] = [];
        if (permissions.motion === 'denied') newFlags.push("Motion permission denied");
        if (permissions.location === 'denied') newFlags.push("Location permission denied");
        if (accel.observedHz > 0 && accel.observedHz < 20) newFlags.push("Low accelerometer sampling rate");
        if (gpsMetrics.observedHz > 0 && gpsMetrics.observedHz < 0.5) newFlags.push("Low GPS update rate");
        if (gpsMetrics.accuracyP95M && gpsMetrics.accuracyP95M > 25) newFlags.push("High GPS accuracy values (noisy GPS)");
        if (accel.dtMsP95 && accel.dtMsP95 > (1000 / accel.observedHz) * 1.5) newFlags.push("Unstable sensor sampling rate");

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
            capabilities: {
                accelerometer: { supported: capabilities.accelerometer },
                deviceOrientation: { supported: capabilities.deviceOrientation },
                gyroscopeRate: { supported: capabilities.linearAcceleration }, // Simplified proxy
                linearAcceleration: { supported: capabilities.linearAcceleration },
                gps: {
                    supported: capabilities.gps,
                    hasSpeed: capabilities.hasSpeed,
                    hasAccuracy: capabilities.hasAccuracy
                }
            },
            observed: testResults ? {
                accelerometer: testResults.accelerometer,
                deviceOrientation: testResults.deviceOrientation,
                gps: testResults.gps
            } : null,
            flags
        };
    };

    const exportReport = () => {
        const report = generateReport();
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartride_audit_${new Date().toISOString().split('T')[0]}.json`;
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
                        Pilot Diagnostics
                    </Badge>
                    <h1 className="text-3xl font-bold tracking-tight">Audit</h1>
                    <p className="text-sm text-muted-foreground/60 font-medium leading-relaxed">
                        Internal field test for device & sensor capability reporting
                    </p>
                </div>

                {/* PERMISSIONS */}
                <Card className="border-none bg-card/40 shadow-none ring-1 ring-border/50 rounded-3xl overflow-hidden">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground/40">Permissions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl ring-1 ring-border/20">
                                <span className="text-sm font-semibold">Motion</span>
                                <Badge className={permissions.motion === 'granted' ? 'bg-green-500/10 text-green-600 border-none' : 'bg-rose-500/10 text-rose-600 border-none'}>
                                    {permissions.motion}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl ring-1 ring-border/20">
                                <span className="text-sm font-semibold">Location</span>
                                <Badge className={permissions.location === 'granted' ? 'bg-green-500/10 text-green-600 border-none' : 'bg-rose-500/10 text-rose-600 border-none'}>
                                    {permissions.location}
                                </Badge>
                            </div>
                        </div>
                        <Button onClick={requestPermissions} className="w-full rounded-2xl h-12 font-bold shadow-lg shadow-primary/10">
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Request Missing Permissions
                        </Button>
                    </CardContent>
                </Card>

                {/* CAPABILITIES */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <CapCard label="Accel" supported={capabilities.accelerometer} />
                    <CapCard label="Orientation" supported={capabilities.deviceOrientation} />
                    <CapCard label="Gyro Rate" supported={capabilities.linearAcceleration} />
                    <CapCard label="Linear Accel" supported={capabilities.linearAcceleration} />
                    <CapCard label="GPS Fix" supported={capabilities.gps} />
                    <CapCard label="GPS Speed" supported={capabilities.hasSpeed} />
                </div>

                {/* LIVE TEST */}
                <Card className="border-none bg-primary/5 shadow-none ring-1 ring-primary/10 rounded-3xl">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary/40">Live Audit Test (10s)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {!testResults && !isTesting ? (
                            <div className="py-8 text-center space-y-4">
                                <p className="text-sm text-muted-foreground/60 max-w-xs mx-auto">
                                    Run a short test to measure observed high-frequency sampling rates on this browser.
                                </p>
                                <Button onClick={runTest} className="rounded-full px-10 h-14 font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                                    <Play className="mr-2 h-4 w-4 fill-current" />
                                    Start Test
                                </Button>
                            </div>
                        ) : isTesting ? (
                            <div className="space-y-4 py-4">
                                <div className="flex justify-between text-xs font-black uppercase tracking-widest text-primary/60 px-1">
                                    <span>Sampling Sensors...</span>
                                    <span>{Math.round(testProgress)}%</span>
                                </div>
                                <Progress value={testProgress} className="h-2 bg-primary/10" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <MetricBlock label="Accel" hz={testResults?.accelerometer.observedHz} p95={testResults?.accelerometer.dtMsP95} />
                                <MetricBlock label="GPS" hz={testResults?.gps.observedHz} p95={testResults?.gps.accuracyMedianM} p95Label="Acc (m)" />
                                <div className="col-span-2 pt-4 flex justify-center">
                                    <Button variant="ghost" onClick={runTest} className="text-[10px] font-black uppercase tracking-widest">
                                        Run Again
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* FLAGS */}
                {flags.length > 0 && (
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-1">Detected Bottlenecks</h4>
                        <div className="space-y-2">
                            {flags.map((f, i) => (
                                <div key={i} className="flex items-center space-x-3 p-3 bg-rose-500/5 text-rose-600/80 rounded-2xl ring-1 ring-rose-500/10">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span className="text-xs font-semibold">{f}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* EXPORT */}
                <div className="pt-8 border-t border-border/50 grid grid-cols-2 gap-4">
                    <Button onClick={copyReport} variant="outline" className="rounded-2xl h-14 font-bold border-2">
                        <Copy className="mr-2 h-4 w-4" />
                        Copy JSON
                    </Button>
                    <Button onClick={exportReport} className="rounded-2xl h-14 font-bold shadow-lg shadow-primary/10">
                        <Download className="mr-2 h-4 w-4" />
                        Download
                    </Button>
                </div>

                <div className="flex items-center justify-center space-x-2 text-muted-foreground/30 py-4">
                    <Info className="h-3 w-3" />
                    <span className="text-[10px] font-medium uppercase tracking-widest">Data is not saved to cloud</span>
                </div>
            </div>
        </Layout>
    );
};

const CapCard = ({ label, supported }: { label: string, supported: boolean }) => (
    <div className="p-4 bg-card/40 border border-border/50 rounded-2xl flex flex-col items-center justify-center space-y-2 transition-all hover:bg-card/60">
        <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/40 text-center leading-tight">{label}</span>
        {supported ? (
            <Badge className="bg-green-500/10 text-green-600 border-none text-[10px] h-5">YES</Badge>
        ) : (
            <Badge className="bg-muted/30 text-muted-foreground/40 border-none text-[10px] h-5">NO</Badge>
        )}
    </div>
);

const MetricBlock = ({ label, hz, p95, p95Label = "P95 Δ" }: { label: string, hz: number | null | undefined, p95: number | null | undefined, p95Label?: string }) => (
    <div className="p-4 bg-background/50 rounded-2xl ring-1 ring-border/20 space-y-3">
        <div className="flex items-center space-x-2">
            <Activity className="h-3 w-3 text-primary/40" />
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/60">{label}</span>
        </div>
        <div className="flex items-baseline space-x-1">
            <span className="text-2xl font-bold">{hz ?? '—'}</span>
            <span className="text-[10px] font-bold text-muted-foreground/40">Hz</span>
        </div>
        <div className="flex justify-between items-center bg-muted/30 rounded-lg px-2 py-1">
            <span className="text-[9px] font-black text-muted-foreground/40 uppercase">{p95Label}</span>
            <span className="text-[10px] font-bold">{p95 ? `${p95}${p95Label.includes('Acc') ? 'm' : 'ms'}` : '—'}</span>
        </div>
    </div>
);

export default Audit;
