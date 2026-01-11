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
    const [selectedDuration, setSelectedDuration] = useState(30000); // Default 30s
    const [testProgress, setTestProgress] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);
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
        if (isLive) return; // Prevent concurrent collectors
        setIsTesting(true);
        setTestProgress(0);
        setElapsedTime(0);
        setTestResults(null);

        const duration = selectedDuration;
        const startAt = Date.now();

        const collector = startCollectors({
            onSample: () => { },
            onHealthUpdate: (health) => {
                const now = Date.now();
                const elapsed = now - startAt;
                setElapsedTime(Math.floor(elapsed / 1000));
                setTestProgress(Math.min(100, (elapsed / duration) * 100));

                if (elapsed >= duration) {
                    collector.stop();
                    setIsTesting(false);
                    setTestResults(health);

                    // Extract flags from final health
                    const newFlags = [...(capabilities?.flags || [])];
                    if ((health.gps?.observedHz || 0) < 0.5) newFlags.push("Extremely low GPS update rate");
                    if (health.gps && health.gps.samplesCount < 3) newFlags.push("Insufficient GPS samples for reliable stats");
                    if ((health.motion?.dtMsP95 || 0) > (health.motion?.dtMsMedian || 1) * 4) newFlags.push("Severe sensor jitter profile");

                    setFlags([...new Set(newFlags)]);
                }
            }
        });
        collectorRef.current = collector;
    };

    const toggleLiveSampling = () => {
        if (isTesting) return; // Prevent conflict
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
            testDurationSec: selectedDuration / 1000,
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
                                {[10000, 30000, 60000].map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => setSelectedDuration(d)}
                                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter transition-all ${selectedDuration === d ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
                                    >
                                        {d / 1000}s
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
                                    disabled={isLive}
                                    className="rounded-full px-10 h-14 font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                                >
                                    Run Audit ({selectedDuration / 1000}s)
                                </Button>
                            </div>
                        ) : isTesting ? (
                            <div className="space-y-4 py-4">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-primary/60 px-1">
                                    <span className="flex items-center"><Activity className="mr-2 h-3 w-3 animate-pulse" /> Profiling...</span>
                                    <span>{elapsedTime}s / {selectedDuration / 1000}s</span>
                                </div>
                                <Progress value={testProgress} className="h-1.5 bg-primary/10" />
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

                                    <div className="col-span-2 space-y-2 pt-2">
                                        <Button variant="ghost" onClick={runAuditTest} className="w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/30 h-12 rounded-2xl">
                                            Restart Profile
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* FLAGS */}
                {flags.length > 0 && (
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 px-1">Diagnostic Findings</h4>
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

export default Audit;
