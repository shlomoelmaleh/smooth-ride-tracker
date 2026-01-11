
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    ChevronLeft,
    Calendar,
    Clock,
    Activity,
    AlertCircle,
    ShieldCheck,
    MapPin,
    Zap,
    ChevronDown
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { RideDetailsViewModel } from '@/types';

const RideDetails = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const viewModel = location.state?.viewModel as RideDetailsViewModel | undefined;

    if (!viewModel) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 px-4 text-center">
                    <AlertCircle className="h-12 w-12 text-amber-500 mb-2" />
                    <h2 className="text-xl font-bold">Ride summary unavailable</h2>
                    <p className="text-muted-foreground text-sm max-w-xs">
                        The requested summary could not be retrieved safely or has expired.
                    </p>
                    <Button onClick={() => navigate('/history')} className="mt-4 rounded-full">
                        <ChevronLeft className="h-4 w-4 mr-2" />
                        Back to History
                    </Button>
                </div>
            </Layout>
        );
    }

    const formatDate = (iso?: string) => {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        } catch { return "—"; }
    };

    const formatTime = (iso?: string) => {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } catch { return "—"; }
    };

    const formatDuration = (seconds?: number) => {
        if (seconds === undefined) return "—";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s`;
    };

    const formatDistance = (meters?: number) => {
        if (meters === undefined) return "—";
        if (meters < 1000) return `${Math.round(meters)} m`;
        return `${(meters / 1000).toFixed(1)} km`;
    };

    const getHealthMessage = () => {
        if (viewModel.qualityFlags?.hasLowGpsQuality) {
            return "Urban environment – minor GPS noise detected";
        }
        return "Good signal quality throughout the ride";
    };

    return (
        <Layout>
            <div className="w-full max-w-lg mx-auto pb-20 px-6 pt-4 animate-in fade-in slide-in-from-bottom-2 duration-500">

                {/* HEADER */}
                <div className="mb-10 space-y-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/history')}
                        className="-ml-2 text-muted-foreground hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Back to History
                    </Button>

                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold tracking-tight">Ride Details</h1>
                        <div className="flex items-center text-sm font-medium text-muted-foreground/60 space-x-2">
                            <span>{formatDate(viewModel.createdAtIso)}</span>
                            <span>•</span>
                            <span>{formatTime(viewModel.createdAtIso)}</span>
                        </div>
                    </div>
                </div>

                {/* SECTION 1: RIDE OVERVIEW (ABOVE THE FOLD) */}
                <Card className="border-none shadow-2xl shadow-primary/5 bg-card/40 backdrop-blur-sm ring-1 ring-border/50 rounded-[2rem] overflow-hidden mb-6">
                    <CardContent className="p-8">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="flex flex-col items-center space-y-2 text-center">
                                <Clock className="h-5 w-5 text-muted-foreground/30" />
                                <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/40">Duration</span>
                                <p className="text-lg font-bold tracking-tight">{formatDuration(viewModel.durationSeconds)}</p>
                            </div>
                            <div className="flex flex-col items-center space-y-2 text-center">
                                <MapPin className="h-5 w-5 text-muted-foreground/30" />
                                <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/40">Distance</span>
                                <p className="text-lg font-bold tracking-tight">{formatDistance(viewModel.distanceMeters)}</p>
                            </div>
                            <div className="flex flex-col items-center space-y-2 text-center">
                                <Zap className="h-5 w-5 text-muted-foreground/30" />
                                <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/40">Smoothness</span>
                                <p className="text-lg font-bold tracking-tight">{Math.round(viewModel.smoothnessScore || 0)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* SECTION 2: DATA HEALTH */}
                <div className="px-4 py-3 bg-muted/30 rounded-2xl flex items-center space-x-3 mb-8">
                    <ShieldCheck className="h-4 w-4 text-emerald-500/60" />
                    <p className="text-xs font-medium text-muted-foreground/80 leading-relaxed">
                        {getHealthMessage()}
                    </p>
                </div>

                {/* SECTION 3: RIDE EVENTS (COLLAPSIBLE) */}
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="events" className="border-none">
                        <AccordionTrigger className="hover:no-underline px-4 py-4 bg-card/20 hover:bg-card/40 rounded-2xl ring-1 ring-border/40 transition-all [&[data-state=open]>svg]:rotate-180">
                            <div className="flex items-center space-x-3">
                                <Activity className="h-4 w-4 text-muted-foreground/40" />
                                <span className="text-sm font-bold tracking-tight">Ride Events</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-4 px-6 pb-6 space-y-4">
                            {viewModel.statsSummary ? (
                                <>
                                    <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                                        {(viewModel.statsSummary.suddenStops || 0) + (viewModel.statsSummary.suddenAccelerations || 0) > 0
                                            ? "Several sudden movements detected during transit."
                                            : "No notable events detected during this ride."}
                                    </p>
                                    <div className="flex items-center space-x-6">
                                        <div className="space-y-1">
                                            <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/40">Max Impact</span>
                                            <p className="text-base font-bold">
                                                {viewModel.statsSummary.maxAbsAccel
                                                    ? `${Math.round(viewModel.statsSummary.maxAbsAccel / 9.81)} g`
                                                    : "—"}
                                            </p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground italic">No notable events detected</p>
                            )}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                <div className="py-12 flex flex-col items-center space-y-2 opacity-20">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="text-[10px] uppercase font-black tracking-widest text-center">
                        End of Summary
                    </span>
                </div>
            </div>
        </Layout>
    );
};

export default RideDetails;
