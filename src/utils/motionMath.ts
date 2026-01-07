import { AccelerometerData, GyroscopeData, EarthAcceleration } from '../types';

/**
 * Converts degrees to radians.
 */
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Transforms accelerometer data from device frame to earth frame.
 * 
 * Uses the DeviceOrientation specification (Alpha, Beta, Gamma).
 * Rotation order: Z-X'-Y'' (Tait-Bryan)
 */
export const calculateEarthAcceleration = (
    accel: AccelerometerData,
    gyro: GyroscopeData
): EarthAcceleration => {
    const alpha = toRad(gyro.alpha); // Z
    const beta = toRad(gyro.beta);   // X
    const gamma = toRad(gyro.gamma); // Y

    const cA = Math.cos(alpha);
    const sA = Math.sin(alpha);
    const cB = Math.cos(beta);
    const sB = Math.sin(beta);
    const cG = Math.cos(gamma);
    const sG = Math.sin(gamma);

    // Rotation Matrix components based on W3C DeviceOrientation spec
    // (Standard Z-X-Y order)
    const r11 = cA * cG - sA * sB * sG;
    const r12 = -sA * cB;
    const r13 = cA * sG + sA * sB * cG;

    const r21 = sA * cG + cA * sB * sG;
    const r22 = cA * cB;
    const r23 = sA * sG - cA * sB * cG;

    const r31 = -cB * sG;
    const r32 = sB;
    const r33 = cB * cG;

    // Apply matrix to raw accelerometer vector
    const ex = r11 * accel.x + r12 * accel.y + r13 * accel.z;
    const ey = r21 * accel.x + r22 * accel.y + r23 * accel.z;
    const ez = r31 * accel.x + r32 * accel.y + r33 * accel.z;

    return { x: ex, y: ey, z: ez };
};
