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
    XCircle,
    Clock,
    Square
} from 'lucide-react';
import { toast } from 'sonner';
import pkg from '../../package.json';
import { detectCapabilities, requestSensorPermissions } from '@/sensors/sensorRegistry';
import { startCollectors } from '@/sensors/sensorCollector';
import { CapabilitiesReport, CollectionHealth, StreamHealth, UnifiedSampleV2 } from '@/sensors/sensorTypes';

const Audit = () => {
    const [permissions, setPermissions] = useState<{ motion: string, location: string }>({
        motion: 'prompt',
        location: 'prompt'
    });

    const [capabilities, setCapabilities] = useState<CapabilitiesReport | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [isLive, setIsLive] = useState(false);
    const [testProgress, setTestProgress] = useState(0);
    const [liveHealth, setLiveHealth] = useState<CollectionHealth | null>(null);
    const [liveData, setLiveData] = useState<UnifiedSampleV2 | null>(null);
    const [testResults, setTestResults] = useState<CollectionHealth | null>(null);
    const [flags, setFlags] = useState<string[]>([]);

    const collectorRef = useRef<{ stop: () => void } | null>(null);

    useEffect(() => {
        const checkInitial = async () => {
            const caps = await detectCapabilities();
            setCapabilities(caps);
            setFlags(caps.flags);
        };
        checkInitial();
        return () => collectorRef.current?.stop();
    }, []);

    const handleRequestPermissions = async () => {
        const perms = await requestSensorPermissions();
        setPermissions({ motion: perms.motion, location: perms.location });
        const caps = await detectCapabilities(); // Refresh
        setCapabilities(caps);
    };

    const runAuditTest = () => {
        setIsTesting(true);
        setTestProgress(0);
        setTestResults(null);

        const duration = 10000;
        const startAt = Date.now();

        const collector = startCollectors({
            onSample: () => { }, // In-memory profiling handled by monitors inside collector
            onHealthUpdate: (health) => {
                const elapsed = Date.now() - startAt;
                setTestProgress(Math.min(100, (elapsed / duration) * 100));
                if (elapsed >= duration) {
                    collector.stop();
                    setIsTesting(false);
                    setTestResults(health);
                    // Extract flags from final health
                    const newFlags = [...(capabilities?.flags || [])];
                    if ((health.gps?.observedHz || 0) < 0.8) newFlags.push("Low GPS update rate");
                    if ((health.motion?.dtMsP95 || 0) > (health.motion?.dtMsMedian || 1) * 3) newFlags.push("Unstable sensor jitter detected");
                    setFlags([...new Set(newFlags)]);
                }
            }
        });
        collectorRef.current = collector;
    };

    const toggleLiveSampling = () => {
        if (isLive) {
            collectorRef.current?.stop();
            setIsLive(false);
        } else {
            setIsLive(true);
            const collector = startCollectors({
                onSample: (s) => setLiveData(s),
                onHealthUpdate: (h) => setLiveHealth(h)
            });
            collectorRef.current = collector;
        }
    };

    const generateReport = () => {
        return {
            generatedAt: new Date().toISOString(),
            app: { name: "SmartRide", version: pkg.version, schema: 2 },
            device: {
                userAgent: navigator.userAgent,
                platform: (navigator as any).platform || 'unknown',
            },
            permissions,
            capabilities,
            observed: testResults || liveHealth,
            flags
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
                        Unified Sensor Engine v0.5.0
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

                {/* LIVE SNAPSHOT */}
                <Card className="border-none bg-card/40 shadow-none ring-1 ring-border/50 rounded-3xl overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Live Snapshot</h3>
                        <Button
                            variant={isLive ? "destructive" : "secondary"}
                            size="sm"
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
                                        <span className="text-[10px] font-bold text-muted-foreground/40">{liveHealth?.gps?.observedHz || 0} Hz</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-center py-4 text-[11px] font-medium text-muted-foreground/40">Start sampling to see real-time data</p>
                        )}
                    </CardContent>
                </Card>

                {/* 10S TEST */}
                <Card className="border-none bg-primary/[0.03] shadow-none ring-1 ring-primary/10 rounded-3xl">
                    <CardHeader>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40">10s Audit Test</h3>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {!testResults && !isTesting ? (
                            <div className="py-8 text-center space-y-4">
                                <p className="text-xs text-muted-foreground/60 max-w-xs mx-auto font-medium">
                                    Measures truthful sampling rates and timing distribution.
                                </p>
                                <Button onClick={runAuditTest} className="rounded-full px-10 h-14 font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                                    Run 10s Test
                                </Button>
                            </div>
                        ) : isTesting ? (
                            <div className="space-y-4 py-4">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-primary/60 px-1">
                                    <span className="flex items-center"><Activity className="mr-2 h-3 w-3 animate-pulse" /> Testing...</span>
                                    <span>{Math.round(testProgress)}%</span>
                                </div>
                                <Progress value={testProgress} className="h-1.5 bg-primary/10" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <ResultCard label="Motion" health={testResults?.motion} />
                                <ResultCard label="Orientation" health={testResults?.orientation} />
                                <div className="col-span-2 space-y-2">
                                    <Button variant="ghost" onClick={runAuditTest} className="w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                        Restart Test
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

const ResultCard = ({ label, health }: { label: string, health?: StreamHealth }) => (
    <div className="p-4 bg-background/50 rounded-2xl ring-1 ring-border/10 space-y-3">
        <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{label}</span>
            <Badge variant="outline" className="text-[10px] p-0 font-bold opacity-30">{health?.samplesCount ?? 0} samples</Badge>
        </div>
        <div className="flex items-baseline space-x-1">
            <span className="text-2xl font-black">{health?.observedHz ?? '—'}</span>
            <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">Hz</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
            <div className="space-y-0.5"><span className="text-muted-foreground/40 uppercase">Median</span><div className="font-mono">{health?.dtMsMedian ?? '—'}ms</div></div>
            <div className="space-y-0.5"><span className="text-muted-foreground/40 uppercase">P95</span><div className="font-mono">{health?.dtMsP95 ?? '—'}ms</div></div>
        </div>
    </div>
);

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

export default Audit;
