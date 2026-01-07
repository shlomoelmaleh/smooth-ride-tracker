
export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export interface GyroscopeData {
  alpha: number;
  beta: number;
  gamma: number;
  timestamp: number;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface EarthAcceleration {
  x: number;
  y: number;
  z: number;
}

export interface RideDataPoint {
  accelerometer: AccelerometerData;
  gyroscope: GyroscopeData | null;
  location: LocationData | null;
  earth: EarthAcceleration | null;
  timestamp: number;
}

export interface RideSession {
  id: string;
  startTime: number;
  endTime: number | null;
  dataPoints: RideDataPoint[];
  smoothnessScore?: number;
  distance?: number;
  duration?: number;
}

export interface RideStats {
  averageAcceleration: number;
  maxAcceleration: number;
  suddenStops: number;
  suddenAccelerations: number;
  vibrationLevel: number;
  duration: number;
  distance: number;
}
