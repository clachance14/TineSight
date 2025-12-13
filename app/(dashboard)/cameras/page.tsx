import { CameraList } from '@/components/cameras/camera-list'

export default function CamerasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cream">Cameras</h1>
        <p className="text-cream-dark mt-1">
          Trail cameras detected from your uploaded photos.
        </p>
      </div>
      <CameraList />
    </div>
  )
}
