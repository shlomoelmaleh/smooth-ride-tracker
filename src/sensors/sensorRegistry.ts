
import { CapabilitiesReport, CapabilityStatus } from './sensorTypes';

export const detectCapabilities = async (): Promise<CapabilitiesReport> => {
    const report: CapabilitiesReport = {
        deviceMotion: { supportedByApi: "DeviceMotionEvent" in window, supportedInPractice: false },
        deviceOrientation: { supportedByApi: "DeviceOrientationEvent" in window, supportedInPractice: false },
        gyroscopeRate: { supportedByApi: false, supportedInPractice: false },
        linearAcceleration: { supportedByApi: false, supportedInPractice: false },
        accelerometer: { supportedByApi: false, supportedInPractice: false },
        gps: { supportedByApi: "geolocation" in navigator, supportedInPractice: false, hasSpeed: false, hasAccuracy: false },
        flags: []
    };

    // Perform a 1.5s practice probe
    return new Promise((resolve) => {
        let motionReceived = false;
        let orientReceived = false;
        let gpsReceived = false;

        const onMotion = (e: DeviceMotionEvent) => {
            motionReceived = true;
            if (e.acceleration?.x !== null) report.linearAcceleration.supportedInPractice = true;
            if (e.accelerationIncludingGravity?.x !== null) report.accelerometer.supportedInPractice = true;
            if (e.rotationRate?.alpha !== null) report.gyroscopeRate.supportedInPractice = true;

            report.linearAcceleration.supportedByApi = !!e.acceleration;
            report.accelerometer.supportedByApi = !!e.accelerationIncludingGravity;
            report.gyroscopeRate.supportedByApi = !!e.rotationRate;
        };

        const onOrient = (e: DeviceOrientationEvent) => {
            orientReceived = true;
            if (e.alpha !== null) report.deviceOrientation.supportedInPractice = true;
        };

        window.addEventListener('devicemotion', onMotion);
        window.addEventListener('deviceorientation', onOrient);

        const watchId = navigator.geolocation.watchPosition((pos) => {
            gpsReceived = true;
            report.gps.supportedInPractice = true;
            if (pos.coords.speed !== null) report.gps.hasSpeed = true;
            if (pos.coords.accuracy !== null) report.gps.hasAccuracy = true;
        }, () => { }, { enableHighAccuracy: true, timeout: 1500 });

        setTimeout(() => {
            window.removeEventListener('devicemotion', onMotion);
            window.removeEventListener('deviceorientation', onOrient);
            navigator.geolocation.clearWatch(watchId);

            report.deviceMotion.supportedInPractice = motionReceived;
            report.deviceOrientation.supportedInPractice = orientReceived;

            if (!motionReceived && report.deviceMotion.supportedByApi) report.flags.push('MOTION_API_PRESENT_BUT_NO_DATA');
            if (!gpsReceived && report.gps.supportedByApi) report.flags.push('GPS_UNAVAILABLE_OR_TIMEOUT');

            resolve(report);
        }, 1500);
    });
};

export const requestSensorPermissions = async () => {
    const result = {
        motion: 'prompt' as PermissionState | 'unsupported',
        location: 'prompt' as PermissionState | 'unsupported',
        orientation: 'prompt' as PermissionState | 'unsupported'
    };

    // Motion & Orientation (iOS)
    const motionReq = (DeviceMotionEvent as any).requestPermission;
    if (typeof motionReq === 'function') {
        try {
            result.motion = await motionReq();
        } catch (e) {
            result.motion = 'denied';
        }
    } else {
        result.motion = 'granted'; // Assume auto-grant on non-iOS
    }

    const orientReq = (DeviceOrientationEvent as any).requestPermission;
    if (typeof orientReq === 'function') {
        try {
            result.orientation = await orientReq();
        } catch (e) {
            result.orientation = 'denied';
        }
    } else {
        result.orientation = 'granted';
    }

    // Location
    if (navigator.geolocation) {
        try {
            await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            result.location = 'granted';
        } catch (e) {
            result.location = 'denied';
        }
    } else {
        result.location = 'unsupported';
    }

    return result;
};
