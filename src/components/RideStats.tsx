
import { useState } from 'react';
import { RideSession, RideStats } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowUp, ArrowDown, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RideStatsProps {
  ride: RideSession;
  stats: RideStats;
  onExport?: () => void;
}

const RideStats: React.FC<RideStatsProps> = ({ ride, stats, onExport }) => {
  const [activeTab, setActiveTab] = useState('overview');
  
  const formatDuration = (seconds: number): string => {
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
  
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };
  
  const getSmoothnessBadge = (score: number) => {
    if (score >= 85) return { label: 'Very Smooth', color: 'bg-green-100 text-green-800' };
    if (score >= 70) return { label: 'Smooth', color: 'bg-emerald-100 text-emerald-800' };
    if (score >= 50) return { label: 'Average', color: 'bg-yellow-100 text-yellow-800' };
    if (score >= 30) return { label: 'Bumpy', color: 'bg-orange-100 text-orange-800' };
    return { label: 'Very Bumpy', color: 'bg-red-100 text-red-800' };
  };
  
  const badge = getSmoothnessBadge(ride.smoothnessScore || 0);
  
  return (
    <Card className="w-full max-w-xl mx-auto overflow-hidden animate-scale-in">
      <CardHeader className="bg-secondary/50 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">Ride Summary</CardTitle>
            <CardDescription>
              {formatDate(ride.startTime)}
            </CardDescription>
          </div>
          <div className={cn("px-3 py-1 rounded-full text-xs font-medium", badge.color)}>
            {badge.label}
          </div>
        </div>
      </CardHeader>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-6 pt-3">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="overview" className="pt-4 animate-fade-in">
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <StatCard 
                title="Smoothness" 
                value={`${Math.round(ride.smoothnessScore || 0)}`}
                suffix="/100"
                icon={<div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      background: `conic-gradient(hsl(var(--primary)) ${(ride.smoothnessScore || 0)}%, transparent 0)`
                    }}
                  >
                    <div className="w-6 h-6 rounded-full bg-card flex items-center justify-center text-xs font-medium">
                      {Math.round(ride.smoothnessScore || 0)}
                    </div>
                  </div>
                </div>}
              />
              
              <StatCard 
                title="Duration" 
                value={formatDuration(stats.duration)}
                icon={<div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Clock size={20} className="text-blue-600" />
                </div>}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <StatCard 
                title="Distance" 
                value={formatDistance(stats.distance)}
                icon={<div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center">
                  <MapPin size={20} className="text-violet-600" />
                </div>}
              />
              
              <StatCard 
                title="Events" 
                value={(stats.suddenStops + stats.suddenAccelerations).toString()}
                icon={<div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <div className="flex flex-col">
                    <ArrowUp size={12} className="text-red-500" />
                    <ArrowDown size={12} className="text-orange-500 mt-1" />
                  </div>
                </div>}
              />
            </div>
            
            {onExport && (
              <div className="mt-6 flex justify-center">
                <Button 
                  variant="outline" 
                  onClick={onExport} 
                  className="text-sm"
                >
                  Export Ride Data
                </Button>
              </div>
            )}
          </CardContent>
        </TabsContent>
        
        <TabsContent value="details" className="animate-fade-in">
          <CardContent>
            <div className="space-y-4">
              <DetailRow 
                label="Sudden Stops" 
                value={stats.suddenStops.toString()} 
                icon={<ArrowDown size={16} className="text-orange-500" />} 
              />
              
              <DetailRow 
                label="Sudden Accelerations" 
                value={stats.suddenAccelerations.toString()} 
                icon={<ArrowUp size={16} className="text-red-500" />} 
              />
              
              <DetailRow 
                label="Max Acceleration" 
                value={`${stats.maxAcceleration.toFixed(2)} m/s²`} 
                icon={<span className="text-xs font-semibold">MAX</span>} 
              />
              
              <DetailRow 
                label="Avg Acceleration" 
                value={`${stats.averageAcceleration.toFixed(2)} m/s²`} 
                icon={<span className="text-xs font-semibold">AVG</span>} 
              />
              
              <DetailRow 
                label="Vibration Level" 
                value={`${stats.vibrationLevel.toFixed(2)}`} 
                icon={<span className="text-xs font-semibold">VIB</span>} 
              />
            </div>
            
            {onExport && (
              <div className="mt-6 flex justify-center">
                <Button 
                  variant="outline" 
                  onClick={onExport} 
                  className="text-sm"
                >
                  Export Ride Data
                </Button>
              </div>
            )}
          </CardContent>
        </TabsContent>
      </Tabs>
    </Card>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  suffix?: string;
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, suffix = '', icon }) => {
  return (
    <div className="flex items-center p-3 rounded-lg bg-secondary/30">
      {icon}
      <div className="ml-3">
        <div className="text-xs text-muted-foreground font-medium">{title}</div>
        <div className="text-lg font-semibold">
          {value}<span className="text-xs text-muted-foreground">{suffix}</span>
        </div>
      </div>
    </div>
  );
};

interface DetailRowProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, icon }) => {
  return (
    <div className="flex justify-between items-center border-b border-border pb-2">
      <div className="flex items-center">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mr-3">
          {icon}
        </div>
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-medium">{value}</span>
    </div>
  );
};

export default RideStats;
