import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import Plinth from './Plinth.tsx'
import DrillJig, { type DrillJigParams } from './DrillJig.tsx'
import SupportOverlay from './SupportOverlay.tsx'
import CavityGuide, { type CavityGuideMode } from './CavityGuide.tsx'
import HoleGuide, { type HoleGuideMode } from './HoleGuide.tsx'
import FigureGuide, { type FigurePosition } from './FigureGuide.tsx'
import type { TrimSection } from './trimSections.ts'
import type { PlinthParams, SupportParams } from './geometryBuilder.ts'
import { DEFAULT_RAFT_HEIGHT } from '../defaults.ts'

interface ViewportProps {
  plinthParams: PlinthParams
  drillJigParams: DrillJigParams
  supportParams: SupportParams
  cavityGuide: CavityGuideMode | null
  showSupportGuide: boolean
  showSupports: boolean
  figures: { id: number; imagePath: string; position: FigurePosition }[]
  onFigurePositionChange: (id: number, position: FigurePosition) => void
  onFigureLoadingChange: (id: number, loading: boolean) => void
  holeGuide: HoleGuideMode | null
  trimGuide: { sections: TrimSection[]; sectionIndex: number } | null
  baseSegMM: number
  filletSegMM: number
}

export default function Viewport({ plinthParams, drillJigParams, supportParams, cavityGuide, showSupportGuide, showSupports, figures, onFigurePositionChange, onFigureLoadingChange, holeGuide, trimGuide, baseSegMM, filletSegMM }: ViewportProps) {
  const tilt = supportParams.enabled ? (supportParams.plinthAngle * Math.PI) / 180 : 0
  const raise = supportParams.enabled ? (supportParams.raftHeight ?? DEFAULT_RAFT_HEIGHT) + supportParams.raiseBy + (plinthParams.depth / 2) * Math.sin(tilt) : 0


  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }} onMouseDown={(e) => e.preventDefault()}>
      <Canvas
        camera={{ position: [120, 90, 120], fov: 45, near: 1, far: 50000 }}
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
          <Plinth params={plinthParams} baseSegMM={baseSegMM} filletSegMM={filletSegMM} highlightSection={trimGuide ? trimGuide.sectionIndex : null} />
          {drillJigParams.enabled ? (
            <DrillJig shape={plinthParams.shape} plinthParams={plinthParams} jigParams={drillJigParams} baseSegMM={baseSegMM} filletSegMM={filletSegMM} />
          ) : null}
          {cavityGuide ? <CavityGuide params={plinthParams} mode={cavityGuide} /> : null}
          {holeGuide ? <HoleGuide params={plinthParams} mode={holeGuide} /> : null}
          {figures.map((figure) => (
            <FigureGuide
              key={figure.id}
              id={figure.id}
              params={plinthParams}
              imagePath={figure.imagePath}
              position={figure.position}
              onPositionChange={onFigurePositionChange}
              onLoadingChange={onFigureLoadingChange}
            />
          ))}
        </group>

        {supportParams.enabled ? (
          <SupportOverlay shape={plinthParams.shape} plinthParams={plinthParams} supportParams={supportParams} showGuide={showSupportGuide} showMesh={showSupports} baseSegMM={baseSegMM} />
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