import type { PlinthParams, SupportParams } from './geometryBuilder.ts'
import type { DrillJigParams } from './DrillJig.tsx'

export function describePlinthSize(params: PlinthParams) {
  const shapeName = params.shape === 'ellipse' ? 'Ellipse' : 'Rectangle'
  return `${shapeName} · ${params.width} × ${params.depth} × ${params.height} mm`
}

export function describePlinthFeatures(params: PlinthParams, jigParams: DrillJigParams, supportParams: SupportParams) {
  const features = [
    params.angleTop ? `${params.topAngle}° top` : 'Flat top',
    params.roundStyle === 'none' ? null : `${params.roundStyle === 'fillet' ? 'Fillet' : 'Chamfer'} ${params.roundSize} mm`,
    params.addHole ? `${params.holeDiameter} mm hole` : 'No hole',
    params.trimEnabled ? 'Trim' : null,
    params.hollowEnabled ? 'Hollow' : null,
    jigParams.enabled ? 'Drill jig' : null,
    supportParams.enabled ? 'Supports' : null,
  ]
  return features.filter((feature) => feature !== null).join(' · ')
}
