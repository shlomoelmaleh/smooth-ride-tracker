
import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Download, FileJson, Trash2, Info, CheckCircle2, AlertTriangle, XCircle, Clock, MapPin, Gauge } from 'lucide-react';
import Layout from '@/components/Layout';
import { useRideData } from '@/hooks/useRideData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const RideDetails = () => {
    const { rideId } = useParams<{ rideId: string }>();
    const navigate = useNavigate();
    const { rides, deleteRide, exportRideData } = useRideData();

    // Find ride by ID - LIGHTWEIGHT LOOKUP
    const ride = useMemo(() => rides.find(r => r.id === rideId), [rides, rideId]);

    if (!ride) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
                    <h2 className="text-xl font-semibold">Ride not found</h2>
                    <Button onClick={() => navigate('/history')}>Back to History</Button>
                </div>
            </Layout>
        );
    }

    const { metadata } = ride;

    // Derive Quality Grade
    const qualityInfo = useMemo(() => {
        if (!metadata) return { label: 'Unknown', color: 'bg-muted text-muted-foreground', icon: Info };

        const { qualityFlags } = metadata;
        if (qualityFlags?.dataIntegrity?.hasGaps) {
            return { label: 'Poor', color: 'bg-red-100 text-red-700', icon: XCircle };
        }
        if (qualityFlags?.hasLowGpsQuality || qualityFlags?.isGpsLikelyDuplicated) {
            return { label: 'Fair', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle };
        }
        return { label: 'Good', color: 'bg-green-100 text-green-700', icon: CheckCircle2 };
    }, [metadata]);

    const QualityIcon = qualityInfo.icon;

    const handleDownloadMetadata = () => {
        if (!metadata) return;
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

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <Layout>
            <div className="w-full max-w-2xl mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center space-x-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/history')}>
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight">Ride Details</h1>
                </div>

                {/* SUMMARY CARD */}
                <Card className="overflow-hidden border-none shadow-soft bg-gradient-to-br from-background to-muted/30">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-lg">Ride Summary</CardTitle>
                                <CardDescription>{new Date(ride.startTime).toLocaleString()}</CardDescription>
                            </div>
                            <Badge className={qualityInfo.color}>
                                <QualityIcon className="h-3 w-3 mr-1" />
                                {qualityInfo.label}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-primary/10 rounded-full">
                                    <Clock className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Duration</p>
                                    <p className="text-sm font-semibold">{formatDuration(metadata?.durationSeconds || ride.duration || 0)}</p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-primary/10 rounded-full">
                                    <MapPin className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Distance</p>
                                    <p className="text-sm font-semibold">
                                        {metadata?.statsSummary?.gpsDistanceMeters ? (metadata.statsSummary.gpsDistanceMeters / 1000).toFixed(2) : (ride.distance / 1000).toFixed(2)} km
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-primary/10 rounded-full">
                                    <Gauge className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Avg Speed</p>
                                    <p className="text-sm font-semibold">{metadata?.statsSummary?.avgSpeedMps?.toFixed(1) || '0.0'} m/s</p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-primary/10 rounded-full">
                                    <Info className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</p>
                                        <p className="text-sm font-semibold truncate max-w-[120px]">
                                            {metadata?.display?.summaryReasonI18n?.en || (metadata?.qualityFlags?.isStationaryLikely ? 'Stationary' : 'Valid Ride')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* EVENTS & INTEGRITY CARD */}
                <Card className="shadow-soft border-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Events & Integrity</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-muted/50 last:border-0">
                            <span className="text-sm text-muted-foreground">Total Events</span>
                            <span className="text-sm font-bold">{metadata?.counts?.totalEvents || 0} detected</span>
                        </div>

                        <div className="flex justify-between items-center py-2 border-b border-muted/50 last:border-0 text-sm">
                            <span className="text-muted-foreground">Signal Integrity</span>
                            {metadata?.qualityFlags?.dataIntegrity?.hasGaps ? (
                                <span className="font-bold text-red-500">{metadata.qualityFlags.dataIntegrity.gapCount} gaps found</span>
                            ) : (
                                <span className="font-bold text-green-500">Perfect</span>
                            )}
                        </div>

                        <div className="flex justify-between items-center py-2 border-b border-muted/50 last:border-0 text-sm">
                            <span className="text-muted-foreground">GPS Quality</span>
                            {metadata?.qualityFlags?.hasLowGpsQuality ? (
                                <span className="font-bold text-amber-600">{metadata.qualityFlags.gpsQualityReason || 'Low Accuracy'}</span>
                            ) : (
                                <span className="font-bold text-green-500">Excellent</span>
                            )}
                        </div>

                        <div className="flex justify-between items-center py-2 border-b border-muted/50 last:border-0 text-sm">
                            <span className="text-muted-foreground">Movement Check</span>
                            {metadata?.qualityFlags?.isStationaryLikely ? (
                                <span className="font-bold text-blue-500 italic">Stationary</span>
                            ) : (
                                <span className="font-bold text-primary">Active</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* TECHNICAL DETAILS (Accordion) */}
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="technical" className="border-none shadow-soft bg-card rounded-lg px-4 overflow-hidden">
                        <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center space-x-2">
                                <Info className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-semibold">Technical System Info</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pb-4">
                            <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-[11px]">
                                <div>
                                    <p className="text-muted-foreground uppercase tracking-tight">Sampling Rates</p>
                                    <p className="font-mono mt-0.5">Accel: {metadata?.sampling?.accelerometerHz || '0'} Hz</p>
                                    <p className="font-mono">Gyro: {metadata?.sampling?.gyroscopeHz || '0'} Hz</p>
                                    <p className="font-mono">GPS: {metadata?.sampling?.gpsHz || '0'} Hz</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground uppercase tracking-tight">Sample Counts</p>
                                    <p className="font-mono mt-0.5">Accel: {metadata?.counts?.accelSamples ?? 0}</p>
                                    <p className="font-mono">Gyro: {metadata?.counts?.gyroSamples ?? 0}</p>
                                    <p className="font-mono">GPS: {metadata?.counts?.gpsUpdates ?? 0}</p>
                                </div>
                                <div>
                                    <div>
                                        <p className="text-muted-foreground uppercase tracking-tight">App Version</p>
                                        <p className="font-mono mt-0.5">{metadata?.app?.version || 'Unknown'}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground uppercase tracking-tight">System Environment</p>
                                        <p className="font-mono mt-0.5 truncate">{metadata?.device?.os?.name || 'Unknown'}</p>
                                        <p className="font-mono truncate">{metadata?.device?.browserName || 'Unknown'}</p>
                                    </div>
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* ACTIONS CARD */}
                <Card className="shadow-soft border-none bg-primary/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Data Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3">
                        <Button className="w-full justify-start overflow-hidden text-xs" onClick={() => exportRideData(ride)}>
                            <Download className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">Download ZIP</span>
                        </Button>
                        <Button variant="outline" className="w-full justify-start overflow-hidden text-xs" onClick={handleDownloadMetadata}>
                            <FileJson className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">Export Meta</span>
                        </Button>
                    </CardContent>
                    <CardFooter className="pt-0 border-t border-primary/10 mt-2">
                        <Button variant="ghost" className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 text-xs mt-3" onClick={handleDelete}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Local Record
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </Layout>
    );
};

export default RideDetails;
