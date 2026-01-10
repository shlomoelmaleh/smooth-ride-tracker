
import React, { useMemo, useState, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ChevronLeft,
    Download,
    FileJson,
    Trash2,
    Info,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Clock,
    MapPin,
    Gauge,
    BarChart2,
    Loader2
} from 'lucide-react';
import Layout from '@/components/Layout';
import { useRideData } from '@/hooks/useRideData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// Lazy load graphs to keep initial bundle/execution lightweight
const SensorGraphs = React.lazy(() => import('@/components/SensorGraphs'));

/**
 * RideDetails: Metadata-only by design to prevent crashes (React error #310).
 * This component NEVER accesses ride.dataPoints directly.
 */
const RideDetails = () => {
    const { rideId } = useParams<{ rideId: string }>();
    const navigate = useNavigate();
    const { rides, deleteRide, exportRideData } = useRideData();
    const [showGraphs, setShowGraphs] = useState(false);

    // Find ride by ID - LIGHTWEIGHT LOOKUP (Header + Metadata only)
    const ride = useMemo(() => rides.find(r => r.id === rideId), [rides, rideId]);

    if (!ride) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
                    <h2 className="text-xl font-semibold text-muted-foreground">Ride not found</h2>
                    <Button onClick={() => navigate('/history')}>Back to History</Button>
                </div>
            </Layout>
        );
    }

    const { metadata } = ride;

    // Defensive rendering for missing metadata
    if (!metadata) {
        return (
            <Layout>
                <div className="w-full max-w-2xl mx-auto space-y-6 pt-4 px-4">
                    <Button variant="ghost" className="mb-2" onClick={() => navigate('/history')}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                    <Card className="border-dashed">
                        <CardHeader>
                            <CardTitle>Summary not available</CardTitle>
                            <CardDescription>This recording does not have associated metadata.</CardDescription>
                        </CardHeader>
                        <CardFooter>
                            <Button variant="destructive" size="sm" onClick={() => deleteRide(ride.id).then(() => navigate('/history'))}>
                                Delete Record
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </Layout>
        );
    }

    // Derive Quality Grade from Metadata
    const qualityInfo = useMemo(() => {
        const { qualityFlags } = metadata;
        if (qualityFlags?.dataIntegrity?.hasGaps) {
            return { label: 'Poor', color: 'bg-red-50 text-red-700 border-red-100', icon: XCircle };
        }
        if (qualityFlags?.hasLowGpsQuality || qualityFlags?.isGpsLikelyDuplicated) {
            return { label: 'Fair', color: 'bg-amber-50 text-amber-700 border-amber-100', icon: AlertTriangle };
        }
        return { label: 'Good', color: 'bg-green-50 text-green-700 border-green-100', icon: CheckCircle2 };
    }, [metadata]);

    const QualityIcon = qualityInfo.icon;

    const handleDownloadMetadata = () => {
        const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ride_metadata_${rideId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Metadata JSON exported');
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this ride?')) {
            await deleteRide(ride.id);
            navigate('/history');
        }
    };

    const formatDuration = (seconds: number | undefined) => {
        if (seconds === undefined) return "—";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <Layout>
            <div className="w-full max-w-2xl mx-auto space-y-6 pb-20 px-4 pt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => navigate('/history')} className="rounded-full">
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-xl font-bold tracking-tight">Ride Details</h1>
                    </div>
                    <Badge variant="outline" className={`${qualityInfo.color} font-medium px-2.5 py-0.5`}>
                        <QualityIcon className="h-3.5 w-3.5 mr-1.5" />
                        {qualityInfo.label}
                    </Badge>
                </div>

                {/* SUMMARY CARD */}
                <Card className="border-none shadow-sm bg-card ring-1 ring-border">
                    <CardHeader className="pb-3 pt-4">
                        <CardTitle className="text-base text-muted-foreground font-medium uppercase tracking-wider">Ride Summary</CardTitle>
                        <CardDescription className="text-foreground font-semibold">
                            {new Date(ride.startTime).toLocaleString()}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-y-6 gap-x-4">
                        <div className="space-y-1">
                            <div className="flex items-center text-muted-foreground border-b border-border/50 pb-1 mb-1">
                                <Clock className="h-3 w-3 mr-1.5" />
                                <span className="text-[10px] uppercase font-bold tracking-widest">Duration</span>
                            </div>
                            <p className="text-lg font-mono font-bold leading-none">{formatDuration(metadata.durationSeconds)}</p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center text-muted-foreground border-b border-border/50 pb-1 mb-1">
                                <MapPin className="h-3 w-3 mr-1.5" />
                                <span className="text-[10px] uppercase font-bold tracking-widest">Distance</span>
                            </div>
                            <p className="text-lg font-mono font-bold leading-none">
                                {metadata.statsSummary?.gpsDistanceMeters != null
                                    ? (metadata.statsSummary.gpsDistanceMeters / 1000).toFixed(2)
                                    : "—"} <span className="text-xs font-normal text-muted-foreground">km</span>
                            </p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center text-muted-foreground border-b border-border/50 pb-1 mb-1">
                                <Gauge className="h-3 w-3 mr-1.5" />
                                <span className="text-[10px] uppercase font-bold tracking-widest">Avg Speed</span>
                            </div>
                            <p className="text-lg font-mono font-bold leading-none">
                                {metadata.statsSummary?.avgSpeedMps?.toFixed(1) ?? "—"} <span className="text-xs font-normal text-muted-foreground">m/s</span>
                            </p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center text-muted-foreground border-b border-border/50 pb-1 mb-1">
                                <BarChart2 className="h-3 w-3 mr-1.5" />
                                <span className="text-[10px] uppercase font-bold tracking-widest">Max G-Force</span>
                            </div>
                            <p className="text-lg font-mono font-bold leading-none">
                                {metadata.statsSummary?.maxAbsAccel != null
                                    ? (metadata.statsSummary.maxAbsAccel / 9.81).toFixed(2)
                                    : "—"} <span className="text-xs font-normal text-muted-foreground">g</span>
                            </p>
                        </div>
                    </CardContent>
                    <div className="px-6 py-3 bg-muted/30 border-t flex items-center justify-between overflow-hidden">
                        <span className="text-xs text-muted-foreground">Insight Status</span>
                        <span className="text-xs font-semibold truncate max-w-[200px]">
                            {metadata.display?.summaryReasonI18n?.en || (metadata.qualityFlags?.isStationaryLikely ? 'Stationary' : 'Valid Recording')}
                        </span>
                    </div>
                </Card>

                {/* EVENTS & INTEGRITY CARD */}
                <Card className="shadow-sm border-none ring-1 ring-border">
                    <CardHeader className="pb-2 pt-4">
                        <CardTitle className="text-sm font-bold flex items-center">
                            <AlertTriangle className="h-4 w-4 mr-2 text-primary" />
                            Integrity & Health
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 pt-2">
                        <div className="flex justify-between items-center py-2 text-sm">
                            <span className="text-muted-foreground">Total Data Points</span>
                            <span className="font-mono font-bold text-xs">{(metadata.counts?.totalEvents ?? 0).toLocaleString()}</span>
                        </div>

                        <div className="flex justify-between items-center py-2 text-sm border-t border-muted/50">
                            <span className="text-muted-foreground">Signal Gaps</span>
                            {metadata.qualityFlags?.dataIntegrity?.hasGaps ? (
                                <Badge variant="destructive" className="h-5 text-[10px]">
                                    {metadata.qualityFlags.dataIntegrity.gapCount} gaps
                                </Badge>
                            ) : (
                                <span className="text-green-600 font-bold text-xs uppercase tracking-wider">Perfect</span>
                            )}
                        </div>

                        <div className="flex justify-between items-center py-2 text-sm border-t border-muted/50">
                            <span className="text-muted-foreground">GPS Status</span>
                            {metadata.qualityFlags?.hasLowGpsQuality ? (
                                <span className="text-amber-600 font-bold text-xs uppercase tracking-wider">
                                    {metadata.qualityFlags.gpsQualityReason?.replace('-', ' ') || 'Degraded'}
                                </span>
                            ) : (
                                <span className="text-green-600 font-bold text-xs uppercase tracking-wider">Strong</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* USER TRIGGERED GRAPHS (Lazy Load) */}
                {!showGraphs ? (
                    <Button
                        variant="outline"
                        className="w-full h-12 border-dashed bg-muted/20 hover:bg-muted/40 text-muted-foreground"
                        onClick={() => setShowGraphs(true)}
                    >
                        <BarChart2 className="h-4 w-4 mr-2" />
                        Load Detailed Graphs (Heavy)
                    </Button>
                ) : (
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Sensor Data Visualization</h3>
                            <Button variant="ghost" size="sm" onClick={() => setShowGraphs(false)} className="h-7 text-xs">Hide</Button>
                        </div>
                        <Suspense fallback={
                            <div className="flex flex-col items-center justify-center p-12 space-y-4 border rounded-xl bg-card">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Processing samples safely...</p>
                            </div>
                        }>
                            {/* Note: dataPoints are accessed ONLY here, inside a lazy suspended component */}
                            {ride.dataPoints && ride.dataPoints.length > 0 ? (
                                <SensorGraphs dataPoints={ride.dataPoints} />
                            ) : (
                                <div className="p-8 text-center bg-muted/30 rounded-xl border">
                                    <p className="text-sm text-muted-foreground">Raw samples not found in local storage</p>
                                </div>
                            )}
                        </Suspense>
                    </div>
                )}

                {/* TECHNICAL DETAILS */}
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="technical" className="border-none shadow-sm ring-1 ring-border rounded-lg px-4 bg-card">
                        <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center space-x-2">
                                <Info className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-semibold text-muted-foreground">System & Sampling Info</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-0 pb-6">
                            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-[11px]">
                                <div className="space-y-1">
                                    <p className="text-muted-foreground uppercase font-bold tracking-tighter opacity-70">Sampling Rate</p>
                                    <p className="font-mono text-xs">A: {metadata.sampling?.accelerometerHz ?? 0} Hz</p>
                                    <p className="font-mono text-xs text-muted-foreground">G: {metadata.sampling?.gpsHz ?? 0} Hz</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-muted-foreground uppercase font-bold tracking-tighter opacity-70">Environment</p>
                                    <p className="font-mono text-xs truncate">{metadata.device?.os?.name ?? "Unknown"} OS</p>
                                    <p className="font-mono text-xs text-muted-foreground truncate">{metadata.device?.browserName ?? "Unknown"}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-muted-foreground uppercase font-bold tracking-tighter opacity-70">App Version</p>
                                    <p className="font-mono text-xs">{metadata.app?.version ?? "Unknown"}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-muted-foreground uppercase font-bold tracking-tighter opacity-70">Backend</p>
                                    <p className="font-mono text-xs">Schema {metadata.schemaVersion}</p>
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* ACTIONS CARD */}
                <div className="grid grid-cols-2 gap-3 pt-4">
                    <Button variant="secondary" className="space-x-2" onClick={() => exportRideData(ride)}>
                        <Download className="h-4 w-4" />
                        <span>Save ZIP</span>
                    </Button>
                    <Button variant="secondary" className="space-x-2" onClick={handleDownloadMetadata}>
                        <FileJson className="h-4 w-4" />
                        <span>Save JSON</span>
                    </Button>
                    <Button variant="ghost" className="col-span-2 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleDelete}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Recording Permanently
                    </Button>
                </div>
            </div>
        </Layout>
    );
};

export default RideDetails;
