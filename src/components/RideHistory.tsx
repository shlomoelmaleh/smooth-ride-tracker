
import { useState } from 'react';
import { RideSession, RideStats } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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

  if (rides.length === 0) {
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

  const sortedRides = [...rides].sort((a, b) => b.startTime - a.startTime);

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds.toFixed(0)} sec`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${meters.toFixed(0)}m`;
    }
    return `${(meters / 1000).toFixed(2)}km`;
  };

  const getSmoothnessBadge = (score: number) => {
    if (score >= 85) return { label: 'Very Smooth', color: 'bg-green-100 text-green-800' };
    if (score >= 70) return { label: 'Smooth', color: 'bg-emerald-100 text-emerald-800' };
    if (score >= 50) return { label: 'Average', color: 'bg-yellow-100 text-yellow-800' };
    if (score >= 30) return { label: 'Bumpy', color: 'bg-orange-100 text-orange-800' };
    return { label: 'Very Bumpy', color: 'bg-red-100 text-red-800' };
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {sortedRides.map(ride => {
        const isExpanded = expandedRideId === ride.id;
        const badge = getSmoothnessBadge(ride.smoothnessScore || 0);

        // Use precomputed values for lightweight list rendering
        const displayDistance = ride.metadata?.statsSummary?.gpsDistanceMeters || ride.distance || 0;
        const displayDuration = ride.metadata?.durationSeconds || ride.duration || 0;
        const eventCount = ride.metadata?.counts?.totalEvents || 0;

        return (
          <Card
            key={ride.id}
            className={cn(
              "w-full transition-all duration-300 overflow-hidden",
              isExpanded ? "shadow-medium" : "hover:shadow-soft cursor-pointer"
            )}
            onClick={() => !isExpanded && setExpandedRideId(ride.id)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium flex items-center">
                    <Calendar size={16} className="mr-2 text-muted-foreground" />
                    {formatDate(ride.startTime)}
                  </CardTitle>
                  <CardDescription className="flex items-center mt-1">
                    <MapPin size={14} className="mr-1" />
                    {formatDistance(displayDistance)} journey
                  </CardDescription>
                </div>
                <div className={cn("px-3 py-1 rounded-full text-xs font-medium", badge.color)}>
                  {badge.label}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="flex justify-between items-center py-1">
                <div className="flex items-center">
                  <Clock size={16} className="mr-2 text-muted-foreground" />
                  <span className="text-sm">{formatDuration(displayDuration)}</span>
                </div>
                <div className="flex items-center">
                  <ArrowUpDown size={16} className="mr-2 text-muted-foreground" />
                  <span className="text-sm">{eventCount} events</span>
                </div>
              </div>

              {isExpanded && (
                <div className="pt-3 mt-3 border-t animate-fade-in">
                  <div className="flex space-x-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedRideId(null);
                        onViewDetails(ride);
                      }}
                    >
                      View Details
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteRide(ride.id);
                        setExpandedRideId(null);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
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
