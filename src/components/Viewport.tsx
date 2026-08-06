import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import Plinth, { type PlinthParams } from './Plinth.tsx'
import DrillJig, { type DrillJigParams } from './DrillJig.tsx'
import SupportOverlay from './SupportOverlay.tsx'
import type { SupportParams } from './geometryBuilder.ts'

interface ViewportProps {
  plinthParams: PlinthParams
  drillJigParams: DrillJigParams
  supportParams: SupportParams
  baseSegMM: number
  filletSegMM: number
}

export default function Viewport({ plinthParams, drillJigParams, supportParams, baseSegMM, filletSegMM }: ViewportProps) {
  const tilt = supportParams.enabled ? (supportParams.plinthAngle * Math.PI) / 180 : 0
  const raise = supportParams.enabled ? supportParams.raiseBy : 0

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <Canvas
        camera={{ position: [80, 60, 80], fov: 45, near: 0.1, far: 50000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#0b0d10']} />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[60, 80, 40]}
          intensity={1.1}
        />

        <Grid
          args={[400, 400]}
          cellSize={5}
          cellThickness={0.5}
          cellColor="#2a2f36"
          sectionSize={25}
          sectionThickness={1}
          sectionColor="#3a4150"
          fadeDistance={250}
          fadeStrength={1}
          infiniteGrid
          followCamera={false}
        />

        <group position={[0, raise, 0]} rotation={[tilt, 0, 0]}>
          <Plinth params={plinthParams} baseSegMM={baseSegMM} filletSegMM={filletSegMM} />
          {drillJigParams.enabled ? (
            <DrillJig shape={plinthParams.shape} plinthParams={plinthParams} jigParams={drillJigParams} baseSegMM={baseSegMM} filletSegMM={filletSegMM} />
          ) : null}
        </group>

        {supportParams.enabled ? (
          <SupportOverlay shape={plinthParams.shape} plinthParams={plinthParams} supportParams={supportParams} baseSegMM={baseSegMM} />
        ) : null}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={10}
          maxDistance={5000}
          maxPolarAngle={Math.PI / 2 + 0.3}
        />
        <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
          <GizmoViewport
            axisColors={['#ff6b6b', '#5fff7a', '#5b9bff']}
            labelColor="#0b0d10"
          />
        </GizmoHelper>
      </Canvas>
    </div>
  )
}