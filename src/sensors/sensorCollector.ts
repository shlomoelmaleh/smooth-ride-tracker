
import {
    UnifiedSampleV2,
    MotionPayload,
    OrientationPayload,
    GpsPayload,
    CollectionHealth
} from './sensorTypes';
import { SamplingHealthMonitor } from './samplingStats';

export interface CollectorOptions {
    onSample: (sample: UnifiedSampleV2) => void;
    onHealthUpdate?: (health: CollectionHealth) => void;
}

export const startCollectors = (options: CollectorOptions) => {
    const motionMonitor = new SamplingHealthMonitor();
    const orientationMonitor = new SamplingHealthMonitor();
    const gpsMonitor = new SamplingHealthMonitor();

    let latestGps: GpsPayload | null = null;
    let latestOrientation: OrientationPayload | null = null;

    const createSample = (motion?: MotionPayload): UnifiedSampleV2 => {
        const timestamp = Date.now();

        // Legacy mapping (backward compatibility)
        const accel = motion?.accelGravity || motion?.accel || { x: 0, y: 0, z: 0 };
        const orient = latestOrientation || { alpha: 0, beta: 0, gamma: 0 };

        return {
            schemaVersion: 2,
            timestamp,
            accelerometer: { ...accel, timestamp },
            gyroscope: { alpha: orient.alpha || 0, beta: orient.beta || 0, gamma: orient.gamma || 0, timestamp },
            location: latestGps ? { latitude: latestGps.lat, longitude: latestGps.lon, accuracy: latestGps.accuracy, timestamp: latestGps.timestamp } : null,
            earth: motion?.accelGravity || null,
            sensors: {
                motion,
                orientation: latestOrientation || undefined,
                gps: latestGps || undefined
            }
        };
    };

    const onMotion = (e: DeviceMotionEvent) => {
        const motion: MotionPayload = {
            accel: e.acceleration ? { x: e.acceleration.x || 0, y: e.acceleration.y || 0, z: e.acceleration.z || 0 } : undefined,
            accelGravity: e.accelerationIncludingGravity ? { x: e.accelerationIncludingGravity.x || 0, y: e.accelerationIncludingGravity.y || 0, z: e.accelerationIncludingGravity.z || 0 } : undefined,
            rotationRate: e.rotationRate ? { alpha: e.rotationRate.alpha, beta: e.rotationRate.beta, gamma: e.rotationRate.gamma } : undefined,
            intervalMs: e.interval
        };

        motionMonitor.record(Date.now());
        options.onSample(createSample(motion));
    };

    const onOrientation = (e: DeviceOrientationEvent) => {
        latestOrientation = {
            alpha: e.alpha,
            beta: e.beta,
            gamma: e.gamma,
            absolute: e.absolute
        };
        orientationMonitor.record(Date.now());
        // Orientation typically updates at the same rate as motion, so we just snapshot it
    };

    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            latestGps = {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed,
                heading: pos.coords.heading,
                altitude: pos.coords.altitude,
                timestamp: pos.timestamp
            };
            gpsMonitor.record(Date.now());
        },
        (err) => console.warn('GPS Collector Error:', err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    window.addEventListener('devicemotion', onMotion, { passive: true });
    window.addEventListener('deviceorientation', onOrientation, { passive: true });

    const healthInterval = setInterval(() => {
        if (options.onHealthUpdate) {
            options.onHealthUpdate({
                motion: motionMonitor.getStats(),
                orientation: orientationMonitor.getStats(),
                gps: gpsMonitor.getStats()
            });
        }
    }, 2000);

    return {
        stop: () => {
            window.removeEventListener('devicemotion', onMotion);
            window.removeEventListener('deviceorientation', onOrientation);
            navigator.geolocation.clearWatch(watchId);
            clearInterval(healthInterval);
        },
        getStats: () => ({
            motion: motionMonitor.getStats(),
            orientation: orientationMonitor.getStats(),
            gps: gpsMonitor.getStats()
        }),
        getLatest: () => ({ gps: latestGps, orientation: latestOrientation })
    };
};
