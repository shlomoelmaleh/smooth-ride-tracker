
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    ChevronLeft,
    Calendar,
    Clock,
    Activity,
    AlertTriangle,
    ShieldCheck,
    MapPin,
    ArrowLeft
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RideDetailsViewModel } from '@/types';

/**
 * RideDetails: STRICT SAFE SUMMARY VIEW.
 * Physically decoupled from raw sensor data, processing, and heavy libraries.
 * Receives data via React Router state (RideDetailsViewModel).
 */
const RideDetails = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // PART 3: RECEIVE ONLY VIEWMODEL
    const viewModel = location.state?.viewModel as RideDetailsViewModel | undefined;

    if (!viewModel) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 px-4 text-center">
                    <AlertTriangle className="h-12 w-12 text-amber-500 mb-2" />
                    <h2 className="text-xl font-bold">Ride summary unavailable</h2>
                    <p className="text-muted-foreground text-sm max-w-xs">
                        The requested summary could not be retrieved safely or has expired.
                    </p>
                    <Button onClick={() => navigate('/history')} className="mt-4">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to History
                    </Button>
                </div>
            </Layout>
        );
    }

    const formatTime = (iso?: string) => {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return "—";
        }
    };

    const formatDate = (iso?: string) => {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        } catch {
            return "—";
        }
    };

    const formatDuration = (seconds?: number) => {
        if (seconds === undefined) return "—";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s`;
    };

    const formatDistance = (meters?: number) => {
        if (meters === undefined) return "—";
        return (meters / 1000).toFixed(2);
    };

    return (
        <Layout>
            <div className="w-full max-w-xl mx-auto space-y-6 pb-20 px-4 pt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/history')} className="-ml-2">
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        History
                    </Button>
                    <Badge variant="outline" className="font-mono text-[10px] opacity-70">
                        ID: {viewModel.rideId.slice(-8)}
                    </Badge>
                </div>

                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight">Ride Summary</h1>
                    <p className="text-muted-foreground flex items-center text-sm">
                        <Calendar className="h-3.5 w-3.5 mr-1.5" />
                        {formatDate(viewModel.createdAtIso)}
                    </p>
                </div>

                {/* PRIMARY METRICS CARD */}
                <Card className="border-none shadow-sm ring-1 ring-border">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center">
                                <Clock className="h-3 w-3 mr-1" /> Duration
                            </span>
                            <p className="text-xl font-mono font-bold">{formatDuration(viewModel.durationSeconds)}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center">
                                <MapPin className="h-3 w-3 mr-1" /> Distance
                            </span>
                            <p className="text-xl font-mono font-bold">
                                {formatDistance(viewModel.distanceMeters)} <span className="text-xs">km</span>
                            </p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center">
                                <Activity className="h-3 w-3 mr-1" /> Smoothness
                            </span>
                            <p className="text-xl font-mono font-bold">
                                {viewModel.smoothnessScore ?? "—"}<span className="text-xs font-normal opacity-50">/100</span>
                            </p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center">
                                <ShieldCheck className="h-3 w-3 mr-1" /> Quality
                            </span>
                            <p className="text-lg font-bold">
                                {viewModel.smoothnessLabel ?? "Unknown"}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* SAFETY & INSIGHTS */}
                <Card className="border-none shadow-sm ring-1 ring-border bg-muted/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center">
                            <Activity className="h-4 w-4 mr-2 text-primary" />
                            Events Detected
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Sudden Stops</span>
                            <span className="font-mono font-bold">{viewModel.statsSummary?.suddenStops ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Sudden Accel.</span>
                            <span className="font-mono font-bold">{viewModel.statsSummary?.suddenAccelerations ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm pt-2 border-t border-border/50">
                            <span className="text-muted-foreground">Max G-Force</span>
                            <span className="font-mono font-bold">
                                {viewModel.statsSummary?.maxAbsAccel ? (viewModel.statsSummary.maxAbsAccel / 9.81).toFixed(2) : "—"} g
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* DATA INTEGRITY */}
                {viewModel.qualityFlags && (
                    <Card className="border-none shadow-sm ring-1 ring-border">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Data Health</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 pb-4">
                            {viewModel.qualityFlags.hasLowGpsQuality ? (
                                <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 p-2 rounded-md text-xs">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    <span>Signal Quality: {viewModel.qualityFlags.gpsQualityReason ?? "Degraded"}</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 text-green-600 bg-green-50 p-2 rounded-md text-xs">
                                    <ShieldCheck className="h-4 w-4 shrink-0" />
                                    <span>GPS Satellite Lock: Strong</span>
                                </div>
                            )}
                            {viewModel.qualityFlags.isGpsLikelyDuplicated && (
                                <p className="text-[10px] text-muted-foreground italic px-1">
                                    * High-latency signal detected during recording
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}

                <div className="pt-4">
                    <p className="text-center text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                        End of Summary
                    </p>
                </div>
            </div>
        </Layout>
    );
};
export default RideDetails;
