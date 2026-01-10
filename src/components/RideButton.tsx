
import { useState, useEffect } from 'react';
import { Play, Square, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";

interface RideButtonProps {
  isTracking: boolean;
  onStart: () => void;
  onStop: () => void;
  hasRequiredSensors: boolean;
}

const RideButton: React.FC<RideButtonProps> = ({
  isTracking,
  onStart,
  onStop,
  hasRequiredSensors
}) => {
  const [ripples, setRipples] = useState<{id: number, x: number, y: number}[]>([]);
  const [nextId, setNextId] = useState(0);
  const { toast } = useToast();
  
  useEffect(() => {
    // Cleanup ripples after animation completes
    const timer = setTimeout(() => {
      if (ripples.length > 0) {
        setRipples([]);
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [ripples]);
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!hasRequiredSensors) {
      toast({
        title: "Sensors Required",
        description: "Your device doesn't have the required motion sensors for tracking.",
        variant: "destructive",
      });
    }
    
    // Create ripple effect
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setRipples([...ripples, { id: nextId, x, y }]);
    setNextId(nextId + 1);
    
    // Call appropriate handler
    if (isTracking) {
      onStop();
    } else {
      onStart();
    }
  };
  
  return (
    <div className="flex flex-col items-center my-10">
      <button
        onClick={handleClick}
        className={cn(
          "relative overflow-hidden w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-medium",
          isTracking
            ? "bg-destructive text-white hover:bg-destructive/90 animate-pulse-soft"
            : "bg-primary text-white hover:bg-primary/90",
          !hasRequiredSensors && "opacity-80"
        )}
      >
        <div className="relative z-10 flex flex-col items-center justify-center">
          {isTracking ? (
            <>
              <Square size={30} strokeWidth={2} />
              <span className="text-xs font-medium mt-1">STOP</span>
            </>
          ) : (
            <>
              <Play size={30} strokeWidth={2} />
              <span className="text-xs font-medium mt-1">START</span>
            </>
          )}
        </div>
        
        {/* Ripple effects */}
        {ripples.map(ripple => (
          <span
            key={ripple.id}
            className="absolute rounded-full bg-white/20 animate-ripple"
            style={{
              top: ripple.y,
              left: ripple.x,
              width: '20px',
              height: '20px',
              transform: 'translate(-50%, -50%) scale(0)'
            }}
          />
        ))}
      </button>
      
      {!hasRequiredSensors && (
        <div className="mt-4 flex items-center text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
          <Smartphone size={16} className="mr-2" />
          <span>Required sensors not available</span>
        </div>
      )}
      
      <div className="text-center mt-4">
        <p className="text-sm text-muted-foreground">
          {isTracking 
            ? "Recording ride data... Tap to stop."
            : "Tap to start recording your ride"}
        </p>
      </div>
    </div>
  );
};

export default RideButton;
