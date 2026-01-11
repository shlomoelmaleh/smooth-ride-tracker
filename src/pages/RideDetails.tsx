
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

                {/* SECTION 3: RIDE EVENTS (TIMELINE) */}
                <div className="space-y-6">
                    <div className="flex items-center space-x-3 px-2">
                        <Activity className="h-4 w-4 text-muted-foreground/40" />
                        <span className="text-sm font-bold tracking-tight uppercase tracking-[0.1em] text-muted-foreground/60">Notable Events</span>
                    </div>

                    <div className="space-y-4">
                        {viewModel.events && viewModel.events.length > 0 ? (
                            <div className="relative pl-6 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-border/30">
                                {viewModel.events.map((event, idx) => (
                                    <div key={idx} className="relative animate-in fade-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${idx * 100}ms` }}>
                                        {/* Dot */}
                                        <div className={`absolute -left-[19.5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ring-4 ring-background ${event.type === 'impact' ? 'bg-rose-500/60' :
                                                event.type === 'stop' ? 'bg-amber-500/60' : 'bg-blue-500/60'
                                            }`} />

                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                                                    {Math.floor(event.relativeTimeMs / 1000)}s into ride
                                                </span>
                                                <div className="h-1 w-12 bg-muted/30 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${event.intensity > 0.7 ? 'bg-rose-500/40' :
                                                                event.intensity > 0.4 ? 'bg-amber-500/40' : 'bg-primary/40'
                                                            }`}
                                                        style={{ width: `${event.intensity * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-sm font-semibold text-foreground/80 leading-tight">
                                                {event.label}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="px-6 py-8 bg-muted/20 rounded-2xl border border-dashed border-border/50 text-center">
                                <p className="text-sm text-muted-foreground/50 italic font-medium">
                                    No notable events detected during this ride.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="py-16 flex flex-col items-center space-y-3 opacity-20">
                    <div className="h-10 w-[1px] bg-gradient-to-b from-transparent to-foreground/50" />
                    <span className="text-[10px] uppercase font-black tracking-widest text-center tracking-[0.3em]">
                        End of Timeline
                    </span>
                </div>
            </div>
        </Layout>
    );
};

export default RideDetails;
