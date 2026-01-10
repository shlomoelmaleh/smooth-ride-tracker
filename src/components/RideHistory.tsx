import { useState } from 'react';
import { RideSession, RideStats } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Calendar, Clock, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RideHistoryProps {
  rides: RideSession[];
  getRideStats: (ride: RideSession) => RideStats;
  onViewDetails: (ride: RideSession) => void;
  onDeleteRide: (rideId: string) => void;
}

const RideHistory: React.FC<RideHistoryProps> = ({
  rides,
  getRideStats,
  onViewDetails,
  onDeleteRide
}) => {
  const [expandedRideId, setExpandedRideId] = useState<string | null>(null);

  if (!rides || rides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <MapPin size={24} className="text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No rides yet</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Start tracking your first ride to begin collecting data about your journey.
        </p>
      </div>
    );
  }

  const sortedRides = [...rides].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

  const formatDate = (timestamp: number | undefined): string => {
    if (!timestamp) return 'Unknown Date';
    return new Date(timestamp).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number | undefined): string => {
    if (seconds === undefined || isNaN(seconds)) return 'N/A';
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDistance = (meters: number | undefined): string => {
    if (meters === undefined || isNaN(meters)) return 'N/A';
    if (meters < 1000) return `${meters.toFixed(0)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
  };

  const getSmoothnessBadge = (score: number | undefined) => {
    const s = score ?? 0;
    if (s >= 85) return { label: 'Very Smooth', color: 'bg-green-100 text-green-800' };
    if (s >= 70) return { label: 'Smooth', color: 'bg-emerald-100 text-emerald-800' };
    if (s >= 50) return { label: 'Average', color: 'bg-yellow-100 text-yellow-800' };
    if (s >= 30) return { label: 'Bumpy', color: 'bg-orange-100 text-orange-800' };
    return { label: 'Very Bumpy', color: 'bg-red-100 text-red-800' };
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {sortedRides.map(ride => {
        const stats = getRideStats(ride);
        const isExpanded = expandedRideId === ride.id;
        const badge = getSmoothnessBadge(ride.smoothnessScore);

        return (
          <Card
            key={ride.id}
            className={cn(
              "w-full transition-all duration-300 overflow-hidden",
              isExpanded ? "shadow-md border-primary/20" : "hover:shadow-sm cursor-pointer"
            )}
            onClick={() => !isExpanded && setExpandedRideId(ride.id)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium flex items-center">
                    <Calendar size={14} className="mr-2 text-muted-foreground" />
                    {formatDate(ride.startTime)}
                  </CardTitle>
                  <CardDescription className="flex items-center mt-1 text-xs">
                    <MapPin size={12} className="mr-1" />
                    {formatDistance(ride.distance || stats?.distance)} total
                  </CardDescription>
                </div>
                <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", badge.color)}>
                  {badge.label}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="flex justify-between items-center py-1 opacity-80">
                <div className="flex items-center">
                  <Clock size={14} className="mr-2 text-muted-foreground" />
                  <span className="text-xs">{formatDuration(ride.duration || stats?.duration)}</span>
                </div>
                <div className="flex items-center">
                  <ArrowUpDown size={14} className="mr-2 text-muted-foreground" />
                  <span className="text-xs">{((stats?.suddenStops || 0) + (stats?.suddenAccelerations || 0))} events</span>
                </div>
              </div>

              {isExpanded && (
                <div className="pt-3 mt-3 border-t flex space-x-2 justify-end animate-in fade-in slide-in-from-top-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedRideId(null);
                      onViewDetails(ride);
                    }}
                  >
                    Details
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRide(ride.id);
                      setExpandedRideId(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default RideHistory;
