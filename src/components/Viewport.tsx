import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import Plinth, { type PlinthParams } from './Plinth.tsx'
import DrillJig, { type DrillJigParams } from './DrillJig.tsx'

interface ViewportProps {
  plinthParams: PlinthParams
  drillJigParams: DrillJigParams
}

export default function Viewport({ plinthParams, drillJigParams }: ViewportProps) {
  return (
    <Canvas
      camera={{ position: [80, 60, 80], fov: 45, near: 0.1, far: 50000 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      shadows
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#0b0d10']} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[60, 80, 40]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-far={400}
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

      <Plinth {...plinthParams} />
      {drillJigParams.enabled ? (
        <DrillJig shape={plinthParams.shape} plinthParams={plinthParams} jigParams={drillJigParams} />
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
  )
}